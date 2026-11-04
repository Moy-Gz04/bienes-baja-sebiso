// Sube a Drive (subcarpeta "Fotos", visibles con el enlace) las fotos de public/f que aún no están allá y
// guarda en Neon su ID (tabla fotos_drive). El servidor entrega entonces la foto desde Google, no desde Netlify.
// Uso: node subir_fotos.js
const fs = require("fs"), path = require("path"), { neon } = require("@neondatabase/serverless");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = neon(env.DATABASE_URL);
async function llamar(cuerpo) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, clave: env.APPS_SCRIPT_FICHAS_CLAVE }), redirect: "follow" });
      const d = await r.json(); if (d.ok) return d; throw new Error(d.error);
    } catch (e) { if (i === 3) throw e; await new Promise(r => setTimeout(r, 3000 * i)); }
  }
}
(async () => {
  await sql`CREATE TABLE IF NOT EXISTS fotos_drive (nombre TEXT PRIMARY KEY, drive_id TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const ya = new Set((await sql`SELECT nombre FROM fotos_drive`).map(r => r.nombre));
  const usadas = (await sql`SELECT ruta FROM fotos`).map(r => path.basename(r.ruta)).filter(n => !ya.has(n));
  const faltan = [...new Set(usadas)];
  console.log(`${faltan.length} fotos por subir`);
  let hechas = 0, mal = 0;
  for (let i = 0; i < faltan.length; i += 8) {
    const parte = faltan.slice(i, i + 8);
    try {
      const d = await llamar({ accion: "guardarFotos", fotos: parte.map(n => ({ nombre: n, jpg_base64: fs.readFileSync(path.join(__dirname, "public", "f", n)).toString("base64") })) });
      for (const r of d.resultados) {
        if (r.ok) { await sql`INSERT INTO fotos_drive (nombre, drive_id) VALUES (${r.nombre}, ${r.id}) ON CONFLICT (nombre) DO UPDATE SET drive_id = EXCLUDED.drive_id`; hechas++; }
        else { mal++; console.error(r.nombre, r.error); }
      }
    } catch (e) { mal += parte.length; console.error("lote falló:", e.message); }
    console.log(`${hechas + mal} de ${faltan.length} (${mal} con error)`);
  }
})();
