# Une el Excel de padrones con la carpeta de fotos y genera data/bienes.json + public/f/*.jpg
# Uso: python preparar_datos.py
# - Un número de inventario = un bien (las filas repetidas se juntan, no se pierde ningún dato).
# - Si el número está en las dos hojas, queda en Baja definitiva y se anota que también venía en Reaprovechamiento.
# - Las carpetas de fotos sin fila en el Excel también entran (marcadas "Solo fotos").
import datetime, hashlib, json, os, re, sys
import openpyxl
from PIL import Image, ImageOps

EXCEL = r"C:/Users/jgome/Downloads/PADRONES  PROPUESTA DE BAJA DEPURADO.xlsx"
FOTOS = r"C:/Users/jgome/OneDrive/Escritorio/RespaldoFotos"
AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA_FOTOS = os.path.join(AQUI, "public", "f")
SAL = b"sebiso-bienes-baja"
CONDICION = {"B": "Bueno", "R": "Regular", "M": "Malo", "I": "Inservible"}

def texto(v):
    if v is None: return ""
    if isinstance(v, datetime.datetime): return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v.is_integer(): v = int(v)
    t = re.sub(r"\s+", " ", str(v)).strip()
    return "" if t.upper() in ("NULL", "N/A", "NONE") else t

wb = openpyxl.load_workbook(EXCEL, data_only=True)
bienes, orden = {}, []
for hoja, padron in (("BAJA DEFINITIVA", "Baja definitiva"), ("REAPROVECHAMIENTO", "Reaprovechamiento")):
    ws = wb[hoja]
    enc = [texto(c.value) for c in ws[2]]
    for fila_n, fila in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
        d = dict(zip(enc, fila))
        num = texto(d.get("NUMERO DE INVENTARIO"))
        if not num: continue
        reg = {
            "no_inventario": num,
            "descripcion": texto(d.get("DESCRIPCION")),
            "clave_armonizada": texto(d.get("CLAVE ARMONIZADA")),
            "cog": texto(d.get("COG")),
            "marca": texto(d.get("MARCA")), "modelo": texto(d.get("MODELO")), "serie": texto(d.get("SERIE")),
            "moi": float(d.get("M.O.I.") or 0),
            "fecha_adquisicion": texto(d.get("FECHA DE ADQUISICION")),
            "edificio": texto(d.get("EDIFICIO")),
            "organo_superior": texto(d.get("ORGANO SUPERIOR")),
            "unidad_presupuestal": texto(d.get("UNIDAD PRESUPUESTAL")),
            "adscripcion": texto(d.get("ADSCRIPCION")),
            "folio_fiscal": texto(d.get("FOLIO FISCAL")),
            "caracteristicas": texto(d.get("CARACTERISTICAS")),
            "estado_fisico": texto(d.get("EDO. FISICO")).capitalize(),
            "propuesta_dif": texto(d.get("PROPUESTA DIF")),
        }
        origen = f"{hoja} fila {fila_n}"
        if num not in bienes:
            reg.update(padron=padron, filas=[origen], avisos=[])
            bienes[num] = reg; orden.append(num)
            continue
        b = bienes[num]
        b["filas"].append(origen)
        if b["padron"] != padron:
            b["avisos"].append(f"También aparece en {padron} como {reg['estado_fisico'] or 'sin estado'}"
                              + (f" (propuesta {reg['propuesta_dif']})" if reg["propuesta_dif"] else "") + ".")
            if reg["propuesta_dif"] and not b["propuesta_dif"]: b["propuesta_dif"] = reg["propuesta_dif"]
        # completa campos vacíos con lo que traiga la otra fila (no se pierde nada)
        for k, v in reg.items():
            if v and not b.get(k): b[k] = v

for b in bienes.values():
    n = len(b["filas"])
    if n > 1 and not b["avisos"]:
        b["avisos"].append(f"Venía {n} veces en el Excel con los mismos datos; se cuenta una sola vez.")
    b["clasificacion"] = ("Propuesta DIF" if b["propuesta_dif"] else "Para reaprovechamiento") if b["padron"] == "Reaprovechamiento" else b["padron"]

# Pendiente de estatus: los que la conciliación marcó en los dos padrones (169 repetidos.xlsx)
# y los que en el Depurado siguen en las dos hojas. Su estatus se captura en el sistema.
CONCILIACION = r"C:/Users/jgome/Downloads/169 repetidos.xlsx"
ws = openpyxl.load_workbook(CONCILIACION, data_only=True).active
enc = [texto(c.value) for c in ws[1]]
for fila in ws.iter_rows(min_row=2, values_only=True):
    d = dict(zip(enc, fila)); num = texto(d.get("INVENTARIO"))
    if num not in bienes: continue
    b = bienes[num]
    b["pendiente"] = "Venía en Baja definitiva y en Reaprovechamiento (conciliación de 169 repetidos)."
    b["app_clasificacion"] = texto(d.get("CLASIFICACION APP")).capitalize()
    if texto(d.get("ALERTA DUPLICADO")): b["avisos"].append("La App lo tiene capturado dos veces: " + texto(d.get("OBSERVACIONES APP ORIGINAL")) + ".")
for b in bienes.values():
    if not b.get("pendiente") and len({f.split(" fila")[0] for f in b["filas"]}) > 1:
        b["pendiente"] = "Está en Baja definitiva y en Reaprovechamiento dentro del padrón depurado."
    if b.get("pendiente"):
        b["clasificacion_padron"] = b["clasificacion"]
        b["clasificacion"] = "Pendiente de estatus"

# Fotos
os.makedirs(SALIDA_FOTOS, exist_ok=True)
# Segunda carpeta de fotos (_fotos): solo se usa para los bienes que no traen fotos en RespaldoFotos
FOTOS2 = r"C:/Users/jgome/OneDrive/Escritorio/_fotos"
carpetas = [(FOTOS, c, "") for c in sorted(os.listdir(FOTOS), key=lambda x: (len(x), x))]
if os.path.isdir(FOTOS2): carpetas += [(FOTOS2, c, "_fotos/") for c in sorted(os.listdir(FOTOS2), key=lambda x: (len(x), x))]
for base, c, pref in carpetas:
    ruta = os.path.join(base, c)
    if not os.path.isdir(ruta): continue
    if pref and (c not in bienes or bienes[c].get("fotos") or not any(x.lower().endswith(".jpg") for x in os.listdir(ruta))): continue
    if c not in bienes:
        bienes[c] = {"no_inventario": c, "descripcion": "", "padron": "Solo fotos", "clasificacion": "Solo fotos",
                     "moi": 0, "filas": [], "avisos": ["Tiene fotos pero no aparece en el Excel de padrones."]}
        orden.append(c)
    b = bienes[c]
    try:
        cond = json.load(open(os.path.join(ruta, "condicion.json"), encoding="utf-8"))
        b["condicion_foto"] = CONDICION.get(cond.get("condicion"), cond.get("condicion"))
        b["revisó"] = cond.get("quien", ""); b["revisado_en"] = (cond.get("cuando") or "")[:10]
    except FileNotFoundError:
        pass
    try: origen = json.load(open(os.path.join(ruta, "origen.json"), encoding="utf-8"))
    except FileNotFoundError: origen = {}
    fotos = []
    for f in sorted((x for x in os.listdir(ruta) if x.lower().endswith(".jpg")), key=lambda x: int(re.sub(r"\D", "", x) or 0)):
        nombre = hashlib.sha1(SAL + f"{pref}{c}/{f}".encode()).hexdigest()[:24] + ".jpg"
        destino = os.path.join(SALIDA_FOTOS, nombre)
        if not os.path.exists(destino):
            im = ImageOps.exif_transpose(Image.open(os.path.join(ruta, f))).convert("RGB")
            im.thumbnail((1400, 1400)); im.save(destino, quality=80, optimize=True)
        fotos.append("f/" + nombre)
        if not b.get("revisó"):
            o = origen.get(f.rsplit(".", 1)[0]) or {}
            b["revisó"] = o.get("quien", ""); b["revisado_en"] = (o.get("cuando") or "")[:10]
    b["fotos"] = fotos
    if pref: b["fotos_de_carpeta"] = True   # vienen de _fotos: se respetan aunque se repitan

for b in bienes.values():
    b.setdefault("fotos", [])

# Fichas técnicas (un Excel por bien): se agregan material, color, ubicación y estado de la ficha,
# se copia el archivo para descargarlo y se avisa si algo no coincide con el padrón.
FICHAS = r"C:/Users/jgome/OneDrive/Escritorio/Fichas"
SALIDA_FICHAS = os.path.join(AQUI, "public", "x")
os.makedirs(SALIDA_FICHAS, exist_ok=True)
import shutil
# Segunda carpeta: "Encontradas" (fichas de bienes que no tenían ficha/fotos). Sus 3 fotos incrustadas se usan
# como fotos del bien solo si el bien no tiene fotos propias (se descarta el logo de la esquina K1).
ENCONTRADAS = r"C:/Users/jgome/OneDrive/Escritorio/Encontradas"
import io
def fotos_de_ficha(ws, num):
    rutas = []
    imgs = sorted((i for i in ws._images if not (i.anchor._from.col >= 10 and i.anchor._from.row <= 1)),
                  key=lambda i: (i.anchor._from.row, i.anchor._from.col))
    for k, img in enumerate(imgs, start=1):
        nombre = hashlib.sha1(SAL + f"encontradas/{num}/{k}".encode()).hexdigest()[:24] + ".jpg"
        destino = os.path.join(SALIDA_FOTOS, nombre)
        if not os.path.exists(destino):
            im = ImageOps.exif_transpose(Image.open(io.BytesIO(img._data()))).convert("RGB")
            im.thumbnail((1400, 1400)); im.save(destino, quality=80, optimize=True)
        rutas.append("f/" + nombre)
    return rutas
sin_bien, fotos_ficha = [], []
archivos = [(FICHAS, f) for f in sorted(os.listdir(FICHAS))]
if os.path.isdir(ENCONTRADAS): archivos += [(ENCONTRADAS, f) for f in sorted(os.listdir(ENCONTRADAS))]
for carpeta, f in archivos:
    if not f.lower().endswith(".xlsx"): continue
    ws = openpyxl.load_workbook(os.path.join(carpeta, f), data_only=True).active
    d = {texto(ws.cell(2, i).value): ws.cell(3, i).value for i in range(1, 13)}
    d.update({texto(ws.cell(5, i).value): ws.cell(6, i).value for i in range(1, 8)})
    num = texto(d.get("NUMERO DE INVENTARIO")) or f[:-5]
    if num not in bienes: sin_bien.append(num); continue
    b = bienes[num]
    nombre = hashlib.sha1(SAL + f"ficha/{num}".encode()).hexdigest()[:24] + ".xlsx"
    b["ficha"] = True
    if carpeta == ENCONTRADAS and not b.get("fotos"):
        b["fotos"] = fotos_de_ficha(ws, num); fotos_ficha.append(num)
    b["material"] = texto(d.get("MATERIAL")); b["color"] = texto(d.get("COLOR"))
    b["ubicacion"] = texto(d.get("UBICACIÓN"))
    b["estado_ficha"] = CONDICION.get(texto(d.get("ESTADO FÍSICO Y OPERATIVO DEL BIEN")), "")
    for campo, valor in (("resguardo", d.get("RESGUARDO")), ("estatus_contable", d.get("ESTATUS CONTABLE")), ("agrupados", d.get("AGRUPADOS"))):
        if texto(valor): b[campo] = texto(valor)
    if b["estado_ficha"] and b.get("estado_fisico") and b["estado_ficha"] != b["estado_fisico"]:
        b["avisos"].append(f"La ficha técnica dice estado {b['estado_ficha']} y el padrón dice {b['estado_fisico']}.")
    if b["estado_ficha"] and b.get("condicion_foto") and b["estado_ficha"] != b["condicion_foto"]:
        b["avisos"].append(f"La ficha técnica dice estado {b['estado_ficha']} y la revisión de fotos dice {b['condicion_foto']}.")
print(f"fichas: {sum(1 for b in bienes.values() if b.get('ficha'))}, sin bien en el sistema: {sin_bien}, con fotos tomadas de la ficha: {len(fotos_ficha)}")

# PDF de la ficha técnica con el formato oficial (lo generan generar_fichas.py + convertir_pdf.ps1)
for b in bienes.values():
    b["pdf"] = "p/" + hashlib.sha1(SAL + ("pdf/" + b["no_inventario"]).encode()).hexdigest()[:24] + ".pdf"

# Fichas escaneadas de "FT-PAG Nueva" (leer_ft_pag.py): ya traen el formato oficial con firmas, así que su
# página es el PDF del bien. Si el bien no estaba, se agrega como "Fuera del padrón" con lo leído de la ficha.
RUTA_FT = os.path.join(AQUI, "data", "ft_pag.json")
ESTADO_FT = {"BUENO": "Bueno", "REGULAR": "Regular", "MALO": "Malo", "INSERVIBLE": "Inservible"}
nuevos_ft = 0
if os.path.exists(RUTA_FT):
    # números que el OCR leyó mal, corregidos con una segunda/tercera lectura (data/ft_correcciones.json)
    CORR = json.load(open(os.path.join(AQUI, "data", "ft_correcciones.json"))) if os.path.exists(os.path.join(AQUI, "data", "ft_correcciones.json")) else {}
    for num, f in json.load(open(RUTA_FT, encoding="utf-8")).items():
        num = CORR.get(num, num)
        estado = ESTADO_FT.get(f.get("estatus_contable", "").upper().strip(" .,"), "")
        if num not in bienes:
            nuevos_ft += 1
            bienes[num] = {"no_inventario": num, "padron": "Fuera del padrón", "clasificacion": "Fuera del padrón", "filas": [],
                           "avisos": []}
            orden.append(num)
            b = bienes[num]
            for k in ("descripcion", "marca", "modelo", "serie", "organo_superior", "unidad_presupuestal", "adscripcion", "cog", "clave_armonizada", "fecha_adquisicion", "moi"):
                b[k] = f.get(k) or ("" if k != "moi" else 0)
        b = bienes[num]
        for k in ("material", "color", "ubicacion", "agrupados"):
            if f.get(k) and not b.get(k): b[k] = f[k]
        if f.get("resguardo") and not b.get("resguardo"): b["resguardo"] = f["resguardo"].title()
        if estado:
            if b.get("estado_ficha") and b["estado_ficha"] != estado:
                b["avisos"].append(f"La ficha escaneada dice estado {estado} y la ficha en Excel dice {b['estado_ficha']}.")
            b["estado_ficha"] = estado
        if not b.get("fotos"): b["fotos"] = f.get("fotos", [])
        b["pdf"] = f["pdf"]; b["ficha"] = True; b["ficha_escaneada"] = f["origen"]
        if f.get("duplicada_en"): b["avisos"].append(f"Su ficha escaneada viene dos veces ({f['origen']} y {f['duplicada_en']}).")
    print(f"fichas escaneadas integradas; bienes nuevos: {nuevos_ft}")
# "Solo fotos" también está fuera del padrón: un solo apartado
for b in bienes.values():
    if b["clasificacion"] == "Solo fotos": b["clasificacion"] = b["padron"] = "Fuera del padrón"

# Propuesta final de reubicación DIF (SEBISO PROPUESTA FINAL REUBICACION DIF.xlsx, hoja LISTADO DEL PADRON):
# todo lo que viene en el listado queda en "Propuesta DIF" con su área DIF. Los que no estaban en el sistema se
# agregan con los datos del listado. Los demás bienes no se tocan.
REUBICACION = r"C:/Users/jgome/Downloads/SEBISO PROPUESTA FINAL REUBICACION DIF.xlsx"
cambios_reub = {"agregados": [], "cambio_estatus": [], "cambio_area": []}
if os.path.exists(REUBICACION):
    def area_dif(t):
        t = t.upper()
        return "DIF PATRONATO" if "PATRONATO" in t else "DIF ASISTENCIA" if "ASISTENCIA" in t else "DIF NIÑEZ" if "ADOLESCENCIA" in t or "NIÑEZ" in t else ""
    wsr = openpyxl.load_workbook(REUBICACION, data_only=True)["LISTADO DEL PADRON"]
    encr = [texto(c.value) for c in wsr[4]]; en_listado = set()
    for fila in wsr.iter_rows(min_row=5, values_only=True):
        d = dict(zip(encr, fila)); num = texto(d.get("NUMERO DE INVENTARIO"))
        if not num: continue
        area = area_dif(texto(d.get("PROPUESTA DIF HIDALGO")))
        if num not in bienes:
            bienes[num] = {"no_inventario": num, "padron": "Fuera del padrón", "clasificacion": "Fuera del padrón", "filas": [], "avisos": [], "fotos": [],
                           "descripcion": texto(d.get("DESCRIPCION")), "clave_armonizada": texto(d.get("CLAVE ARMONIZADA")), "cog": texto(d.get("COG")),
                           "marca": texto(d.get("MARCA")), "modelo": texto(d.get("MODELO")), "serie": texto(d.get("SERIE")), "moi": float(d.get("M.O.I.") or 0),
                           "fecha_adquisicion": texto(d.get("FECHA DE ADQUISICION")), "edificio": texto(d.get("EDIFICIO")), "organo_superior": texto(d.get("ORGANO SUPERIOR")),
                           "unidad_presupuestal": texto(d.get("UNIDAD PRESUPUESTAL")), "adscripcion": texto(d.get("ADSCRIPCION")),
                           "pdf": "p/" + hashlib.sha1(SAL + ("pdf/" + num).encode()).hexdigest()[:24] + ".pdf"}
            orden.append(num); cambios_reub["agregados"].append(num)
        b = bienes[num]
        if b["clasificacion"] != "Propuesta DIF":
            b.setdefault("clasificacion_padron", b["clasificacion"])
            if num not in cambios_reub["agregados"]: cambios_reub["cambio_estatus"].append([num, b["clasificacion"]])
            b["clasificacion"] = "Propuesta DIF"
        elif (b.get("propuesta_dif") or "") != area: cambios_reub["cambio_area"].append([num, b.get("propuesta_dif"), area])
        b["propuesta_dif"] = area; b.pop("pendiente", None); en_listado.add(num)
    # Solo los bienes del listado quedan en DIF; los demás que estaban en DIF pasan a Pendiente de estatus
    cambios_reub["a_pendiente"] = []
    for b in bienes.values():
        if b["clasificacion"] == "Propuesta DIF" and b["no_inventario"] not in en_listado:
            b["pendiente"] = "Estaba en Propuesta DIF pero no viene en la propuesta final de reubicación DIF."
            b["propuesta_dif"] = ""; cambios_reub["a_pendiente"].append(b["no_inventario"])
    json.dump(cambios_reub, open(os.path.join(AQUI, "data", "reubicacion_cambios.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"reubicación DIF: {len(cambios_reub['agregados'])} agregados, {len(cambios_reub['cambio_estatus'])} cambian a Propuesta DIF, {len(cambios_reub['cambio_area'])} solo cambian de área")

# Bienes con exactamente las mismas fotos que otro bien (error de captura): se quitan para volver a tomarlas
huellas = {}
for b in bienes.values():
    if b.get("fotos"):
        h = tuple(sorted(hashlib.md5(open(os.path.join(AQUI, "public", f), "rb").read()).hexdigest() for f in b["fotos"]))
        huellas.setdefault(h, []).append(b["no_inventario"])
for grupo in (g for g in huellas.values() if len(g) > 1):
    for num in grupo:
        if bienes[num].get("fotos_de_carpeta"): continue
        otros = ", ".join(x for x in grupo if x != num)
        alt = os.path.join(FOTOS2, num)   # si _fotos trae las fotos de este bien, esas son las buenas
        jpgs = sorted((x for x in os.listdir(alt) if x.lower().endswith(".jpg")), key=lambda x: int(re.sub(r"\D", "", x) or 0)) if os.path.isdir(alt) else []
        if jpgs:
            nuevas = []
            for f in jpgs:
                nombre = hashlib.sha1(SAL + f"_fotos/{num}/{f}".encode()).hexdigest()[:24] + ".jpg"
                destino = os.path.join(SALIDA_FOTOS, nombre)
                if not os.path.exists(destino):
                    im = ImageOps.exif_transpose(Image.open(os.path.join(alt, f))).convert("RGB"); im.thumbnail((1400, 1400)); im.save(destino, quality=80, optimize=True)
                nuevas.append("f/" + nombre)
            bienes[num]["fotos"] = nuevas; bienes[num]["fotos_de_carpeta"] = True
            continue
        bienes[num]["fotos"] = []
        bienes[num]["avisos"].append(f"Tenía las mismas fotos que el {otros}; se quitaron para volver a tomarlas.")

# Bienes mostrados físicamente que no venían en ningún padrón (doc07880520261104164534.pdf): entran sin fotos y
# pendientes de estatus; las fotos y el estatus se capturan desde el sistema
for d in json.load(open(os.path.join(AQUI, "data", "agregados_doc.json"), encoding="utf-8")):
    num = d["no_inventario"]
    if num in bienes: continue
    bienes[num] = {"no_inventario": num, "descripcion": d["descripcion"], "padron": "Fuera del padrón", "clasificacion": "Fuera del padrón",
                   "moi": 0, "filas": [], "fotos": [], "avisos": ["Mostrado físicamente; no viene en los padrones."],
                   "pendiente": "Mostrado físicamente y no relacionado en los padrones: falta capturar su estatus."}
    orden.append(num)

# Fotos sueltas identificadas por su etiqueta (data/fotos_extra.json): solo para bienes que siguen sin fotos
_extra = os.path.join(AQUI, "data", "fotos_extra.json")
if os.path.exists(_extra):
    for num, rutas in json.load(open(_extra, encoding="utf-8")).items():
        if num not in bienes or bienes[num].get("fotos"): continue
        nuevas = []
        for r in rutas:
            nombre = hashlib.sha1(SAL + f"extra/{num}/{os.path.basename(r)}".encode()).hexdigest()[:24] + ".jpg"
            destino = os.path.join(SALIDA_FOTOS, nombre)
            if not os.path.exists(destino):
                im = ImageOps.exif_transpose(Image.open(r)).convert("RGB"); im.thumbnail((1400, 1400)); im.save(destino, quality=80, optimize=True)
            nuevas.append("f/" + nombre)
        bienes[num]["fotos"] = nuevas

lista = [bienes[n] for n in orden]
json.dump(lista, open(os.path.join(AQUI, "data", "bienes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
total_filas = sum(len(b["filas"]) for b in lista)
print(f"{len(lista)} bienes ({total_filas} filas del Excel), con fotos: {sum(1 for b in lista if b['fotos'])}, "
      f"fotos: {sum(len(b['fotos']) for b in lista)}")
from collections import Counter
print(Counter(b["clasificacion"] for b in lista))
