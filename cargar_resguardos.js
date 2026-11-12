// Carga los resguardos de Mobiliario Nuevo Edificio (_resguardos/personas.json + _resguardos/fotos/) en Neon.
// Origen: "BASE DE DATOS SEBISO a LIMPIAR.xlsm" (extraído con _resguardos/extraer.py). Se puede repetir: reemplaza todo el apartado.
// Uso: node cargar_resguardos.js
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");
const sql = neon(fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/DATABASE_URL=(.*)/)[1].trim());
const DIR = path.join(__dirname, "_resguardos");
const personas = JSON.parse(fs.readFileSync(path.join(DIR, "personas.json"), "utf8"));

const SECCIONES = {
  "COORDINACION ADM": "Coordinación Administrativa", "SUB INT Y CONT DE INF": "Subdirección de Integración y Control de la Información", "INFORMATICA": "Informática",
  "HUMANOS": "Recursos Humanos", "AUDITORIAS": "Auditorías", "MATERIALES": "Recursos Materiales", "FINANCIEROS": "Recursos Financieros",
  "DESPACHO": "Despacho", "SUB INCLUSION Y DESA": "Subsecretaría de Inclusión y Desarrollo", "SUB DES SOC Y HUM": "Subsecretaría de Desarrollo Social y Humano",
  "SUBSE PART SOC Y FOM ART": "Subsecretaría de Participación Social y Fomento Artesanal", "DIRECCION GEN FOM ART": "Dirección General de Fomento Artesanal",
  "DIR GEN SERV PUEBLO": "Dirección General de Servidores del Pueblo", "LOGISTICA": "Operación y Logística de Programas", "DISCAPACIDAD": "Inclusión para las Personas con Discapacidad",
  "MIGRANTES": "Atención al Migrante", "JURIDICO": "Asistencia, Atención y Protección", "DIR PROS, PLA, EVA, PROG, SOCIA": "Prospectiva, Planeación y Evaluación",
  "OIC": "Órgano Interno de Control", "VERIFICENTROS": "Verificentros", "CONTACT CENTER": "Contact Center", "JUVETUD": "Instituto Hidalguense de la Juventud",
};
const MIN = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "para", "a", "por", "con", "al"]);
const titulo = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).map((w, i) => {
  if (/\./.test(w) || /^[IVX]+$/.test(w)) return w.toUpperCase();          // MTRO. / L.A.P. / II
  const m = w.toLowerCase();
  return i > 0 && MIN.has(m) ? m : m.replace(/(^|[-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}).join(" ");
const AREAS = [...new Set(personas.map(p => p.area))];

(async () => {
  await sql`CREATE TABLE IF NOT EXISTS resguardo_personas (id INT PRIMARY KEY, orden INT NOT NULL, area TEXT NOT NULL, area_orden INT NOT NULL, seccion TEXT NOT NULL,
    nombre TEXT NOT NULL, vacante BOOLEAN NOT NULL DEFAULT FALSE, cargo TEXT, jefe TEXT, foto BYTEA)`;
  await sql`CREATE TABLE IF NOT EXISTS resguardo_bienes (id SERIAL PRIMARY KEY, persona_id INT NOT NULL REFERENCES resguardo_personas ON DELETE CASCADE, orden INT NOT NULL,
    no_inventario TEXT NOT NULL, tipo TEXT, modelo TEXT, descripcion TEXT, serie TEXT, observaciones TEXT)`;
  await sql`CREATE INDEX IF NOT EXISTS resguardo_bienes_persona ON resguardo_bienes (persona_id)`;
  await sql`DELETE FROM resguardo_personas`;
  for (const p of personas) {
    const foto = p.foto ? fs.readFileSync(path.join(DIR, "fotos", p.foto)) : null;
    await sql`INSERT INTO resguardo_personas (id, orden, area, area_orden, seccion, nombre, vacante, cargo, jefe, foto) VALUES
      (${p.n}, ${p.n}, ${titulo(p.area)}, ${AREAS.indexOf(p.area)}, ${SECCIONES[p.hoja] || titulo(p.hoja)}, ${p.vacante ? "Vacante " + p.nombre_completo.replace(/\D/g, "") : titulo(p.nombre_completo)},
       ${p.vacante}, ${titulo(p.cargo) || null}, ${titulo(p.jefe) || null}, ${foto})`;
    if (p.bienes.length) await sql.transaction(p.bienes.map((b, i) => sql`INSERT INTO resguardo_bienes (persona_id, orden, no_inventario, tipo, modelo, descripcion, serie, observaciones)
      VALUES (${p.n}, ${i}, ${b.inv}, ${b.tipo || null}, ${b.modelo || null}, ${b.desc || null}, ${b.serie || null}, ${b.obs || null})`));
  }
  const [r] = await sql`SELECT (SELECT count(*) FROM resguardo_personas)::int p, (SELECT count(*) FROM resguardo_bienes)::int b, (SELECT count(*) FROM resguardo_personas WHERE foto IS NOT NULL)::int f`;
  console.log(r);
})().catch(e => { console.error(e); process.exit(1); });
