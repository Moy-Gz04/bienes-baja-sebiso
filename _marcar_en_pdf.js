// Marca en fichas_en_pdf los inventarios que quedaron en los PDF "FICHAS NUEVAS" (lista.json: {baja:[],reap:[]})
const fs = require("fs"), path = require("path");
const { neon } = require("./servidor/node_modules/@neondatabase/serverless");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sql = neon(env.DATABASE_URL);
(async () => {
  await sql`CREATE TABLE IF NOT EXISTS fichas_en_pdf (no_inventario TEXT PRIMARY KEY, lote TEXT, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const l = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); const todos = [...l.baja, ...l.reap];
  await sql`INSERT INTO fichas_en_pdf (no_inventario, lote) SELECT unnest(${todos}::text[]), 'NUEVAS FICHAS 2026-11-19' ON CONFLICT (no_inventario) DO NOTHING`;
  console.log((await sql`SELECT count(*)::int n FROM fichas_en_pdf`)[0].n, "marcadas");
})();
