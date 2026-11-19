// Carga en Neon las computadoras de cada persona (resguardo_computadoras) y sube a Drive ("Resguardos computadoras")
// el PDF escaneado de su resguardo (resguardo_compu_pdfs guarda solo el drive_id). Sale de computadoras.json (armar.py).
// Uso: node _resguardos/computadoras/subir.js            → carga datos y sube los PDF que falten
//      FORZAR=1 node ...                                 → vuelve a subir todos los PDF
const fs = require("fs"), path = require("path");
const raiz = path.join(__dirname, "..", "..");
const { neon } = require(path.join(raiz, "servidor", "node_modules", "@neondatabase", "serverless"));
const env = Object.fromEntries(fs.readFileSync(path.join(raiz, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sql = neon(env.DATABASE_URL);
const SAL = path.join(process.env.USERPROFILE, "Downloads", "Resguardos computadoras por persona");
const { computadoras, pdfs } = JSON.parse(fs.readFileSync(path.join(__dirname, "computadoras.json"), "utf8"));
async function llamar(cuerpo) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, clave: env.APPS_SCRIPT_FICHAS_CLAVE }), redirect: "follow" });
      const d = await r.json(); if (d.ok) return d; throw new Error(d.error);
    } catch (e) { if (i === 4) throw e; await new Promise(r => setTimeout(r, 3000 * i)); }
  }
}
(async () => {
  await sql`CREATE TABLE IF NOT EXISTS resguardo_computadoras (no_inventario TEXT PRIMARY KEY, persona_id INT NOT NULL, descripcion TEXT, marca TEXT, modelo TEXT, serie TEXT, hojas INT[])`;
  await sql`CREATE TABLE IF NOT EXISTS resguardo_compu_pdfs (persona_id INT PRIMARY KEY, nombre TEXT NOT NULL, pdf_drive_id TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql.transaction([sql`DELETE FROM resguardo_computadoras`, ...computadoras.map(c =>
    sql`INSERT INTO resguardo_computadoras VALUES (${c.inv}, ${c.persona_id}, ${c.desc}, ${c.marca}, ${c.modelo}, ${c.serie}, ${c.hojas})`)]);
  console.log("computadoras cargadas:", computadoras.length);
  const ya = new Set(process.env.FORZAR ? [] : (await sql`SELECT persona_id FROM resguardo_compu_pdfs`).map(r => r.persona_id));
  let n = 0;
  for (const p of pdfs) {
    if (ya.has(p.persona_id)) continue;
    const nombre = p.archivo.replace(/ \(\d+\)\.pdf$/, ".pdf");
    const d = await llamar({ accion: "guardarArchivos", carpeta: "Resguardos computadoras", archivos: [{ nombre, mime: "application/pdf", base64: fs.readFileSync(path.join(SAL, p.archivo)).toString("base64") }] });
    const x = d.resultados[0]; if (!x.ok) { console.log(p.persona_id, "falló", x.error); continue; }
    await sql`INSERT INTO resguardo_compu_pdfs (persona_id, nombre, pdf_drive_id) VALUES (${p.persona_id}, ${nombre}, ${x.id})
      ON CONFLICT (persona_id) DO UPDATE SET nombre = EXCLUDED.nombre, pdf_drive_id = EXCLUDED.pdf_drive_id, cuando = now()`;
    n++; if (n % 20 === 0) console.log("PDF subidos:", n);
  }
  console.log("PDF subidos:", n, "de", pdfs.length - ya.size);
})().catch(e => { console.error(e); process.exit(1); });
