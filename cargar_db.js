// Carga data/bienes.json, sus fotos y los usuarios en Neon. Se puede correr las veces que haga falta:
// actualiza lo que ya existe y NO toca los estatus capturados en el sistema (estatus_capturas).
// Uso: node cargar_db.js
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const sql = neon(fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/DATABASE_URL=(.*)/)[1].trim());
const bienes = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "bienes.json"), "utf8"));
const { usuarios } = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "usuarios.json"), "utf8"));

const COLUMNAS = ["no_inventario", "descripcion", "clave_armonizada", "cog", "marca", "modelo", "serie", "material", "color",
  "agrupados", "moi", "fecha_adquisicion", "edificio", "organo_superior", "unidad_presupuestal", "adscripcion", "ubicacion",
  "folio_fiscal", "caracteristicas", "resguardo", "estatus_contable", "estado_fisico", "estado_ficha", "condicion_foto",
  "reviso", "revisado_en", "padron", "clasificacion", "clasificacion_padron", "app_clasificacion", "propuesta_dif",
  "pendiente", "pdf", "ficha_previa", "origen", "avisos"];

const fila = (b) => ({
  ...b, reviso: b["revisó"] || null, revisado_en: b.revisado_en || null, fecha_adquisicion: b.fecha_adquisicion || null,
  ficha_previa: !!b.ficha, origen: b.filas || [], avisos: b.avisos || [], moi: b.moi || 0,
  // lo capturado en el sistema vive en estatus_capturas; aquí va la clasificación de origen
  clasificacion: b.pendiente ? "Pendiente de estatus" : b.clasificacion,
});

(async () => {
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'completo'`;
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS unidad TEXT`;
  for (const u of usuarios) {
    await sql`INSERT INTO usuarios (usuario, password_hash, area, rol, unidad) VALUES (${u.usuario}, ${u.password_hash}, ${u.area}, ${u.rol || "completo"}, ${u.unidad || null})
      ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash, area = EXCLUDED.area, rol = EXCLUDED.rol, unidad = EXCLUDED.unidad`;
  }
  const LOTE = 100;
  for (let i = 0; i < bienes.length; i += LOTE) {
    const parte = bienes.slice(i, i + LOTE).map(fila);
    const valores = [], marcas = [];
    parte.forEach((b, j) => {
      marcas.push("(" + COLUMNAS.map((_, k) => `$${j * COLUMNAS.length + k + 1}`).join(",") + ")");
      COLUMNAS.forEach(c => valores.push(b[c] === undefined || b[c] === "" ? null : b[c]));
    });
    await sql.query(`INSERT INTO bienes (${COLUMNAS.join(",")}) VALUES ${marcas.join(",")}
      ON CONFLICT (no_inventario) DO UPDATE SET ${COLUMNAS.slice(1).map(c => `${c} = EXCLUDED.${c}`).join(", ")}, actualizado = now()`, valores);
    const fotos = parte.flatMap(b => (b.fotos || []).map((r, k) => [b.no_inventario, k + 1, r]));
    await sql.query(`DELETE FROM fotos WHERE no_inventario = ANY($1)`, [parte.map(b => b.no_inventario)]);
    if (fotos.length) await sql.query(`INSERT INTO fotos (no_inventario, orden, ruta) VALUES ${fotos.map((_, k) => `($${k * 3 + 1},$${k * 3 + 2},$${k * 3 + 3})`).join(",")}`, fotos.flat());
    process.stdout.write(`${Math.min(i + LOTE, bienes.length)} de ${bienes.length}\r`);
  }
  // bienes que ya no vienen en los datos (no se borran solos: se avisa)
  const sobran = await sql`SELECT no_inventario FROM bienes WHERE NOT (no_inventario = ANY(${bienes.map(b => b.no_inventario)}))`;
  const [t] = await sql`SELECT (SELECT count(*) FROM bienes) bienes, (SELECT count(*) FROM fotos) fotos, (SELECT count(*) FROM estatus_capturas) capturas, (SELECT count(*) FROM usuarios) usuarios`;
  console.log("\nEn la base:", t, sobran.length ? `· en la base pero no en los datos: ${sobran.map(s => s.no_inventario).join(", ")}` : "");
})().catch(e => { console.error(e); process.exit(1); });
