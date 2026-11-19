// Rehace con el formato nuevo las fichas que siguen firmadas (escaneadas) de los bienes con existencia confirmada. Sin tocar carpetas.
const fs = require("fs"), path = require("path");
const { neon } = require("./servidor/node_modules/@neondatabase/serverless");
const { fichaPdf } = require("./servidor/ficha-pdf");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sql = neon(env.DATABASE_URL);
const FRONT = "https://bienes-baja-sebiso.netlify.app/";
const bajar = async url => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error("Foto " + r.status); return Buffer.from(await r.arrayBuffer()); };
async function fotosDe(inv) {
  const o = await sql`SELECT f.ruta, COALESCE('https://lh3.googleusercontent.com/d/' || d.drive_id || '=w1400', ${FRONT} || f.ruta) AS url FROM fotos f LEFT JOIN fotos_drive d ON d.nombre = substring(f.ruta from '[^/]+$') WHERE f.no_inventario = ${inv} ORDER BY f.orden LIMIT 3`;
  const loc = x => path.join(__dirname, "public", x.ruta);
  return o.length ? Promise.all(o.map(x => fs.existsSync(loc(x)) ? fs.readFileSync(loc(x)) : bajar(x.url).catch(() => null)))
    : Promise.all((await sql`SELECT drive_id FROM fotos_capturadas WHERE no_inventario = ${inv} ORDER BY orden LIMIT 3`).map(f => bajar("https://lh3.googleusercontent.com/d/" + f.drive_id + "=w1400").catch(() => null)));
}
(async () => {
  const invs = (await sql`SELECT b.no_inventario FROM existencias x JOIN bienes b USING (no_inventario) JOIN fichas_firmadas ff USING (no_inventario) WHERE ff.drive_id = b.pdf_drive_id`).map(r => r.no_inventario);
  console.log("firmadas:", invs.length);
  const fichas = [];
  for (const inv of invs) {
    const [b] = await sql`SELECT b.*, to_char(b.fecha_adquisicion, 'YYYY-MM-DD') AS fecha_adquisicion, fc.datos AS fc_datos FROM bienes b LEFT JOIN ficha_capturas fc USING (no_inventario) WHERE b.no_inventario = ${inv}`;
    fichas.push({ no_inventario: inv, pdf_base64: (await fichaPdf({ ...b, ...(b.fc_datos || {}) }, await fotosDe(inv))).toString("base64"), origen: "sistema" });
  }
  const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow", body: JSON.stringify({ accion: "guardarVarios", fichas, clave: env.APPS_SCRIPT_FICHAS_CLAVE }) });
  const d = await r.json(); if (!d.ok) throw new Error(d.error);
  let ok = 0; for (const x of d.resultados) { if (x.ok && x.id) { await sql`UPDATE bienes SET pdf_drive_id = ${x.id}, ficha_pendiente = false WHERE no_inventario = ${x.no_inventario}`; ok++; } else console.log("error", x.no_inventario, x.error); }
  console.log("rehechas", ok, "de", invs.length);
})().catch(e => { console.error("FALLO", e.message); process.exit(1); });
