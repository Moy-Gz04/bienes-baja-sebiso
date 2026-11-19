// Baja cada ficha vigente (pdf_drive_id) de los bienes con existencia confirmada y las deja en <dir>/<clase>/<inv>.pdf
const fs = require("fs"), path = require("path");
const { neon } = require("./servidor/node_modules/@neondatabase/serverless");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sql = neon(env.DATABASE_URL), DIR = process.argv[2];
(async () => {
  const f = await sql`SELECT x.no_inventario, b.pdf_drive_id, COALESCE(e.clasificacion, b.clasificacion) AS c FROM existencias x JOIN bienes b USING (no_inventario) LEFT JOIN estatus_capturas e USING (no_inventario) ORDER BY x.no_inventario`;
  const cuenta = {}; f.forEach(r => cuenta[r.c] = (cuenta[r.c] || 0) + 1); console.log(cuenta);
  const cola = [...f], mal = [];
  await Promise.all(Array.from({ length: 8 }, async () => { while (cola.length) { const r = cola.shift(); const cl = /baja/i.test(r.c) ? "baja" : /aprovech/i.test(r.c) ? "reap" : "otra"; fs.mkdirSync(path.join(DIR, cl), { recursive: true });
    try { const x = await fetch("https://drive.google.com/uc?export=download&id=" + r.pdf_drive_id, { redirect: "follow", signal: AbortSignal.timeout(60000) }); const b = Buffer.from(await x.arrayBuffer());
      if (!x.ok || b.slice(0, 5).toString() !== "%PDF-") throw new Error("no es PDF " + x.status); fs.writeFileSync(path.join(DIR, cl, r.no_inventario + ".pdf"), b); } catch (e) { mal.push(r.no_inventario + " " + e.message); } } }));
  console.log("errores", mal.length, mal.slice(0, 10));
})();
