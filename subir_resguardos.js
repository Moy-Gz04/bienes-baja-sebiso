// Sube los resguardos PDF generados (_resguardos/salida/lote.log) a Neon (para verlos en el sistema) y a Drive (carpeta por persona).
// Se puede repetir: salta los que ya tienen su carpeta de Drive. Uso: node subir_resguardos.js
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");
const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
const get = (k) => env.match(new RegExp(k + "=(.*)"))[1].trim();
const sql = neon(get("DATABASE_URL"));
const URL_DRIVE = get("APPS_SCRIPT_FICHAS_URL"), CLAVE = get("APPS_SCRIPT_FICHAS_CLAVE");
const log = fs.readFileSync(path.join(__dirname, "_resguardos", "salida", "lote.log"), "utf8").replace(/^﻿/, "").split(/\r?\n/)
  .map(l => l.split("\t")).filter(c => c[1] === "OK").map(c => ({ n: Number(c[0]), ruta: c[2] }));
const ultimos = new Map(); for (const l of log) ultimos.set(l.n, l);

async function drive(cuerpo) {
  let ultimo;
  for (let k = 1; k <= 4; k++) {
    try {
      const r = await fetch(URL_DRIVE, { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow", signal: AbortSignal.timeout(120000), body: JSON.stringify({ ...cuerpo, clave: CLAVE }) });
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch (e) { throw new Error("Apps Script: " + t.slice(0, 100)); }
      if (!d.ok) throw new Error(d.error || "Apps Script falló");
      return d;
    } catch (e) { ultimo = e; await new Promise(r => setTimeout(r, 3000 * k)); }
  }
  throw ultimo;
}

async function una({ n, ruta }) {
  const nombre = path.basename(ruta).replace(/ \(\d+\)\.pdf$/, ".pdf");
  const bytes = fs.readFileSync(ruta);
  const [ya] = await sql`SELECT drive_carpeta FROM resguardo_pdfs WHERE persona_id = ${n}`;
  await sql`INSERT INTO resguardo_pdfs (persona_id, nombre, pdf) VALUES (${n}, ${nombre}, ${bytes})
    ON CONFLICT (persona_id) DO UPDATE SET nombre = EXCLUDED.nombre, pdf = EXCLUDED.pdf, cuando = now()`;
  if (process.env.SIN_DRIVE) return "neon";
  // Drive: una carpeta por persona dentro de "Fichas por inventario" (el Apps Script solo acepta nombres numéricos: 9000000 + n)
  const d = await drive({ accion: "guardarCarpeta", inventario: String(9000000 + n), archivos: [{ nombre, mime: "application/pdf", base64: bytes.toString("base64") }] });
  await sql`UPDATE resguardo_pdfs SET drive_carpeta = ${d.carpeta_id} WHERE persona_id = ${n}`;
  return "drive";
}

(async () => {
  const lista = [...ultimos.values()].sort((a, b) => a.n - b.n);
  const hechos = new Set((await sql`SELECT persona_id FROM resguardo_pdfs WHERE drive_carpeta IS NOT NULL`).map(r => r.persona_id));
  const forzar = new Set(String(process.env.FORZAR || "").split(",").filter(Boolean).map(Number));   // FORZAR=70,90 vuelve a subir esos
  const pend = lista.filter(l => process.env.SIN_DRIVE || forzar.has(l.n) || !hechos.has(l.n));
  console.log(`PDF generados: ${lista.length} · por subir: ${pend.length}`);
  let ok = 0, mal = 0, i = 0;
  const trabajador = async () => {
    while (i < pend.length) {
      const l = pend[i++];
      try { await una(l); ok++; } catch (e) { mal++; console.error("Falló", l.n, e.message); }
      if ((ok + mal) % 20 === 0) console.log(`  ${ok + mal}/${pend.length}`);
    }
  };
  await Promise.all([trabajador(), trabajador(), trabajador()]);
  console.log({ ok, mal });
})();
