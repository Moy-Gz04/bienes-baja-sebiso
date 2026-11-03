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
// Candado: la tarea programada corre cada 30 min; si sigue una corrida anterior (menos de 3 h), no arranca otra
const CANDADO = path.join(__dirname, "subida.lock");
try {
  if (fs.existsSync(CANDADO) && Date.now() - fs.statSync(CANDADO).mtimeMs < 3 * 3600000) { console.log("Ya hay una subida en curso."); process.exit(0); }
  fs.writeFileSync(CANDADO, String(process.pid));
  process.on("exit", () => { try { fs.unlinkSync(CANDADO); } catch (e) { /* ya no estaba */ } });
} catch (e) { /* sin candado se sigue igual */ }
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
  const origen = (f) => (f.pdf.startsWith("q/") ? "FT-PAG Nueva (escaneada)" : "Formato oficial generado");
  const listas = filas.filter(f => fs.existsSync(path.join(__dirname, "public", f.pdf)) || (fallas.push(`${f.no_inventario}: no existe ${f.pdf}`), false));
  // Lotes: el Apps Script guarda varias fichas en una sola ejecución (acción guardarVarios)
  const LOTE = 20;
  let porLotes = true;
  for (let i = 0; i < listas.length; ) {
    const parte = porLotes ? listas.slice(i, i + LOTE) : [listas[i]];
    try {
      if (porLotes) {
        const d = await llamar({ accion: "guardarVarios", fichas: parte.map(f => ({ no_inventario: f.no_inventario, origen: origen(f), pdf_base64: fs.readFileSync(path.join(__dirname, "public", f.pdf)).toString("base64") })) });
        for (const r of d.resultados) {
          if (r.ok) { await sql`UPDATE bienes SET pdf_drive_id = ${r.id} WHERE no_inventario = ${r.no_inventario}`; bien++; }
          else fallas.push(`${r.no_inventario}: ${r.error}`);
        }
      } else {
        const f = parte[0];
        const d = await llamar({ accion: "guardar", no_inventario: f.no_inventario, origen: origen(f), pdf_base64: fs.readFileSync(path.join(__dirname, "public", f.pdf)).toString("base64") });
        await sql`UPDATE bienes SET pdf_drive_id = ${d.id} WHERE no_inventario = ${f.no_inventario}`; bien++;
      }
      console.log(`Subidas ${bien} de ${filas.length}`);
    } catch (e) {
      if (porLotes && /no reconocida/i.test(e.message)) { console.log("El Apps Script aún no tiene la subida por lotes: sigo de una en una"); porLotes = false; continue; }
      parte.forEach(f => fallas.push(`${f.no_inventario}: ${e.message}`));
    }
    i += parte.length;
  }
  console.log(`Listo: ${bien} subidas, ${fallas.length} con error`);
  fallas.forEach(x => console.log("  " + x));
})();
