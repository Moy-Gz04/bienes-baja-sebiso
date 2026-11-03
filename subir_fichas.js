// Sube el PDF de la ficha técnica de cada bien al Apps Script (Drive + hoja "Fichas") y guarda en Neon
// el ID de Drive de cada uno (bienes.pdf_drive_id). Solo sube los que faltan; con --todas vuelve a subir todo.
// Uso: node subir_fichas.js [--todas]
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
for (const k of ["DATABASE_URL", "APPS_SCRIPT_FICHAS_URL", "APPS_SCRIPT_FICHAS_CLAVE"]) {
  if (!env[k]) { console.error(`Falta ${k} en .env (ver instrucciones en apps-script-fichas.gs)`); process.exit(1); }
}
const sql = neon(env.DATABASE_URL);
const todas = process.argv.includes("--todas");

async function llamar(cuerpo) {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, clave: env.APPS_SCRIPT_FICHAS_CLAVE }), redirect: "follow" });
      const d = await r.json();
      if (d.ok) return d;
      throw new Error(d.error);
    } catch (e) {
      if (intento === 3) throw e;
      await new Promise(r => setTimeout(r, 2000 * intento));
    }
  }
}

(async () => {
  await sql`ALTER TABLE bienes ADD COLUMN IF NOT EXISTS pdf_drive_id TEXT`;
  const filas = todas ? await sql`SELECT no_inventario, pdf FROM bienes WHERE pdf IS NOT NULL ORDER BY no_inventario`
    : await sql`SELECT no_inventario, pdf FROM bienes WHERE pdf IS NOT NULL AND pdf_drive_id IS NULL ORDER BY no_inventario`;
  console.log(`${filas.length} fichas por subir`);
  let bien = 0; const fallas = [];
  for (const f of filas) {
    const ruta = path.join(__dirname, "public", f.pdf);
    if (!fs.existsSync(ruta)) { fallas.push(`${f.no_inventario}: no existe ${f.pdf}`); continue; }
    try {
      const d = await llamar({ accion: "guardar", no_inventario: f.no_inventario, origen: f.pdf.startsWith("q/") ? "FT-PAG Nueva (escaneada)" : "Formato oficial generado", pdf_base64: fs.readFileSync(ruta).toString("base64") });
      await sql`UPDATE bienes SET pdf_drive_id = ${d.id} WHERE no_inventario = ${f.no_inventario}`;
      bien++;
      if (bien % 25 === 0) console.log(`Subidas ${bien} de ${filas.length}`);
    } catch (e) { fallas.push(`${f.no_inventario}: ${e.message}`); }
  }
  console.log(`Listo: ${bien} subidas, ${fallas.length} con error`);
  fallas.forEach(x => console.log("  " + x));
})();
