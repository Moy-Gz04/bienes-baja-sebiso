// Rehace fichas con la misma lógica que el servidor (generarFicha) para la lista de un archivo (un inventario por línea).
// Quita de la lista cada ficha que sube; si Drive da "Límite Excedido" se detiene y deja el resto.
// Uso: node _rehacer_fichas.js <lista.txt> [paralelo=3]  ·  node _rehacer_fichas.js --muestra <inv>  (PDF a Descargas, sin subir)
const fs = require("fs"), path = require("path"), os = require("os");
const { neon } = require("./servidor/node_modules/@neondatabase/serverless");
const { fichaPdf } = require("./servidor/ficha-pdf");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sql = neon(env.DATABASE_URL);
const FRONT = "https://bienes-baja-sebiso.netlify.app/";
const urlDrive = id => "https://lh3.googleusercontent.com/d/" + id + "=w1400";
async function bajar(url) { const r = await fetch(url, { headers: { Accept: "image/jpeg,image/png" }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`Foto ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function appsScript(cuerpo) {
  let ultimo;
  for (let k = 1; k <= 3; k++) {
    try {
      const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow", signal: AbortSignal.timeout(180000), body: JSON.stringify({ ...cuerpo, clave: env.APPS_SCRIPT_FICHAS_CLAVE }) });
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch (e) { throw new Error("Apps Script: " + t.slice(0, 120)); }
      if (!d.ok) throw new Error(d.error || "Apps Script falló");
      return d;
    } catch (e) { ultimo = e; if (/L[ií]mite/i.test(e.message)) throw e; await new Promise(r => setTimeout(r, 3000 * k)); }
  }
  throw ultimo;
}
async function armar(inv) {
  const [b] = await sql`SELECT b.*, to_char(b.fecha_adquisicion, 'YYYY-MM-DD') AS fecha_adquisicion, fc.datos AS fc_datos FROM bienes b LEFT JOIN ficha_capturas fc USING (no_inventario) WHERE b.no_inventario = ${inv}`;
  if (!b) throw new Error("no existe");
  const origen = await sql`SELECT f.ruta, COALESCE('https://lh3.googleusercontent.com/d/' || d.drive_id || '=w1400', ${FRONT} || f.ruta) AS url FROM fotos f
    LEFT JOIN fotos_drive d ON d.nombre = substring(f.ruta from '[^/]+$') WHERE f.no_inventario = ${inv} ORDER BY f.orden LIMIT 3`;
  const local = (o) => path.join(__dirname, "public", o.ruta);
  const fotos = (origen.length
    ? await Promise.all(origen.map(o => fs.existsSync(local(o)) ? fs.readFileSync(local(o)) : bajar(o.url).catch(() => null)))
    : await Promise.all((await sql`SELECT drive_id FROM fotos_capturadas WHERE no_inventario = ${inv} ORDER BY orden LIMIT 3`).map(f => bajar(urlDrive(f.drive_id)).catch(() => null))));
  return { pdf: await fichaPdf({ ...b, ...(b.fc_datos || {}) }, fotos), fotos };
}
async function generar(inv) {
  const { pdf, fotos } = await armar(inv);
  const d = await appsScript({ accion: "guardarVarios", fichas: [{ no_inventario: inv, pdf_base64: pdf.toString("base64"), origen: "sistema" }] });
  const r = (d.resultados || [])[0]; if (!r || !r.ok || !r.id) throw new Error((r && r.error) || "Drive no devolvió el id");
  await sql`UPDATE bienes SET pdf_drive_id = ${r.id}, ficha_pendiente = false WHERE no_inventario = ${inv}`;
  const archivos = fotos.map((f, i) => f && { nombre: `${inv} img ${i + 1}.jpg`, mime: f[0] === 0x89 ? "image/png" : "image/jpeg", base64: f.toString("base64") }).filter(Boolean);
  archivos.push({ nombre: `FICHA_${inv}.pdf`, mime: "application/pdf", base64: pdf.toString("base64") });
  await appsScript({ accion: "guardarCarpeta", inventario: inv, archivos });
}
(async () => {
  if (process.argv[2] === "--muestra") { const { pdf } = await armar(process.argv[3]); const s = path.join(os.homedir(), "Downloads", `FICHA_${process.argv[3]}_muestra.pdf`); fs.writeFileSync(s, pdf); return console.log(s); }
  const LISTA = process.argv[2], PAR = +process.argv[3] || 3, LOG = LISTA.replace(/\.txt$/, "") + ".log";
  const log = (t) => fs.appendFileSync(LOG, `${new Date().toISOString().slice(0, 19).replace("T", " ")} ${t}\n`);
  const pend = fs.readFileSync(LISTA, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const hechos = new Set(), fallas = []; let limite = false, n = 0;
  const guardar = () => fs.writeFileSync(LISTA, pend.filter(x => !hechos.has(x)).join("\n"));
  const cola = [...pend];
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (cola.length && !limite) {
      const inv = cola.shift();
      try { await generar(inv); hechos.add(inv); if (++n % 20 === 0) { guardar(); log(`subidas ${n}`); } }
      catch (e) { if (/L[ií]mite/i.test(e.message)) limite = true; else fallas.push(`${inv}: ${e.message}`); }
    }
  }));
  guardar();
  const quedan = pend.length - hechos.size;
  log(`corrida: ${n} subidas, ${fallas.length} con error, quedan ${quedan}${limite ? " (límite de Drive)" : ""}`); fallas.forEach(f => log("  error " + f));
  console.log(limite ? "LIMITE" : quedan ? "QUEDAN" : "TERMINADO", n, quedan, fallas.slice(0, 5));
})().catch(e => { console.error(e); process.exit(1); });
