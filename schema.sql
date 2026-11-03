-- Sistema de Bienes en propuesta de baja (Neon / PostgreSQL)
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY, usuario TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, area TEXT NOT NULL DEFAULT 'Bienes'
);
CREATE TABLE IF NOT EXISTS bienes (
  no_inventario TEXT PRIMARY KEY,
  descripcion TEXT, clave_armonizada TEXT, cog TEXT, marca TEXT, modelo TEXT, serie TEXT,
  material TEXT, color TEXT, agrupados TEXT, moi NUMERIC(14,2) DEFAULT 0, fecha_adquisicion DATE,
  edificio TEXT, organo_superior TEXT, unidad_presupuestal TEXT, adscripcion TEXT, ubicacion TEXT,
  folio_fiscal TEXT, caracteristicas TEXT, resguardo TEXT, estatus_contable TEXT,
  estado_fisico TEXT, estado_ficha TEXT, condicion_foto TEXT, reviso TEXT, revisado_en DATE,
  padron TEXT NOT NULL,                 -- Baja definitiva / Reaprovechamiento / Fuera del padrón
  clasificacion TEXT NOT NULL,          -- la de origen (antes de capturar estatus)
  clasificacion_padron TEXT, app_clasificacion TEXT, propuesta_dif TEXT,
  pendiente TEXT,                       -- motivo si está pendiente de estatus
  pdf TEXT, ficha_previa BOOLEAN DEFAULT FALSE,
  origen TEXT[] DEFAULT '{}', avisos TEXT[] DEFAULT '{}',
  actualizado TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fotos (
  id SERIAL PRIMARY KEY, no_inventario TEXT NOT NULL REFERENCES bienes ON DELETE CASCADE,
  orden INT NOT NULL, ruta TEXT NOT NULL, UNIQUE (no_inventario, orden)
);
-- Estatus que se captura en el sistema para los "Pendiente de estatus"
CREATE TABLE IF NOT EXISTS estatus_capturas (
  no_inventario TEXT PRIMARY KEY REFERENCES bienes ON DELETE CASCADE,
  clasificacion TEXT NOT NULL CHECK (clasificacion IN ('Baja definitiva','Para reaprovechamiento','Propuesta DIF')),
  quien TEXT NOT NULL, cuando TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bienes_clasificacion ON bienes (clasificacion);
