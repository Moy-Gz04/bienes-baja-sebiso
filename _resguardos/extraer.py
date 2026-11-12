import openpyxl,json,re,io,sys,os,unicodedata
sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image, ImageOps
W="C:/Users/jgome/AppData/Local/Temp/rs/"
OUT="C:/Users/jgome/OneDrive/Escritorio/Obsidian Vault/01 - Proyectos/Activos/BIENES-BAJA/_resguardos/fotos/"
os.makedirs(OUT,exist_ok=True)
wb=openpyxl.load_workbook(r"C:\Users\jgome\Downloads\BASE DE DATOS SEBISO a LIMPIAR.xlsm")
def s(v): return re.sub(r"\s+"," ",str(v)).strip() if v is not None else ""
def nk(t): return re.sub(r"[^A-Z ]","",unicodedata.normalize("NFD",t.upper()).encode("ascii","ignore").decode()).strip()
def fullkey(p): return nk(" ".join([p["paterno"],p["materno"],p["nombre"]]))
def foto(im,dest):
    img=Image.open(io.BytesIO(im._data())); img=ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((420,420)); img.save(dest,"JPEG",quality=80,optimize=True)
# maestro
ms=wb["BASE DE DATOS 2026"]; maestro={}
mimgs={}
for im in ms._images: mimgs.setdefault(im.anchor._from.row+1,im)
for r in range(2,ms.max_row+1):
    g=lambda c:s(ms.cell(r,c).value)
    if g(3) or g(5): maestro[nk(" ".join([g(3),g(4),g(5)]))]=(r,{"area":g(6),"cargo":g(7),"jefe":g(8)})
print("maestro",len(maestro),"fotos",len(mimgs))
personas=[]
for ws in wb.worksheets:
    if ws.title.startswith("BASE DE DATOS"): continue
    imgs=sorted(((im.anchor._from.row+1,im) for im in ws._images),key=lambda t:t[0])
    cur=None; hoja=[]
    for r in range(2,ws.max_row+1):
        g=lambda c:s(ws.cell(r,c).value)
        nom=(g(3),g(4),g(5))
        if any(nom) and (cur is None or nom!=(cur["paterno"],cur["materno"],cur["nombre"])):
            cur={"hoja":ws.title,"fila":r,"paterno":nom[0],"materno":nom[1],"nombre":nom[2],"area":"","cargo":"","jefe":"","bienes":[],"fin":r}
            hoja.append(cur)
        if cur is None: continue
        for k,c in (("area",6),("cargo",7),("jefe",8)):
            if not cur[k] and g(c): cur[k]=g(c)
        if any(g(c) for c in range(9,15)):
            cur["bienes"].append({"inv":g(9),"tipo":g(10),"modelo":g(11),"desc":g(12),"serie":g(13),"obs":g(14)}); cur["fin"]=r
    for i,p in enumerate(hoja):
        ini=p["fila"]; fin=(hoja[i+1]["fila"]-1) if i+1<len(hoja) else ws.max_row
        p["foto_src"]=None
        for rr,im in imgs:
            if ini<=rr<=fin or (i==0 and rr<ini): p.setdefault("cands",[]).append(im)
        p["img"]=max(p.get("cands",[None]),key=lambda im:(im.width*im.height) if im else 0)
        if 0: print("VARIAS",ws.title,p["nombre"],p["paterno"],[(im.anchor._from.row+1,im.width,im.height) for im in p["cands"]])
    personas+=hoja
# areas por hoja
from collections import Counter
modo={}
for h in set(p["hoja"] for p in personas):
    c=Counter(p["area"] for p in personas if p["hoja"]==h and p["area"]); modo[h]=c.most_common(1)[0][0] if c else ""
fuentes=Counter()
res=[]
for n,p in enumerate(personas,1):
    vac=bool(re.match(r"(?i)vacante",p["paterno"]))
    if vac: p["nombre_completo"]=p["paterno"].upper()
    elif p["hoja"]=="JUVETUD" and p["fila"]>2: p["nombre_completo"]=" ".join(x for x in [p["paterno"],p["materno"],p["nombre"]] if x)
    else: p["nombre_completo"]=" ".join(x for x in [p["nombre"],p["paterno"],p["materno"]] if x)
    p["vacante"]=vac
    p["area"]=modo[p["hoja"]] or p["hoja"]
    k=fullkey(p); m=maestro.get(k)
    dest=None
    if not vac:
        fn=f"{n:03d}.jpg"
        if p["img"] is not None: foto(p["img"],OUT+fn); dest=fn; fuentes["hoja"]+=1
        elif m and m[0] in mimgs: foto(mimgs[m[0]],OUT+fn); dest=fn; fuentes["maestro"]+=1
        else: fuentes["sin"]+=1; print("SIN FOTO",p["hoja"],p["nombre_completo"])
        if m:
            for kk in("cargo","jefe"):
                if not p[kk]: p[kk]=m[1][kk]
            if not p["area"]: p["area"]=m[1]["area"]
    p["foto"]=dest; p["n"]=n
    res.append({k:p[k] for k in("n","hoja","nombre_completo","vacante","area","cargo","jefe","foto","bienes")})
json.dump(res,open(W+"personas2.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
print(len(res),sum(len(p["bienes"]) for p in res),fuentes)
print(Counter((p["hoja"],p["area"]) for p in res))
