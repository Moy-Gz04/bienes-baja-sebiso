# Bienes en propuesta de baja · SEBISO

Sistema de consulta de los padrones de bienes muebles en propuesta de baja (Baja definitiva, Reaprovechamiento,
Propuesta DIF), con ficha técnica en PDF (formato oficial), fotos y captura de estatus de los pendientes.

- `servidor/` — API en Render (Express + Neon). Fichas PDF en Drive vía Apps Script (`apps-script-fichas.gs`).
- `public/` — front en Netlify; `/api/*` se reenvía al servidor (`netlify.toml`). Las fotos (`public/f`) se publican con `deploy-front.sh`, no van en el repositorio.
- Datos: `preparar_datos.py` (Excel de padrones + fotos + fichas) → `cargar_db.js` (Neon) → `subir_fichas.js` (Drive).

Variables del servidor: `DATABASE_URL`, `JWT_SECRET`, `APPS_SCRIPT_FICHAS_URL`, `APPS_SCRIPT_FICHAS_CLAVE`.
