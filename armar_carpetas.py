# Arma _carpetas_tmp/<inv>/ con "<inv> img N.jpg" y "FICHA_<inv>.pdf" (para subir_carpetas.js)
import json, os, shutil
from PIL import Image
AQUI = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(AQUI, "_carpetas_tmp")
bienes = json.load(open(os.path.join(AQUI, "data", "bienes.json"), encoding="utf-8"))
_cap = os.path.join(AQUI, "data", "fotos_capturadas.json")
cap = json.load(open(_cap, encoding="utf-8")) if os.path.exists(_cap) else {}
n = 0
for b in bienes:
    inv = b["no_inventario"]; d = os.path.join(DEST, inv); os.makedirs(d, exist_ok=True)
    for k, f in enumerate((b.get("fotos") or cap.get(inv, []))[:3], 1):
        src = os.path.join(AQUI, "public", f); dst = os.path.join(d, f"{inv} img {k}.jpg")
        if f.lower().endswith((".jpg", ".jpeg")): shutil.copyfile(src, dst)
        else: Image.open(src).convert("RGB").save(dst, quality=90)
    pdf = os.path.join(AQUI, "public", b["pdf"])
    if os.path.exists(pdf): shutil.copyfile(pdf, os.path.join(d, f"FICHA_{inv}.pdf")); n += 1
print(f"{len(bienes)} carpetas, {n} con ficha")
