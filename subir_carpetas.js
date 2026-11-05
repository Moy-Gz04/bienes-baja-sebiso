// Sube _carpetas_tmp/<inv>/ a Drive ("Fichas por inventario/<inv>") con la acción guardarCarpeta del Apps Script.
// Reanudable: data/carpetas_subidas.json guarda los ya subidos. Uso: node subir_carpetas.js [paralelo=8]
const fs = require("fs");
const path = require("path");
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const DIR = path.join(__dirname, "_carpetas_tmp");
const HECHOS = path.join(__dirname, "data", "carpetas_subidas.json");
const PAR = +process.argv[2] || 8;
const hechos = new Set(fs.existsSync(HECHOS) ? JSON.parse(fs.readFileSync(HECHOS, "utf8")) : []);
const guardar = () => fs.writeFileSync(HECHOS, JSON.stringify([...hechos]));
async function llamar(cuerpo) {
  const r = await fetch(env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, clave: env.APPS_SCRIPT_FICHAS_CLAVE }), redirect: "follow" });
  const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { ok: false, error: t.slice(0, 200) }; }
}
(async () => {
  const prueba = await llamar({ accion: "guardarCarpeta" });
  if (!prueba.ok && /no reconocida/i.test(prueba.error || "")) { console.log("FALTA publicar guardarCarpeta en el Apps Script"); process.exit(2); }
  const pend = fs.readdirSync(DIR).filter(i => !hechos.has(i) && fs.existsSync(path.join(DIR, i, `FICHA_${i}.pdf`)));
  console.log(`${pend.length} carpetas por subir`);
  const fallas = []; let n = 0;
  const trabajador = async () => {
    while (pend.length) {
      const inv = pend.shift();
      const archivos = fs.readdirSync(path.join(DIR, inv)).sort().map(nombre => ({ nombre, mime: nombre.endsWith(".pdf") ? "application/pdf" : "image/jpeg", base64: fs.readFileSync(path.join(DIR, inv, nombre)).toString("base64") }));
      let d;
      for (let k = 1; k <= 3; k++) { try { d = await llamar({ accion: "guardarCarpeta", inventario: inv, archivos }); } catch (e) { d = { ok: false, error: e.message }; } if (d.ok) break; await new Promise(r => setTimeout(r, 3000 * k)); }
      if (d.ok) { hechos.add(inv); if (++n % 20 === 0) { guardar(); console.log(`Subidas ${n}`); } } else fallas.push(`${inv}: ${d.error}`);
    }
  };
  await Promise.all(Array.from({ length: PAR }, trabajador));
  guardar();
  console.log(`Listo: ${n} subidas, ${fallas.length} con error`); fallas.forEach(x => console.log("  " + x));
})();
