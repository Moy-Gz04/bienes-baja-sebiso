// Rehace rápido las fichas pendientes del monitor (ficha_pendiente = true y con existencia confirmada).
// Fase 1: arma los PDF en paralelo y los sube a Drive en lotes (guardarVarios con varias fichas = un solo candado de la hoja).
//         Al subir cada lote marca pdf_drive_id y ficha_pendiente = false.
// Fase 2: rehace las carpetas "Fichas por inventario" (PDF + fotos) de lo subido; pendientes en _carpetas_pend.txt.
// Uso: node _rehacer_rapido.js [lote=8] [subidas_a_la_vez=6]   ·   node _rehacer_rapido.js --carpetas [a_la_vez=10]
const fs = require("fs"), path = require("path");
const { neon } = require("./servidor/node_modules/@neondatabase/serverless");
const { fichaPdf } = require("./servidor/ficha-pdf");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sql = neon(env.DATABASE_URL);
const FRONT = "https://bienes-baja-sebiso.netlify.app/";
const CARPETAS = path.join(__dirname, "_carpetas_pend.txt"), LOG = path.join(__dirname, "_rehacer_rapido.log");
const log = (t) => { const l = `${new Date().toLocaleTimeString("es-MX")} ${t}`; fs.appendFileSync(LOG, l + "\n"); console.log(l); };
const urlDrive = id => "https://lh3.googleusercontent.com/d/" + id + "=w1400";
let limite = false;

async function bajar(url) { const r = await fetch(url, { headers: { Accept: "image/jpeg,image/png" }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`Foto ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function appsScript(cuerpo, tiempo = 300000) {
  let ultimo;
  for (let k = 1; k <= 3; k++) {
    try {
      const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow", signal: AbortSignal.timeout(tiempo), body: JSON.stringify({ ...cuerpo, clave: env.APPS_SCRIPT_FICHAS_CLAVE }) });
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch (e) { throw new Error("Apps Script: " + t.slice(0, 120)); }
      if (!d.ok) throw new Error(d.error || "Apps Script falló");
      return d;
    } catch (e) { ultimo = e; if (/L[ií]mite/i.test(e.message)) { limite = true; throw e; } await new Promise(r => setTimeout(r, 3000 * k)); }
  }
  throw ultimo;
}
async function fotosDe(inv) {
  const origen = await sql`SELECT f.ruta, COALESCE('https://lh3.googleusercontent.com/d/' || d.drive_id || '=w1400', ${FRONT} || f.ruta) AS url FROM fotos f
    LEFT JOIN fotos_drive d ON d.nombre = substring(f.ruta from '[^/]+$') WHERE f.no_inventario = ${inv} ORDER BY f.orden LIMIT 3`;
  const local = (o) => path.join(__dirname, "public", o.ruta);
  return origen.length
    ? Promise.all(origen.map(o => fs.existsSync(local(o)) ? fs.readFileSync(local(o)) : bajar(o.url).catch(() => null)))
    : Promise.all((await sql`SELECT drive_id FROM fotos_capturadas WHERE no_inventario = ${inv} ORDER BY orden LIMIT 3`).map(f => bajar(urlDrive(f.drive_id)).catch(() => null)));
}
async function armar(inv) {
  const [b] = await sql`SELECT b.*, to_char(b.fecha_adquisicion, 'YYYY-MM-DD') AS fecha_adquisicion, fc.datos AS fc_datos FROM bienes b LEFT JOIN ficha_capturas fc USING (no_inventario) WHERE b.no_inventario = ${inv}`;
  return { inv, pdf: await fichaPdf({ ...b, ...(b.fc_datos || {}) }, await fotosDe(inv)) };
}
const pool = async (items, n, fn) => { const cola = [...items]; await Promise.all(Array.from({ length: n }, async () => { while (cola.length && !limite) await fn(cola.shift()); })); };

async function fase1(LOTE, PAR) {
  const pend = (await sql`SELECT b.no_inventario FROM existencias x JOIN bienes b USING (no_inventario) WHERE b.ficha_pendiente ORDER BY x.cuando DESC`).map(x => x.no_inventario);
  log(`fase 1: ${pend.length} fichas pendientes · lotes de ${LOTE} · ${PAR} subidas a la vez`);
  const lotes = []; for (let i = 0; i < pend.length; i += LOTE) lotes.push(pend.slice(i, i + LOTE));
  let hechas = 0; const fallas = [];
  await pool(lotes, PAR, async (lote) => {
    try {
      const armadas = (await Promise.all(lote.map(inv => armar(inv).catch(e => { fallas.push(`${inv}: ${e.message}`); return null; })))).filter(Boolean);
      if (!armadas.length) return;
      const d = await appsScript({ accion: "guardarVarios", fichas: armadas.map(a => ({ no_inventario: a.inv, pdf_base64: a.pdf.toString("base64"), origen: "sistema" })) });
      const ok = (d.resultados || []).filter(r => r.ok && r.id);
      for (const r of ok) await sql`UPDATE bienes SET pdf_drive_id = ${r.id}, ficha_pendiente = false WHERE no_inventario = ${r.no_inventario}`;
      (d.resultados || []).filter(r => !r.ok).forEach(r => fallas.push(`${r.no_inventario}: ${r.error}`));
      fs.appendFileSync(CARPETAS, ok.map(r => r.no_inventario).join("\n") + "\n");
      hechas += ok.length; log(`subidas ${hechas}/${pend.length}`);
    } catch (e) { if (!limite) fallas.push(`lote ${lote[0]}…: ${e.message}`); }
  });
  log(`fase 1 terminó: ${hechas} subidas, ${fallas.length} con error${limite ? " · LÍMITE DE DRIVE" : ""}`); fallas.slice(0, 20).forEach(f => log("  error " + f));
}
async function fase2(PAR) {
  if (!fs.existsSync(CARPETAS)) return;
  const pend = [...new Set(fs.readFileSync(CARPETAS, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
  log(`fase 2: ${pend.length} carpetas`);
  const hechos = new Set(); let n = 0;
  await pool(pend, PAR, async (inv) => {
    try {
      const { pdf } = await armar(inv), fotos = await fotosDe(inv);
      const archivos = fotos.map((f, i) => f && { nombre: `${inv} img ${i + 1}.jpg`, mime: f[0] === 0x89 ? "image/png" : "image/jpeg", base64: f.toString("base64") }).filter(Boolean);
      archivos.push({ nombre: `FICHA_${inv}.pdf`, mime: "application/pdf", base64: pdf.toString("base64") });
      await appsScript({ accion: "guardarCarpeta", inventario: inv, archivos });
      hechos.add(inv); if (++n % 25 === 0) { fs.writeFileSync(CARPETAS, pend.filter(x => !hechos.has(x)).join("\n") + "\n"); log(`carpetas ${n}/${pend.length}`); }
    } catch (e) { if (!limite) log(`  error carpeta ${inv}: ${e.message}`); }
  });
  const quedan = pend.filter(x => !hechos.has(x));
  fs.writeFileSync(CARPETAS, quedan.length ? quedan.join("\n") + "\n" : "");
  log(`fase 2 terminó: ${n} carpetas, quedan ${quedan.length}${limite ? " · LÍMITE DE DRIVE" : ""}`);
}
(async () => {
  if (process.argv[2] === "--carpetas") return fase2(+process.argv[3] || 10);
  await fase1(+process.argv[2] || 8, +process.argv[3] || 6);
  if (!limite) await fase2(10);
})().catch(e => { log("FALLO " + e.message); process.exit(1); });
