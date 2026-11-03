#!/usr/bin/env bash
# Publica el front en Netlify sin los PDF locales (p/ y q/): las fichas se ven desde Drive vía el servidor.
# Uso: bash deploy-front.sh <SITE_ID>
set -euo pipefail
cd "$(dirname "$0")"
DESTINO="$(mktemp -d)"
cp -r public/. "$DESTINO/"
rm -rf "$DESTINO/p" "$DESTINO/q"
cp netlify.toml "$DESTINO/"
netlify deploy --prod --dir="$DESTINO" --site="$1" --message "Bienes en propuesta de baja"
rm -rf "$DESTINO"
