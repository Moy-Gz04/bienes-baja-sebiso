// Exporta las fotos tomadas desde el celular (Neon, tabla fotos_capturadas) a public/c/<inv>_<orden>.jpg
// y escribe data/fotos_capturadas.json {inventario: ["c/<inv>_1.jpg", ...]} para generar_fichas.py.
// Uso: node exportar_capturadas.js
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");
const sql = neon(fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/DATABASE_URL=(.*)/)[1].trim());
const DIR = path.join(__dirname, "public", "c");
(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const claves = await sql`SELECT no_inventario, orden FROM fotos_capturadas ORDER BY no_inventario, orden`;
  const mapa = {};
  for (const { no_inventario: inv, orden } of claves) {
    const [r] = await sql`SELECT imagen FROM fotos_capturadas WHERE no_inventario = ${inv} AND orden = ${orden}`;
    let img = r.imagen;
    if (typeof img === "string") img = Buffer.from(img.replace(/^\x/, ""), "hex"); else img = Buffer.from(img);
    const nombre = `${inv}_${orden}.jpg`;
    fs.writeFileSync(path.join(DIR, nombre), img);
    (mapa[inv] = mapa[inv] || []).push("c/" + nombre);
  }
  fs.writeFileSync(path.join(__dirname, "data", "fotos_capturadas.json"), JSON.stringify(mapa, null, 0));
  console.log(`${claves.length} fotos de ${Object.keys(mapa).length} bienes exportadas`);
})().catch(e => { console.error(e); process.exit(1); });
