// Sube fichas generadas (p/) en paralelo, a partir de un desplazamiento en el orden por no_inventario.
// Uso: node subir_fichas_paralelo.js <desde> [hilos]
const fs = require("fs"), path = require("path"), { neon } = require("@neondatabase/serverless");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sql = neon(env.DATABASE_URL);
const desde = +process.argv[2] || 0, HILOS = +process.argv[3] || 6, LOTE = 8;
async function llamar(cuerpo) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, clave: env.APPS_SCRIPT_FICHAS_CLAVE }), redirect: "follow" });
      const d = await r.json(); if (d.ok) return d; throw new Error(d.error);
    } catch (e) { if (i === 4) throw e; await new Promise(r => setTimeout(r, 3000 * i)); }
  }
}
(async () => {
  const todas = await sql`SELECT no_inventario, pdf FROM bienes WHERE pdf IS NOT NULL AND pdf LIKE 'p/%' ORDER BY no_inventario`;
  const faltan = todas.slice(desde).filter(f => fs.existsSync(path.join(__dirname, "public", f.pdf)));
  console.log(`${faltan.length} fichas por subir (desde ${desde})`);
  let sig = 0, bien = 0, mal = [];
  const trabajador = async () => {
    while (sig < faltan.length) {
      const parte = faltan.slice(sig, sig += LOTE);
      try {
        const d = await llamar({ accion: "guardarVarios", fichas: parte.map(f => ({ no_inventario: f.no_inventario, origen: "Formato oficial generado", pdf_base64: fs.readFileSync(path.join(__dirname, "public", f.pdf)).toString("base64") })) });
        for (const r of d.resultados) { if (r.ok) { await sql`UPDATE bienes SET pdf_drive_id = ${r.id} WHERE no_inventario = ${r.no_inventario}`; bien++; } else mal.push(r.no_inventario + ": " + r.error); }
      } catch (e) { mal.push(...parte.map(f => f.no_inventario + ": " + e.message)); }
      console.log(`Subidas ${bien} de ${faltan.length} (${mal.length} con error)`);
    }
  };
  await Promise.all(Array.from({ length: HILOS }, trabajador));
  console.log(`Listo: ${bien} subidas, ${mal.length} con error`); mal.forEach(x => console.log("  " + x));
})();
