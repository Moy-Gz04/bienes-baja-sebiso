// Sube a Drive (carpeta "Resguardos PDF") los resguardos recién generados (último OK de salida/lote_v2.log) y guarda solo
// su pdf_drive_id en resguardo_pdfs (la BD no guarda archivos). Quita el aviso "PDF por actualizar". Uso: node _resguardos/subir_pdf_drive.js 80,276
const fs = require("fs"), path = require("path");
const { neon } = require(path.join(__dirname, "..", "servidor", "node_modules", "@neondatabase", "serverless"));
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sql = neon(env.DATABASE_URL);
const ids = new Set(String(process.argv[2] || "").split(",").filter(Boolean).map(Number));
const ult = new Map();
for (const l of fs.readFileSync(path.join(__dirname, "salida", "lote_v2.log"), "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  const c = l.split("\t"); if (c[1] === "OK" && ids.has(Number(c[0]))) ult.set(Number(c[0]), c[2]);
}
async function llamar(cuerpo) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, clave: env.APPS_SCRIPT_FICHAS_CLAVE }), redirect: "follow" });
      const d = await r.json(); if (d.ok) return d; throw new Error(d.error);
    } catch (e) { if (i === 4) throw e; await new Promise(r => setTimeout(r, 3000 * i)); }
  }
}
(async () => {
  for (const n of ids) {
    const ruta = ult.get(n); if (!ruta) { console.log(n, "sin PDF en lote_v2.log"); continue; }
    const nombre = path.basename(ruta).replace(/ \(\d+\)\.pdf$/, ".pdf");
    const d = await llamar({ accion: "guardarArchivos", carpeta: "Resguardos PDF", archivos: [{ nombre, mime: "application/pdf", base64: fs.readFileSync(ruta).toString("base64") }] });
    const x = d.resultados[0]; if (!x.ok) { console.log(n, "falló", x.error); continue; }
    await sql`INSERT INTO resguardo_pdfs (persona_id, nombre, pdf_drive_id, cuando) VALUES (${n}, ${nombre}, ${x.id}, now())
      ON CONFLICT (persona_id) DO UPDATE SET nombre = EXCLUDED.nombre, pdf_drive_id = EXCLUDED.pdf_drive_id, cuando = now()`;
    console.log(n, "ok", nombre, x.id);
  }
})();
