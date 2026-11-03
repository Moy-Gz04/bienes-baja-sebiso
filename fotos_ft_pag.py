# Recorta las 3 fotos de cada ficha escaneada (FT-PAG Nueva) buscando el bloque de la foto en cada tercio de la
# página, debajo de la tabla. Reescribe las fotos que usa data/ft_pag.json (mismos nombres de archivo).
# Uso: python fotos_ft_pag.py   (después de leer_ft_pag.py)
import json, os, re
import pymupdf
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
CARPETA = r"C:/Users/jgome/OneDrive/Escritorio/FT-PAG Nueva"
ZOOM = 2

def bloque(mascara_filas, minimo):
    """Tramo continuo más largo donde la fracción de tinta supera el umbral."""
    mejor, ini = (0, 0), None
    for i, v in enumerate(mascara_filas + [False]):
        if v and ini is None: ini = i
        if not v and ini is not None:
            if i - ini > mejor[1] - mejor[0]: mejor = (ini, i)
            ini = None
    return mejor if mejor[1] - mejor[0] >= minimo else None

fichas = json.load(open(os.path.join(AQUI, "data", "ft_pag.json"), encoding="utf-8"))
docs, malas = {}, []
for num, f in fichas.items():
    archivo, pagina = re.match(r"(.*) página (\d+)", f["origen"]).groups()
    doc = docs.setdefault(archivo, pymupdf.open(os.path.join(CARPETA, archivo)))
    p = doc[int(pagina) - 1]
    pix = p.get_pixmap(dpi=72 * ZOOM); im = Image.frombytes("RGB", [pix.width, pix.height], pix.samples).convert("L")
    W, H = im.size
    y_ini, y_fin = int(H * 0.36), int(H * 0.80)          # entre la tabla y los recuadros de firmas
    nuevas = []
    for k in range(3):
        a0, a1 = int(W * (0.03 + 0.315 * k)), int(W * (0.03 + 0.315 * (k + 1)))
        zona = im.crop((a0, y_ini, a1, y_fin)).point(lambda v: 255 if v < 235 else 0)
        zw, zh = zona.size; px = zona.load()
        filas = [sum(1 for x in range(0, zw, 3) if px[x, y]) / (zw / 3) > 0.45 for y in range(zh)]
        fb = bloque(filas, 40 * ZOOM)
        if not fb: continue
        cols = [sum(1 for y in range(fb[0], fb[1], 3) if px[x, y]) / ((fb[1] - fb[0]) / 3) > 0.45 for x in range(zw)]
        cb = bloque(cols, 40 * ZOOM)
        if not cb: continue
        r = pymupdf.Rect((a0 + cb[0]) / ZOOM, (y_ini + fb[0]) / ZOOM, (a0 + cb[1]) / ZOOM, (y_ini + fb[1]) / ZOOM)
        fp = p.get_pixmap(dpi=200, clip=r); foto = Image.frombytes("RGB", [fp.width, fp.height], fp.samples)
        foto.thumbnail((1400, 1400)); nuevas.append(foto)
    if len(nuevas) < 3: malas.append((num, len(nuevas)))
    # reescribe con los mismos nombres (los que ya están en la base)
    for ruta, foto in zip(f.get("fotos", []), nuevas):
        foto.save(os.path.join(AQUI, "public", ruta), quality=82, optimize=True)
    # recuadros vacíos en la ficha = el bien no tiene fotos (se capturan en el sistema)
    for ruta in f.get("fotos", [])[len(nuevas):]:
        try: os.remove(os.path.join(AQUI, "public", ruta))
        except FileNotFoundError: pass
    f["fotos"] = f.get("fotos", [])[:len(nuevas)]
json.dump(fichas, open(os.path.join(AQUI, "data", "ft_pag.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(fichas)} fichas; con menos de 3 fotos detectadas: {malas}")
