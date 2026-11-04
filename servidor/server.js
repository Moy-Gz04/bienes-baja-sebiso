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
app.use((req, res, next) => (/^\/api\/bienes\/[^/]+\/fotos$/.test(req.path) ? jsonFotos : jsonChico)(req, res, next));
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

// rol "captura": solo ve los bienes sin fotos y solo puede tomarlas
sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'completo'`.catch(e => console.error("rol:", e.message));

const fallo = (res, e, mensaje) => { console.error(mensaje, e); res.status(500).json({ ok: false, mensaje }); };

app.get("/api/salud", (req, res) => res.json({ ok: true }));

// ── Inicio de sesión (con freno a intentos repetidos por IP)
const intentos = new Map();
app.post("/api/auth/login", async (req, res) => {
  const ip = req.ip, ahora = Date.now();
  const reg = (intentos.get(ip) || []).filter(t => ahora - t < 15 * 60000);
  if (reg.length >= 10) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });
  try {
    const usuario = String(req.body?.usuario || "").trim();
    const [u] = await sql`SELECT id, usuario, password_hash, area, rol FROM usuarios WHERE usuario = ${usuario}`;
    if (!u || !bcrypt.compareSync(String(req.body?.password || ""), u.password_hash)) {
      intentos.set(ip, [...reg, ahora]);
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }
    intentos.delete(ip);
    res.json({ token: jwt.sign({ id: u.id, usuario: u.usuario, area: u.area, rol: u.rol }, SECRETO, { expiresIn: "8h" }), area: u.area, rol: u.rol });
  } catch (e) { fallo(res, e, "No se pudo iniciar sesión."); }
});

function sesion(req, res, next) {
  try {
    req.usuario = jwt.verify(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), SECRETO);
    if (req.usuario.proposito) throw new Error("token de otro tipo");
    req.soloCaptura = req.usuario.rol === "captura";
    req.soloComprobar = req.usuario.rol === "comprobar";   // solo ve Propuesta DIF y marca palomita / equis
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
        (SELECT max(c.quien || '|' || to_char(c.cuando, 'YYYY-MM-DD')) FROM fotos_capturadas c WHERE c.no_inventario = b.no_inventario) AS foto_captura
      FROM bienes b LEFT JOIN estatus_capturas e USING (no_inventario) LEFT JOIN comprobaciones k USING (no_inventario)
      ORDER BY length(b.no_inventario), b.no_inventario`;
    const tf = jwt.sign({ proposito: "fotos" }, SECRETO, { expiresIn: "8h" });
    const bienes = filas.map(({ capturado, capturo, capturado_en, reviso, ficha_previa, origen, pdf, pdf_drive_id, actualizado, n_capturadas, foto_captura, comp_valor, comp_quien, comp_cuando, ...b }) => ({
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
    res.json({ ok: true, fotos: [1, 2, 3].map(i => `api/foto/${inv}/${i}?t=${tf}&v=${Date.now()}`), fotos_capturadas: { quien, cuando: new Date().toISOString().slice(0, 10) } });
  } catch (e) { fallo(res, e, "No se pudieron guardar las fotos."); }
});

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
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Ficha tecnica ${t.inv}.pdf"`, "Cache-Control": "private, max-age=300" });
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
