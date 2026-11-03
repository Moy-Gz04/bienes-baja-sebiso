# Lee las fichas técnicas escaneadas de "FT-PAG Nueva" (PDF de imagen, una ficha por página) con Tesseract:
# cada celda del formato por separado. Guarda data/ft_pag.json, cada página como PDF (public/q/) y sus fotos (public/f/).
# Uso: python leer_ft_pag.py
import glob, hashlib, json, os, re, subprocess, tempfile
import pymupdf
from PIL import Image
import io

AQUI = os.path.dirname(os.path.abspath(__file__))
CARPETA = r"C:/Users/jgome/OneDrive/Escritorio/FT-PAG Nueva"
SAL = b"sebiso-bienes-baja"
os.makedirs(os.path.join(AQUI, "public", "q"), exist_ok=True)
os.makedirs(os.path.join(AQUI, "public", "f"), exist_ok=True)

# Las columnas cambian de ancho en cada ficha: se detectan en la imagen. Los encabezados son franjas guinda;
# entre celda y celda hay una línea blanca de arriba a abajo. Debajo de cada franja va la fila de datos.
ZOOM = 2   # 144 dpi
CAMPOS = [
    ["no_inventario", "descripcion", "marca", "modelo", "serie", "material", "color", "agrupados"],
    ["organo_superior", "unidad_presupuestal", "adscripcion", "ubicacion"],
    ["fecha", "monto", "cog", "clave_armonizada", "resguardo", "estatus_contable"],
]
tmp = os.path.join(tempfile.gettempdir(), "ftpag.png")
guinda = lambda c: 80 < c[0] < 175 and c[1] < 75 and c[2] < 95

def franjas(im):
    W, H = im.size; filas = []
    for y in range(0, H):
        if sum(1 for x in range(0, W, 6) if guinda(im.getpixel((x, y)))) > W / 6 * 0.5: filas.append(y)
    g = []
    for y in filas:
        if g and y - g[-1][1] <= 2: g[-1][1] = y
        else: g.append([y, y])
    return [t for t in g if t[1] - t[0] >= 8]           # bandas de encabezado (descarta líneas finas)

def columnas(im, a, b):
    xs = [x for x in range(0, im.size[0]) if any(guinda(im.getpixel((x, y))) for y in range(a + 2, b - 1, 2))]
    ini, fin = xs[0], xs[-1]
    cortes, prev = [], xs[0]
    for x in xs[1:]:
        if 1 < x - prev <= 10: cortes.append((prev + x) // 2)
        prev = x
    return [ini] + cortes + [fin]

def ocr(p, rect):
    p.get_pixmap(dpi=400, clip=rect).save(tmp)
    t = subprocess.run(["tesseract", tmp, "-", "--psm", "6", "-l", "spa"], capture_output=True, text=True, encoding="utf-8").stdout
    t = re.sub(r"\s+", " ", t).strip(" |")
    return "" if len(re.sub(r"[^A-Za-z0-9ÁÉÍÓÚÑ]", "", t)) <= 2 else t   # celda vacía que el OCR llena de rayas

def monto(t):
    d = re.sub(r"[^\d]", "", t)            # "$2 033.00", "$1. 374.00", "$3.004. 40" -> centavos
    return round(int(d) / 100, 2) if len(d) >= 3 else 0

def fecha(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else ""

fichas = {}
for archivo in sorted(glob.glob(os.path.join(CARPETA, "*.pdf"))):
    doc = pymupdf.open(archivo)
    for i, p in enumerate(doc):
        pix = p.get_pixmap(dpi=72 * ZOOM); im = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        bandas = franjas(im)
        if len(bandas) < 3: print("sin tabla:", archivo, i + 1); continue
        d = {}
        for k, (a, b) in enumerate(bandas[:3]):
            xs = columnas(im, a, b)
            alto = (bandas[k + 1][0] - b - 2) if k < 2 else 26 * ZOOM
            for campo, x0, x1 in zip(CAMPOS[k], xs, xs[1:]):
                d[campo] = ocr(p, pymupdf.Rect(x0 / ZOOM + 1, b / ZOOM + 1, x1 / ZOOM - 1, (b + alto) / ZOOM))
        num = re.sub(r"\D", "", d["no_inventario"])
        if not num: continue
        d["no_inventario"] = num
        d["moi"] = monto(d.pop("monto")); d["fecha_adquisicion"] = fecha(d.pop("fecha"))
        d["origen"] = f"{os.path.basename(archivo)} página {i + 1}"
        if num in fichas:                      # la misma ficha en dos páginas: se queda la primera
            fichas[num]["duplicada_en"] = d["origen"]; continue
        # la página tal cual, como PDF propio
        nombre = hashlib.sha1(SAL + f"ftpag/{num}".encode()).hexdigest()[:24]
        uno = pymupdf.open(); uno.insert_pdf(doc, from_page=i, to_page=i); uno.save(os.path.join(AQUI, "public", "q", nombre + ".pdf"), garbage=3, deflate=True)
        d["pdf"] = f"q/{nombre}.pdf"
        # fotos: debajo de la franja "MEMORIA FOTOGRÁFICA" hay tres cajas; se recorta lo que no es blanco en cada tercio
        d["fotos"] = []
        if True:
            y0 = bandas[2][1] + 44 * ZOOM      # debajo de la fila de datos y del título "MEMORIA FOTOGRÁFICA"
            W = im.size[0]; x_ini, x_fin = int(W * 0.04), int(W * 0.96)
            for k in range(3):
                a0 = x_ini + (x_fin - x_ini) * k // 3; a1 = x_ini + (x_fin - x_ini) * (k + 1) // 3
                caja = im.crop((a0, y0, a1, y0 + 190 * ZOOM)).convert("L").point(lambda v: 0 if v > 235 else 255)
                bb = caja.getbbox()
                if not bb or (bb[2] - bb[0]) < 60 * ZOOM: continue
                r = pymupdf.Rect((a0 + bb[0]) / ZOOM, (y0 + bb[1]) / ZOOM, (a0 + bb[2]) / ZOOM, (y0 + bb[3]) / ZOOM)
                fp = p.get_pixmap(dpi=200, clip=r); foto = Image.frombytes("RGB", [fp.width, fp.height], fp.samples)
                foto.thumbnail((1400, 1400))
                ruta = f"f/{hashlib.sha1(SAL + f'ftpag/{num}/{k}'.encode()).hexdigest()[:24]}.jpg"
                foto.save(os.path.join(AQUI, "public", ruta), quality=82, optimize=True)
                d["fotos"].append(ruta)
        fichas[num] = d
json.dump(fichas, open(os.path.join(AQUI, "data", "ft_pag.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(fichas)} fichas únicas, con fotos: {sum(1 for f in fichas.values() if f['fotos'])}")
