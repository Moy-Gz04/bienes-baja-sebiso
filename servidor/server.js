// API del Sistema de Bienes en propuesta de baja (Render). Datos en Neon; PDF de las fichas en Drive (Apps Script).
// El front vive en Netlify y le pasa /api/* a este servidor (netlify.toml), así que todo es mismo origen.
// Variables de entorno: DATABASE_URL, JWT_SECRET, APPS_SCRIPT_FICHAS_URL, APPS_SCRIPT_FICHAS_CLAVE, PORT
// En local, si existe ../public, también sirve el front (node server.js -> http://localhost:4310).
const fs = require("fs");
const path = require("path");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { neon } = require("@neondatabase/serverless");
const { fichaPdf } = require("./ficha-pdf");

// En local lee el .env del proyecto; en Render las variables vienen del panel
const ENV_LOCAL = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_LOCAL)) {
  for (const l of fs.readFileSync(ENV_LOCAL, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
}
for (const k of ["DATABASE_URL", "JWT_SECRET"]) if (!process.env[k]) { console.error(`Falta la variable ${k}`); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);
const SECRETO = process.env.JWT_SECRET;
const ESTATUS_VALIDOS = ["Baja definitiva", "Para reaprovechamiento", "Propuesta DIF"];

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
// las fotos capturadas desde el celular llegan en un cuerpo grande; lo demás, pequeño
const jsonChico = express.json({ limit: "100kb" }), jsonFotos = express.json({ limit: "15mb" });
app.use((req, res, next) => (/^\/api\/(bienes\/[^/]+\/fotos|mudanza|resguardos\/\d+\/foto)$/.test(req.path) ? jsonFotos : jsonChico)(req, res, next));
app.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// Fotos tomadas en el sistema para los bienes que no tenían (3 por bien), guardadas en Neon
sql`CREATE TABLE IF NOT EXISTS fotos_capturadas (
  no_inventario TEXT NOT NULL REFERENCES bienes ON DELETE CASCADE, orden INT NOT NULL CHECK (orden BETWEEN 1 AND 3),
  imagen BYTEA NOT NULL, quien TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (no_inventario, orden))`
  .catch(e => console.error("No se pudo preparar fotos_capturadas:", e.message));

// Comprobación física de cada bien: palomita (sí) o equis (no)
sql`CREATE TABLE IF NOT EXISTS comprobaciones (
  no_inventario TEXT PRIMARY KEY REFERENCES bienes ON DELETE CASCADE, valor BOOLEAN NOT NULL, quien TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`
  .catch(e => console.error("No se pudo preparar comprobaciones:", e.message));

sql`CREATE TABLE IF NOT EXISTS fotos_drive (nombre TEXT PRIMARY KEY, drive_id TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`
  .catch(e => console.error("fotos_drive:", e.message));

// Datos de la ficha completados en el sistema (cargar_db.js no toca esta tabla): se ponen por encima de los de origen
sql`CREATE TABLE IF NOT EXISTS ficha_capturas (
  no_inventario TEXT PRIMARY KEY REFERENCES bienes ON DELETE CASCADE, datos JSONB NOT NULL DEFAULT '{}', quien TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`
  .catch(e => console.error("No se pudo preparar ficha_capturas:", e.message));
const CAMPOS_FICHA = ["estado_fisico", "descripcion", "marca", "modelo", "serie", "material", "color", "agrupados", "organo_superior", "unidad_presupuestal",
  "adscripcion", "ubicacion", "fecha_adquisicion", "moi", "cog", "clave_armonizada", "resguardo", "estatus_contable"];

sql`CREATE TABLE IF NOT EXISTS captura_omitida (
  no_inventario TEXT PRIMARY KEY REFERENCES bienes ON DELETE CASCADE, quien TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`
  .catch(e => console.error("No se pudo preparar captura_omitida:", e.message));

// rol "captura": solo ve los bienes sin fotos y solo puede tomarlas
sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'completo'`.catch(e => console.error("rol:", e.message));

const fallo = (res, e, mensaje) => { console.error(mensaje, e); res.status(500).json({ ok: false, mensaje }); };

app.get("/api/salud", (req, res) => res.json({ ok: true, roles: ["mudanza-por-unidad", "resguardos"] }));

// ── Inicio de sesión (con freno a intentos repetidos por IP)
const intentos = new Map();
app.post("/api/auth/login", async (req, res) => {
  const ip = req.ip, ahora = Date.now();
  const reg = (intentos.get(ip) || []).filter(t => ahora - t < 15 * 60000);
  if (reg.length >= 10) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });
  try {
    const usuario = String(req.body?.usuario || "").trim();
    const [u] = await sql`SELECT id, usuario, password_hash, area, rol, unidad FROM usuarios WHERE usuario = ${usuario}`;
    if (!u || !bcrypt.compareSync(String(req.body?.password || ""), u.password_hash)) {
      intentos.set(ip, [...reg, ahora]);
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }
    intentos.delete(ip);
    res.json({ token: jwt.sign({ id: u.id, usuario: u.usuario, area: u.area, rol: u.rol, ...(u.unidad ? { unidad: u.unidad } : {}) }, SECRETO, { expiresIn: "8h" }), area: u.area, rol: u.rol });
  } catch (e) { fallo(res, e, "No se pudo iniciar sesión."); }
});

function sesion(req, res, next) {
  try {
    req.usuario = jwt.verify(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), SECRETO);
    if (req.usuario.proposito) throw new Error("token de otro tipo");
    req.soloCaptura = req.usuario.rol === "captura";
    req.soloComprobar = req.usuario.rol === "comprobar";   // solo ve Propuesta DIF y marca palomita / equis
    req.soloMudanza = req.usuario.rol === "mudanza";       // solo entra a Inventario · Mudanza y solo de su unidad presupuestal
    if (req.soloMudanza && !/^\/api\/mudanza(\/|$)/.test(req.path)) return res.status(403).json({ ok: false, mensaje: "Tu usuario solo tiene acceso a Inventario - Mudanza." });
    if (req.usuario.rol === "resguardos" && !/^\/api\/resguardos(\/|$)/.test(req.path)) return res.status(403).json({ ok: false, mensaje: "Tu usuario solo tiene acceso a Resguardos." });
    next();
  } catch (e) { res.status(401).json({ ok: false, mensaje: "Tu sesión venció. Vuelve a iniciar sesión." }); }
}

// ── Bienes con sus fotos y el estatus capturado
app.get("/api/bienes", sesion, async (req, res) => {
  try {
    const filas = await sql`
      SELECT b.*, to_char(b.fecha_adquisicion, 'YYYY-MM-DD') AS fecha_adquisicion, to_char(b.revisado_en, 'YYYY-MM-DD') AS revisado_en,
        COALESCE((SELECT array_agg(COALESCE('https://lh3.googleusercontent.com/d/' || d.drive_id || '=w1400', f.ruta || '?v=20261104') ORDER BY f.orden) FROM fotos f LEFT JOIN fotos_drive d ON d.nombre = substring(f.ruta from '[^/]+$') WHERE f.no_inventario = b.no_inventario), '{}') AS fotos,
        k.valor AS comp_valor, k.quien AS comp_quien, to_char(k.cuando, 'YYYY-MM-DD HH24:MI') AS comp_cuando,
        e.clasificacion AS capturado, e.quien AS capturo, e.cuando AS capturado_en,
        (SELECT count(*) FROM fotos_capturadas c WHERE c.no_inventario = b.no_inventario)::int AS n_capturadas,
        (SELECT max(c.quien || '|' || to_char(c.cuando, 'YYYY-MM-DD')) FROM fotos_capturadas c WHERE c.no_inventario = b.no_inventario) AS foto_captura,
        fc.datos AS fc_datos, fc.quien AS fc_quien, to_char(fc.cuando, 'YYYY-MM-DD HH24:MI') AS fc_cuando,
        EXISTS (SELECT 1 FROM captura_omitida o WHERE o.no_inventario = b.no_inventario) AS captura_omitida
      FROM bienes b LEFT JOIN estatus_capturas e USING (no_inventario) LEFT JOIN comprobaciones k USING (no_inventario) LEFT JOIN ficha_capturas fc USING (no_inventario)
      ORDER BY length(b.no_inventario), b.no_inventario`;
    const tf = jwt.sign({ proposito: "fotos" }, SECRETO, { expiresIn: "8h" });
    const bienes = filas.map(({ fc_datos, fc_quien, fc_cuando, ...f }) => ({ ...f, ...(fc_datos || {}),
      datos_completados: fc_quien ? { quien: fc_quien, cuando: fc_cuando, campos: Object.keys(fc_datos || {}) } : null,
      ficha_generando: generacion.get(f.no_inventario) || null })).map(({ capturado, capturo, capturado_en, reviso, ficha_previa, origen, pdf, pdf_drive_id, actualizado, n_capturadas, foto_captura, comp_valor, comp_quien, comp_cuando, ...b }) => ({
      comprobado: comp_valor === null || comp_valor === undefined ? null : { valor: comp_valor, quien: comp_quien, cuando: comp_cuando },
      ...b, "revisó": reviso,
      // sin fotos de origen: se usan las tomadas en el sistema
      fotos: b.fotos.length ? b.fotos : Array.from({ length: n_capturadas }, (_, i) => `api/foto/${b.no_inventario}/${i + 1}?t=${tf}`),
      fotos_capturadas: !b.fotos.length && n_capturadas > 0 ? { quien: foto_captura.split("|")[0], cuando: foto_captura.split("|")[1] } : null,
      puede_capturar_fotos: !b.fotos.length, ficha: ficha_previa, filas: origen, moi: Number(b.moi) || 0,
      tiene_pdf: !!(pdf_drive_id || pdf), pdf_en_drive: !!pdf_drive_id,
      clasificacion: capturado || b.clasificacion,
      estatus_capturado: capturado ? { clasificacion: capturado, quien: capturo, cuando: new Date(capturado_en).toISOString() } : null,
    }));
    if (req.soloComprobar) {
      const grupo = (k) => !k ? "Por comprobar" : k.valor ? "Comprobado" : "No comprobado";
      return res.json({ ok: true, rol: "comprobar", bienes: bienes.filter(b => b.clasificacion === "Propuesta DIF")
        .map(b => ({ ...b, clasificacion: grupo(b.comprobado), puede_capturar_fotos: false, avisos: [], filas: [] })) });
    }
    if (req.soloCaptura) {
      // solo lo necesario para identificar el bien y fotografiarlo
      const CAMPOS = ["no_inventario", "descripcion", "marca", "modelo", "serie", "material", "color", "ubicacion", "edificio", "unidad_presupuestal", "adscripcion", "fotos", "fotos_capturadas", "puede_capturar_fotos"];
      return res.json({ ok: true, rol: "captura", bienes: bienes.filter(b => b.puede_capturar_fotos).map(b => Object.fromEntries(CAMPOS.map(k => [k, b[k]]))).map(b => ({ ...b, clasificacion: b.fotos_capturadas ? "Fotos tomadas" : "Faltan fotos", avisos: [], filas: [] })) });
    }
    res.json({ ok: true, bienes });
  } catch (e) { fallo(res, e, "No se pudieron cargar los bienes."); }
});

// ── Captura del estatus de un bien "Pendiente de estatus" (null = regresarlo a pendiente)
app.post("/api/estatus", sesion, async (req, res) => {
  if (req.soloCaptura || req.soloComprobar) return res.status(403).json({ ok: false, mensaje: "Tu usuario solo captura fotos." });
  try {
    const inv = String(req.body?.no_inventario || "");
    const [b] = await sql`SELECT pendiente FROM bienes WHERE no_inventario = ${inv}`;
    if (!b || !b.pendiente) return res.status(400).json({ ok: false, mensaje: "Ese bien no está pendiente de estatus." });
    const valor = req.body?.clasificacion;
    if (valor === null) {
      await sql`DELETE FROM estatus_capturas WHERE no_inventario = ${inv}`;
      return res.json({ ok: true, estatus: null });
    }
    if (!ESTATUS_VALIDOS.includes(valor)) return res.status(400).json({ ok: false, mensaje: "Elige Baja definitiva, Reaprovechamiento o Propuesta DIF." });
    const [e] = await sql`INSERT INTO estatus_capturas (no_inventario, clasificacion, quien) VALUES (${inv}, ${valor}, ${req.usuario.usuario || "—"})
      ON CONFLICT (no_inventario) DO UPDATE SET clasificacion = EXCLUDED.clasificacion, quien = EXCLUDED.quien, cuando = now()
      RETURNING clasificacion, quien, cuando`;
    res.json({ ok: true, estatus: { ...e, cuando: new Date(e.cuando).toISOString() } });
  } catch (e) { fallo(res, e, "No se pudo guardar el estatus."); }
});

// ── Marcar un bien como comprobado (true = palomita, false = equis, null = quitar la marca)
app.post("/api/comprobado", sesion, async (req, res) => {
  if (req.soloCaptura) return res.status(403).json({ ok: false, mensaje: "Tu usuario solo captura fotos." });
  try {
    const inv = String(req.body?.no_inventario || ""), valor = req.body?.valor;
    const [b] = await sql`SELECT COALESCE(e.clasificacion, b.clasificacion) AS c FROM bienes b LEFT JOIN estatus_capturas e USING (no_inventario) WHERE b.no_inventario = ${inv}`;
    if (req.soloComprobar && b && b.c !== "Propuesta DIF") return res.status(403).json({ ok: false, mensaje: "Ese bien no está en Propuesta DIF." });
    if (!b) return res.status(404).json({ ok: false, mensaje: "Ese bien no existe." });
    if (valor === null) { await sql`DELETE FROM comprobaciones WHERE no_inventario = ${inv}`; return res.json({ ok: true, comprobado: null }); }
    if (typeof valor !== "boolean") return res.status(400).json({ ok: false, mensaje: "Marca palomita o equis." });
    const [k] = await sql`INSERT INTO comprobaciones (no_inventario, valor, quien) VALUES (${inv}, ${valor}, ${req.usuario.usuario || "—"})
      ON CONFLICT (no_inventario) DO UPDATE SET valor = EXCLUDED.valor, quien = EXCLUDED.quien, cuando = now()
      RETURNING valor, quien, to_char(cuando, 'YYYY-MM-DD HH24:MI') AS cuando`;
    res.json({ ok: true, comprobado: k });
  } catch (e) { fallo(res, e, "No se pudo guardar la comprobación."); }
});

// ── Captura de las 3 fotos de un bien que no tenía (desde el celular). Se pueden volver a tomar.
app.post("/api/bienes/:inv/fotos", sesion, async (req, res) => {
  if (req.soloComprobar) return res.status(403).json({ ok: false, mensaje: "Tu usuario solo marca la comprobación." });
  try {
    const inv = String(req.params.inv);
    const [b] = await sql`SELECT (SELECT count(*) FROM fotos f WHERE f.no_inventario = b.no_inventario)::int AS n FROM bienes b WHERE no_inventario = ${inv}`;
    if (!b) return res.status(404).json({ ok: false, mensaje: "Ese bien no existe." });
    if (b.n > 0) return res.status(409).json({ ok: false, mensaje: "Este bien ya tiene fotos." });
    const fotos = Array.isArray(req.body?.fotos) ? req.body.fotos : [];
    if (fotos.length !== 3) return res.status(400).json({ ok: false, mensaje: "Se necesitan las 3 fotos." });
    const bytes = fotos.map(f => { const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(f)); return m ? Buffer.from(m[1], "base64") : null; });
    if (bytes.some(x => !x || x.length < 2000 || x.length > 4 * 1024 * 1024 || x[0] !== 0xff || x[1] !== 0xd8)) {
      return res.status(400).json({ ok: false, mensaje: "Alguna foto no es válida. Vuelve a tomarla." });
    }
    const quien = req.usuario.usuario || "—";
    await sql.transaction(bytes.map((x, i) => sql`INSERT INTO fotos_capturadas (no_inventario, orden, imagen, quien) VALUES (${inv}, ${i + 1}, ${x}, ${quien})
      ON CONFLICT (no_inventario, orden) DO UPDATE SET imagen = EXCLUDED.imagen, quien = EXCLUDED.quien, cuando = now()`));
    const tf = jwt.sign({ proposito: "fotos" }, SECRETO, { expiresIn: "8h" });
    programarFicha(inv);
    res.json({ ok: true, ficha_generando: generacion.get(inv), fotos: [1, 2, 3].map(i => `api/foto/${inv}/${i}?t=${tf}&v=${Date.now()}`), fotos_capturadas: { quien, cuando: new Date().toISOString().slice(0, 10) } });
  } catch (e) { fallo(res, e, "No se pudieron guardar las fotos."); }
});

// ── Resguardos de Mobiliario Nuevo Edificio (personas por área, sus bienes y su foto; se cargan con cargar_resguardos.js)
// Cambios hechos desde el sistema (mover bien, foto, registrar en vacante). cargar_resguardos.js no recarga si hay cambios aquí.
sql`CREATE TABLE IF NOT EXISTS resguardo_cambios (id SERIAL PRIMARY KEY, persona_id INT NOT NULL, tipo TEXT NOT NULL, detalle JSONB NOT NULL DEFAULT '{}', quien TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`
  .catch(e => console.error("resguardo_cambios:", e.message));
sql`ALTER TABLE resguardo_personas ADD COLUMN IF NOT EXISTS foto_v INT NOT NULL DEFAULT 0`.catch(e => console.error("resguardo foto_v:", e.message));
sql`CREATE TABLE IF NOT EXISTS resguardo_correctos (no_inventario TEXT PRIMARY KEY, quien TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`
  .catch(e => console.error("resguardo_correctos:", e.message));
// Operaciones hechas sin internet se reenvían con un opId: si ya se aplicaron (la respuesta se perdió), se responde ok sin repetirlas.
sql`CREATE TABLE IF NOT EXISTS resguardo_ops (op_id TEXT PRIMARY KEY, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`.catch(e => console.error("resguardo_ops:", e.message));
app.use("/api/resguardos", async (req, res, next) => {
  const op = req.method === "POST" ? String(req.body?.opId ?? "").slice(0, 80) : "";
  if (!op) return next();
  try {
    const [ya] = await sql`SELECT 1 FROM resguardo_ops WHERE op_id = ${op}`;
    if (ya) return res.json({ ok: true, repetida: true });
    const json = res.json.bind(res);
    res.json = (cuerpo) => { if (cuerpo?.ok) sql`INSERT INTO resguardo_ops (op_id) VALUES (${op}) ON CONFLICT DO NOTHING`.catch(() => {}); return json(cuerpo); };
    next();
  } catch (e) { next(); }
});
const accesoResguardos = (req, res) => {
  if (req.soloCaptura || req.soloComprobar) { res.status(403).json({ ok: false, mensaje: "Tu usuario no tiene acceso a este apartado." }); return false; }
  return true;
};
const cambio = (persona, tipo, detalle, quien) => sql`INSERT INTO resguardo_cambios (persona_id, tipo, detalle, quien) VALUES (${persona}, ${tipo}, ${JSON.stringify(detalle)}::jsonb, ${quien || "—"})`;

app.get("/api/resguardos", sesion, async (req, res) => {
  if (!accesoResguardos(req, res)) return;
  try {
    const personas = await sql`SELECT p.id, p.orden, p.area, p.area_orden, p.seccion, p.nombre, p.vacante, p.cargo, p.jefe, p.foto_v, (p.foto IS NOT NULL) AS tiene_foto, (d.persona_id IS NOT NULL) AS tiene_pdf,
      EXISTS (SELECT 1 FROM resguardo_cambios c WHERE c.persona_id = p.id AND c.tipo <> 'foto' AND c.cuando > COALESCE(d.cuando, 'epoch')) AS por_actualizar
      FROM resguardo_personas p LEFT JOIN resguardo_pdfs d ON d.persona_id = p.id ORDER BY p.orden`;
    const bienes = await sql`SELECT b.persona_id, b.no_inventario, b.tipo, b.modelo, b.descripcion, b.serie, b.observaciones, b.marca, b.caracteristicas, (c.no_inventario IS NOT NULL) AS correcto
      FROM resguardo_bienes b LEFT JOIN resguardo_correctos c ON c.no_inventario = b.no_inventario ORDER BY b.persona_id, b.orden`;
    const por = new Map();
    for (const b of bienes) { if (!por.has(b.persona_id)) por.set(b.persona_id, []); por.get(b.persona_id).push({ inv: b.no_inventario, ok: b.correcto, tipo: b.tipo, modelo: b.modelo, desc: b.descripcion, serie: b.serie, obs: b.observaciones, marca: b.marca, carac: b.caracteristicas }); }
    const tf = jwt.sign({ proposito: "fotos" }, SECRETO, { expiresIn: "8h" }), tr = jwt.sign({ proposito: "resguardo" }, SECRETO, { expiresIn: "8h" });
    res.json({ ok: true, personas: personas.map(({ tiene_foto, tiene_pdf, foto_v, ...p }) => ({ ...p, resguardo: tiene_pdf ? `api/resguardos/${p.id}/pdf?t=${tr}` : null, foto: tiene_foto ? `api/resguardos/${p.id}/foto?t=${tf}&v=${foto_v}` : null, bienes: por.get(p.id) || [] })) });
  } catch (e) { fallo(res, e, "No se pudieron cargar los resguardos."); }
});

// Mover un No. de inventario de una persona a otra (queda al final de la lista del destino)
app.post("/api/resguardos/mover", sesion, async (req, res) => {
  if (!accesoResguardos(req, res)) return;
  try {
    const origen = Number(req.body?.origen) || 0, destino = Number(req.body?.destino) || 0, inv = String(req.body?.inv ?? "").trim();
    if (!inv || !origen || !destino || origen === destino) return res.status(400).json({ ok: false, mensaje: "Elige a la persona que recibirá el bien." });
    const [o] = await sql`SELECT nombre FROM resguardo_personas WHERE id = ${origen}`, [d] = await sql`SELECT nombre FROM resguardo_personas WHERE id = ${destino}`;
    if (!o || !d) return res.status(404).json({ ok: false, mensaje: "La persona ya no existe. Recarga la página." });
    const [b] = await sql`UPDATE resguardo_bienes SET persona_id = ${destino}, orden = (SELECT COALESCE(max(orden), -1) + 1 FROM resguardo_bienes WHERE persona_id = ${destino})
      WHERE id = (SELECT id FROM resguardo_bienes WHERE persona_id = ${origen} AND no_inventario = ${inv} ORDER BY orden LIMIT 1) RETURNING id`;
    if (!b) return res.status(404).json({ ok: false, mensaje: "Ese bien ya no está con esta persona. Recarga la página." });
    const quien = req.usuario.usuario, det = { inv, de: origen, a: destino, de_nombre: o.nombre, a_nombre: d.nombre };
    await cambio(origen, "sale", det, quien); await cambio(destino, "entra", det, quien);
    res.json({ ok: true });
  } catch (e) { fallo(res, e, "No se pudo mover el bien."); }
});

// Marcar / desmarcar un No. de inventario como correcto
app.post("/api/resguardos/correcto", sesion, async (req, res) => {
  if (!accesoResguardos(req, res)) return;
  try {
    const inv = String(req.body?.inv ?? "").trim(), marcar = req.body?.correcto !== false;
    if (!inv) return res.status(400).json({ ok: false, mensaje: "Falta el No. de inventario." });
    const [b] = await sql`SELECT persona_id FROM resguardo_bienes WHERE no_inventario = ${inv} LIMIT 1`;
    if (!b) return res.status(404).json({ ok: false, mensaje: "Ese bien ya no existe. Recarga la página." });
    if (marcar) await sql`INSERT INTO resguardo_correctos (no_inventario, quien) VALUES (${inv}, ${req.usuario.usuario}) ON CONFLICT (no_inventario) DO UPDATE SET quien = EXCLUDED.quien, cuando = now()`;
    else await sql`DELETE FROM resguardo_correctos WHERE no_inventario = ${inv}`;
    res.json({ ok: true, correcto: marcar });
  } catch (e) { fallo(res, e, "No se pudo guardar la marca."); }
});

// Editar nombre, cargo y jefe de una persona o de una vacante (no cambia si es vacante)
app.post("/api/resguardos/:id/editar", sesion, async (req, res) => {
  if (!accesoResguardos(req, res)) return;
  try {
    const id = Number(req.params.id) || 0, t = (k, max) => String(req.body?.[k] ?? "").trim().replace(/\s+/g, " ").slice(0, max);
    const nombre = t("nombre", 120), cargo = t("cargo", 120), jefe = t("jefe", 120);
    if (nombre.length < 3) return res.status(400).json({ ok: false, mensaje: "Escribe el nombre." });
    const [antes] = await sql`SELECT nombre, cargo, jefe FROM resguardo_personas WHERE id = ${id}`;
    if (!antes) return res.status(404).json({ ok: false, mensaje: "La persona ya no existe. Recarga la página." });
    await sql`UPDATE resguardo_personas SET nombre = ${nombre}, cargo = ${cargo || null}, jefe = ${jefe || null} WHERE id = ${id}`;
    await cambio(id, "edicion", { antes, nombre, cargo, jefe }, req.usuario.usuario);
    res.json({ ok: true });
  } catch (e) { fallo(res, e, "No se pudo guardar el cambio."); }
});

// Registrar a una persona en una vacante
app.post("/api/resguardos/:id/persona", sesion, async (req, res) => {
  if (!accesoResguardos(req, res)) return;
  try {
    const id = Number(req.params.id) || 0, t = (k, max) => String(req.body?.[k] ?? "").trim().replace(/\s+/g, " ").slice(0, max);
    const nombre = t("nombre", 120), cargo = t("cargo", 120), jefe = t("jefe", 120);
    if (nombre.length < 5 || !cargo) return res.status(400).json({ ok: false, mensaje: "Escribe el nombre completo y el cargo." });
    const [antes] = await sql`SELECT nombre FROM resguardo_personas WHERE id = ${id} AND vacante`;
    if (!antes) return res.status(404).json({ ok: false, mensaje: "Esta plaza ya no está vacante. Recarga la página." });
    await sql`UPDATE resguardo_personas SET nombre = ${nombre}, cargo = ${cargo}, jefe = ${jefe || null}, vacante = FALSE WHERE id = ${id}`;
    await cambio(id, "registro", { antes: antes.nombre, nombre, cargo, jefe }, req.usuario.usuario);
    res.json({ ok: true, persona: { nombre, cargo, jefe: jefe || null, vacante: false } });
  } catch (e) { fallo(res, e, "No se pudo registrar a la persona."); }
});

// Cambiar la foto de la persona (JPEG reducido en el navegador)
app.post("/api/resguardos/:id/foto", sesion, async (req, res) => {
  if (!accesoResguardos(req, res)) return;
  try {
    const id = Number(req.params.id) || 0;
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.foto ?? "")), b = m ? Buffer.from(m[1], "base64") : null;
    if (!b || b.length < 2000 || b.length > 4 * 1024 * 1024 || b[0] !== 0xff || b[1] !== 0xd8) return res.status(400).json({ ok: false, mensaje: "La foto no es válida. Elige otra." });
    const [r] = await sql`UPDATE resguardo_personas SET foto = ${b}, foto_v = foto_v + 1 WHERE id = ${id} RETURNING foto_v`;
    if (!r) return res.status(404).json({ ok: false, mensaje: "La persona ya no existe." });
    await cambio(id, "foto", {}, req.usuario.usuario);
    const tf = jwt.sign({ proposito: "fotos" }, SECRETO, { expiresIn: "8h" });
    res.json({ ok: true, foto: `api/resguardos/${id}/foto?t=${tf}&v=${r.foto_v}` });
  } catch (e) { fallo(res, e, "No se pudo guardar la foto."); }
});

app.get("/api/resguardos/:id/pdf", async (req, res) => {
  try { if (jwt.verify(String(req.query.t || ""), SECRETO).proposito !== "resguardo") throw 0; } catch (e) { return res.status(401).send("El enlace venció. Vuelve a abrirlo desde el sistema."); }
  try {
    const [f] = await sql`SELECT nombre, pdf FROM resguardo_pdfs WHERE persona_id = ${Number(req.params.id) || 0}`;
    if (!f) return res.status(404).send("Esta persona todavía no tiene resguardo.");
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.nombre)}`, "Cache-Control": "private, max-age=300" }).send(Buffer.from(f.pdf));
  } catch (e) { fallo(res, e, "No se pudo cargar el resguardo."); }
});

app.get("/api/resguardos/:id/foto", async (req, res) => {
  try { if (jwt.verify(String(req.query.t || ""), SECRETO).proposito !== "fotos") throw 0; } catch (e) { return res.status(401).end(); }
  try {
    const [f] = await sql`SELECT foto FROM resguardo_personas WHERE id = ${Number(req.params.id) || 0}`;
    if (!f || !f.foto) return res.status(404).end();
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" }).send(Buffer.from(f.foto));
  } catch (e) { fallo(res, e, "No se pudo cargar la foto."); }
});

// ── Inventario · Mudanza: captura libre de bienes (inventario, descripción, serie, quién lo resguarda y su cargo, 3 fotos)
sql`CREATE TABLE IF NOT EXISTS mudanza_inventario (
  id SERIAL PRIMARY KEY, no_inventario TEXT NOT NULL, descripcion TEXT NOT NULL, serie TEXT NOT NULL DEFAULT '', persona TEXT NOT NULL, cargo TEXT NOT NULL DEFAULT '',
  foto_frente BYTEA NOT NULL, foto_lado BYTEA NOT NULL, foto_etiqueta BYTEA NOT NULL, quien TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now())`
  .catch(e => console.error("No se pudo preparar mudanza_inventario:", e.message));
sql`ALTER TABLE mudanza_inventario ADD COLUMN IF NOT EXISTS unidad TEXT`.catch(e => console.error("mudanza unidad:", e.message));
sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS unidad TEXT`.catch(e => console.error("usuarios unidad:", e.message));
const FOTOS_MUDANZA = { frente: "foto_frente", lado: "foto_lado", etiqueta: "foto_etiqueta" };
// Unidades presupuestales (cada una tiene su usuario de rol "mudanza", que solo ve y captura las suyas)
const UNIDADES = {
  "01": "Secretaría de Bienestar e Inclusión Social", "04": "Dirección General de Fomento Artesanal", "05": "Subsecretaría de Inclusión y Desarrollo",
  "06": "Dirección General de Operación y Logística de Programas", "07": "Dirección General de Atención al Migrante", "08": "Dirección General de Asistencia, Atención y Protección",
  "12": "Dirección General de Prospectiva Planeación y Evaluación de los Programas Sociales", "13": "Subsecretaría de Participación Social y Fomento Artesanal",
  "14": "Dirección General de Inclusión para las Personas con Discapacidad", "15": "Subsecretaría de Desarrollo Social y Humano", "16": "Dirección General de Servidores del Pueblo" };
const accesoMudanza = (req, res) => {
  if (req.soloComprobar || (req.soloMudanza && !UNIDADES[req.usuario.unidad])) { res.status(403).json({ ok: false, mensaje: "Tu usuario no tiene acceso a este apartado." }); return false; }
  return true;
};

app.get("/api/mudanza", sesion, async (req, res) => {
  if (!accesoMudanza(req, res)) return;
  try {
    const u = req.soloMudanza ? req.usuario.unidad : null;
    const filas = await sql`SELECT id, no_inventario, descripcion, serie, persona, cargo, unidad, quien, to_char(cuando, 'YYYY-MM-DD HH24:MI') AS cuando FROM mudanza_inventario WHERE (${u}::text IS NULL OR unidad = ${u}) ORDER BY id DESC`;
    const tf = jwt.sign(u ? { proposito: "mudanza-fotos", unidad: u } : { proposito: "fotos" }, SECRETO, { expiresIn: "8h" });
    res.json({ ok: true, propia: u, unidades: u ? { [u]: UNIDADES[u] } : UNIDADES, registros: filas.map(f => ({ ...f, fotos: Object.fromEntries(Object.keys(FOTOS_MUDANZA).map(k => [k, `api/mudanza/${f.id}/foto/${k}?t=${tf}`])) })) });
  } catch (e) { fallo(res, e, "No se pudo cargar el inventario."); }
});

app.post("/api/mudanza", sesion, async (req, res) => {
  if (!accesoMudanza(req, res)) return;
  try {
    const unidad = req.soloMudanza ? req.usuario.unidad : String(req.body?.unidad || "");
    if (!UNIDADES[unidad]) return res.status(400).json({ ok: false, mensaje: "Elige la unidad presupuestal." });
    const t = (k, max) => String(req.body?.[k] ?? "").trim().slice(0, max);
    const inv = t("no_inventario", 40), descripcion = t("descripcion", 200), serie = t("serie", 80), persona = t("persona", 120), cargo = t("cargo", 120);
    if (!inv || !descripcion || !persona || !cargo) return res.status(400).json({ ok: false, mensaje: "Faltan datos: No. de inventario, descripción, persona y cargo son obligatorios." });
    const bytes = {};
    for (const k of Object.keys(FOTOS_MUDANZA)) {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.fotos?.[k] ?? "")), b = m ? Buffer.from(m[1], "base64") : null;
      if (!b || b.length < 2000 || b.length > 4 * 1024 * 1024 || b[0] !== 0xff || b[1] !== 0xd8) return res.status(400).json({ ok: false, mensaje: `La foto de ${k === "lado" ? "lado" : k} falta o no es válida. Vuelve a tomarla.` });
      bytes[k] = b;
    }
    const [r] = await sql`INSERT INTO mudanza_inventario (no_inventario, descripcion, serie, persona, cargo, foto_frente, foto_lado, foto_etiqueta, quien, unidad)
      VALUES (${inv}, ${descripcion}, ${serie}, ${persona}, ${cargo}, ${bytes.frente}, ${bytes.lado}, ${bytes.etiqueta}, ${req.usuario.usuario || "—"}, ${unidad}) RETURNING id`;
    res.json({ ok: true, id: r.id });
  } catch (e) { fallo(res, e, "No se pudo guardar el registro."); }
});

app.delete("/api/mudanza/:id", sesion, async (req, res) => {
  if (req.soloCaptura || !accesoMudanza(req, res)) return req.soloCaptura ? res.status(403).json({ ok: false, mensaje: "Tu usuario no puede borrar registros." }) : undefined;
  try { const u = req.soloMudanza ? req.usuario.unidad : null; await sql`DELETE FROM mudanza_inventario WHERE id = ${Number(req.params.id) || 0} AND (${u}::text IS NULL OR unidad = ${u})`; res.json({ ok: true }); }
  catch (e) { fallo(res, e, "No se pudo borrar el registro."); }
});

app.get("/api/mudanza/:id/foto/:tipo", async (req, res) => {
  let u = null;
  try { const t = jwt.verify(String(req.query.t || ""), SECRETO); if (t.proposito === "mudanza-fotos" && t.unidad) u = t.unidad; else if (t.proposito !== "fotos") throw 0; } catch (e) { return res.status(401).end(); }
  const col = FOTOS_MUDANZA[req.params.tipo]; if (!col) return res.status(404).end();
  try {
    const id = Number(req.params.id) || 0;
    const [f] = col === "foto_frente" ? await sql`SELECT foto_frente AS img FROM mudanza_inventario WHERE id = ${id} AND (${u}::text IS NULL OR unidad = ${u})`
      : col === "foto_lado" ? await sql`SELECT foto_lado AS img FROM mudanza_inventario WHERE id = ${id} AND (${u}::text IS NULL OR unidad = ${u})`
      : await sql`SELECT foto_etiqueta AS img FROM mudanza_inventario WHERE id = ${id} AND (${u}::text IS NULL OR unidad = ${u})`;
    if (!f) return res.status(404).end();
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" }).send(Buffer.from(f.img));
  } catch (e) { fallo(res, e, "No se pudo cargar la foto."); }
});

// ── Quitar (o regresar) un bien del apartado "Capturar datos"
app.post("/api/bienes/:inv/omitir-captura", sesion, async (req, res) => {
  if (req.soloCaptura || req.soloComprobar) return res.status(403).json({ ok: false, mensaje: "Tu usuario no puede cambiar este apartado." });
  try {
    const inv = String(req.params.inv), quitar = req.body?.quitar !== false;
    if (quitar) await sql`INSERT INTO captura_omitida (no_inventario, quien) VALUES (${inv}, ${req.usuario.usuario || "—"}) ON CONFLICT (no_inventario) DO NOTHING`;
    else await sql`DELETE FROM captura_omitida WHERE no_inventario = ${inv}`;
    res.json({ ok: true, captura_omitida: quitar });
  } catch (e) { fallo(res, e, "No se pudo actualizar el apartado."); }
});

// ── Completar los datos de la ficha (solo rol completo). Se guarda solo lo que difiere del origen.
app.post("/api/bienes/:inv/datos", sesion, async (req, res) => {
  if (req.soloCaptura || req.soloComprobar) return res.status(403).json({ ok: false, mensaje: "Tu usuario no puede completar fichas." });
  try {
    const inv = String(req.params.inv);
    const [b] = await sql`SELECT *, to_char(fecha_adquisicion, 'YYYY-MM-DD') AS fecha_adquisicion FROM bienes WHERE no_inventario = ${inv}`;
    if (!b) return res.status(404).json({ ok: false, mensaje: "Ese bien no existe." });
    const entrada = req.body?.datos || {}, datos = {};
    for (const c of CAMPOS_FICHA) {
      let v = entrada[c];
      if (v === undefined || v === null) continue;
      v = String(v).trim().slice(0, 300);
      if (!v) continue;
      if (c === "fecha_adquisicion" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return res.status(400).json({ ok: false, mensaje: "La fecha de adquisición no es válida." });
      if (c === "moi") { const n = Number(v.replace(/[$,\s]/g, "")); if (!isFinite(n) || n < 0) return res.status(400).json({ ok: false, mensaje: "El monto original no es válido." }); v = n; }
      const orig = c === "moi" ? Number(b.moi) || 0 : String(b[c] ?? "").trim();
      if (v !== orig) datos[c] = v;
    }
    const quien = req.usuario.usuario || "—";
    if (!Object.keys(datos).length) await sql`DELETE FROM ficha_capturas WHERE no_inventario = ${inv}`;
    else await sql`INSERT INTO ficha_capturas (no_inventario, datos, quien) VALUES (${inv}, ${JSON.stringify(datos)}::jsonb, ${quien})
      ON CONFLICT (no_inventario) DO UPDATE SET datos = EXCLUDED.datos, quien = EXCLUDED.quien, cuando = now()`;
    programarFicha(inv);
    res.json({ ok: true, datos, ficha_generando: generacion.get(inv),
      datos_completados: Object.keys(datos).length ? { quien, cuando: new Date().toISOString().slice(0, 16).replace("T", " "), campos: Object.keys(datos) } : null });
  } catch (e) { fallo(res, e, "No se pudieron guardar los datos de la ficha."); }
});

// ── Generación de la ficha en segundo plano: PDF -> Drive (guardarVarios) -> carpeta del bien (guardarCarpeta)
const generacion = new Map();   // inv -> { estado: "generando"|"lista"|"error", cuando, error? }
const pendientes = new Set(), enCurso = new Set();
function programarFicha(inv) {
  generacion.set(inv, { estado: "generando", cuando: new Date().toISOString() });
  if (enCurso.has(inv)) { pendientes.add(inv); return; }
  enCurso.add(inv);
  (async () => {
    do {
      pendientes.delete(inv);
      try { await generarFicha(inv); generacion.set(inv, { estado: "lista", cuando: new Date().toISOString() }); }
      catch (e) { console.error("Ficha automática", inv, e); generacion.set(inv, { estado: "error", cuando: new Date().toISOString(), error: e.message }); }
    } while (pendientes.has(inv));
    enCurso.delete(inv);
  })();
}
async function appsScript(cuerpo) {
  if (!process.env.APPS_SCRIPT_FICHAS_URL) throw new Error("Falta APPS_SCRIPT_FICHAS_URL");
  let ultimo;
  for (let k = 1; k <= 3; k++) {
    try {
      const r = await fetch(process.env.APPS_SCRIPT_FICHAS_URL, { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow",
        signal: AbortSignal.timeout(120000), body: JSON.stringify({ ...cuerpo, clave: process.env.APPS_SCRIPT_FICHAS_CLAVE }) });
      const t = await r.text(); let d;
      try { d = JSON.parse(t); } catch (e) { throw new Error("Apps Script respondió: " + t.slice(0, 120)); }
      if (!d.ok) throw new Error(d.error || "Apps Script falló");
      return d;
    } catch (e) { ultimo = e; await new Promise(r => setTimeout(r, 2000 * k)); }
  }
  throw ultimo;
}
async function bajarImagen(url) {
  const r = await fetch(url, { headers: { Accept: "image/jpeg,image/png" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Foto ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
const FRONT_PUBLICO = "https://bienes-baja-sebiso.netlify.app/";
async function generarFicha(inv) {
  const [b] = await sql`SELECT b.*, to_char(b.fecha_adquisicion, 'YYYY-MM-DD') AS fecha_adquisicion, fc.datos AS fc_datos FROM bienes b LEFT JOIN ficha_capturas fc USING (no_inventario) WHERE b.no_inventario = ${inv}`;
  if (!b) throw new Error("El bien no existe");
  const bien = { ...b, ...(b.fc_datos || {}) };
  const origen = await sql`SELECT COALESCE('https://lh3.googleusercontent.com/d/' || d.drive_id || '=w1400', ${FRONT_PUBLICO} || f.ruta) AS url FROM fotos f
    LEFT JOIN fotos_drive d ON d.nombre = substring(f.ruta from '[^/]+$') WHERE f.no_inventario = ${inv} ORDER BY f.orden LIMIT 3`;
  const fotos = origen.length
    ? await Promise.all(origen.map(o => bajarImagen(o.url).catch(e => { console.error(e.message); return null; })))
    : (await sql`SELECT imagen FROM fotos_capturadas WHERE no_inventario = ${inv} ORDER BY orden`).map(f => Buffer.from(f.imagen));
  const pdf = await fichaPdf(bien, fotos);
  const d = await appsScript({ accion: "guardarVarios", fichas: [{ no_inventario: inv, pdf_base64: pdf.toString("base64"), origen: "sistema" }] });
  const r = (d.resultados || [])[0];
  if (!r || !r.ok || !r.id) throw new Error((r && r.error) || "Drive no devolvió el id de la ficha");
  await sql`UPDATE bienes SET pdf_drive_id = ${r.id} WHERE no_inventario = ${inv}`;
  cachePdf.set(inv, { bytes: pdf, hasta: Date.now() + 30 * 60000 });
  const archivos = fotos.map((f, i) => f && { nombre: `${inv} img ${i + 1}.jpg`, mime: f[0] === 0x89 ? "image/png" : "image/jpeg", base64: f.toString("base64") }).filter(Boolean);
  archivos.push({ nombre: `FICHA_${inv}.pdf`, mime: "application/pdf", base64: pdf.toString("base64") });
  await appsScript({ accion: "guardarCarpeta", inventario: inv, archivos });
}

app.get("/api/ficha/:inv/estado", sesion, (req, res) => res.json({ ok: true, ficha_generando: generacion.get(String(req.params.inv)) || null }));

app.get("/api/foto/:inv/:orden", async (req, res) => {
  try { if (jwt.verify(String(req.query.t || ""), SECRETO).proposito !== "fotos") throw 0; } catch (e) { return res.status(401).end(); }
  try {
    const [f] = await sql`SELECT imagen FROM fotos_capturadas WHERE no_inventario = ${String(req.params.inv)} AND orden = ${Number(req.params.orden) || 0}`;
    if (!f) return res.status(404).end();
    res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" }).send(Buffer.from(f.imagen));
  } catch (e) { fallo(res, e, "No se pudo cargar la foto."); }
});

// ── Ficha técnica en PDF. Paso 1 (con sesión): un enlace que dura 5 min. Paso 2: el PDF, pedido a Drive y guardado un rato en memoria.
app.get("/api/ficha/:inv/enlace", sesion, (req, res) => {
  if (req.soloCaptura) return res.status(403).json({ ok: false, mensaje: "Tu usuario solo captura fotos." });
  const inv = String(req.params.inv).replace(/\D/g, "");
  res.json({ ok: true, url: `/api/ficha/${inv}/pdf?t=${jwt.sign({ proposito: "ficha", inv }, SECRETO, { expiresIn: "5m" })}` });
});

const cachePdf = new Map();   // inv -> { bytes, hasta }
async function pdfDeDrive(inv) {
  const c = cachePdf.get(inv);
  if (c && c.hasta > Date.now()) return c.bytes;
  if (!process.env.APPS_SCRIPT_FICHAS_URL) throw new Error("Falta APPS_SCRIPT_FICHAS_URL");
  let ultimo;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(process.env.APPS_SCRIPT_FICHAS_URL, {
        method: "POST", headers: { "Content-Type": "application/json" }, redirect: "follow", signal: AbortSignal.timeout(40000),
        body: JSON.stringify({ accion: "obtener", no_inventario: inv, clave: process.env.APPS_SCRIPT_FICHAS_CLAVE }),
      });
      const d = await r.json();   // Apps Script a veces responde una página de error HTML: se reintenta
      if (!d.ok) { const e = new Error(d.error || "Drive no devolvió la ficha"); e.definitivo = /no tiene ficha/.test(d.error || ""); throw e; }
      const bytes = Buffer.from(d.pdf_base64, "base64");
      if (cachePdf.size > 150) cachePdf.delete(cachePdf.keys().next().value);
      cachePdf.set(inv, { bytes, hasta: Date.now() + 30 * 60000 });
      return bytes;
    } catch (e) {
      ultimo = e;
      if (e.definitivo) break;
      await new Promise(r => setTimeout(r, 1200 * intento));
    }
  }
  throw ultimo;
}

app.get("/api/ficha/:inv/pdf", async (req, res) => {
  let t;
  try { t = jwt.verify(String(req.query.t || ""), SECRETO); } catch (e) { return res.status(401).send("El enlace de la ficha venció. Vuelve a abrirla desde el sistema."); }
  if (t.proposito !== "ficha" || t.inv !== req.params.inv) return res.status(401).send("Enlace no válido.");
  const enviar = (bytes) => {
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="FICHA_${t.inv}.pdf"`, "Cache-Control": "private, max-age=300" });
    res.send(bytes);
  };
  try {
    enviar(await pdfDeDrive(t.inv));
  } catch (e) {
    // En local, mientras se suben a Drive: el PDF generado en public/p o public/q
    if (fs.existsSync(FRONT)) {
      const [b] = await sql`SELECT pdf FROM bienes WHERE no_inventario = ${t.inv}`.catch(() => []);
      const local = b && b.pdf && path.join(FRONT, b.pdf);
      if (local && fs.existsSync(local)) return enviar(fs.readFileSync(local));
    }
    console.error("Ficha", t.inv, e.message);
    res.status(e.definitivo ? 404 : 502).send(e.definitivo ? "Este bien todavía no tiene su ficha técnica en Drive." : "Drive no respondió. Intenta de nuevo en unos segundos.");
  }
});

// El asistente guarda su apariencia en el navegador; aquí solo se responde para que no marque error
app.all("/api/auth/preferencias", (req, res) => res.json({}));
app.use("/api", (req, res) => res.status(404).json({ ok: false, mensaje: "Ruta no encontrada" }));

// Solo en local: el front
const FRONT = path.join(__dirname, "..", "public");
if (fs.existsSync(FRONT)) app.use(express.static(FRONT));

const PUERTO = process.env.PORT || 4310;
app.listen(PUERTO, () => console.log(`Bienes en http://localhost:${PUERTO}`));
