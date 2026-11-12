# Completa los bienes de personas.json con los datos de oficialia_OFICIAL.xlsx (Nombre, Marca, Modelo, Serie, Descripción) y arma salida/lote.json
import openpyxl,json,re,sys,unicodedata
sys.stdout.reconfigure(encoding="utf-8")
D=__file__.replace("enriquecer.py","")
wb=openpyxl.load_workbook(r"C:\Users\jgome\Downloads\oficialia_OFICIAL.xlsx",read_only=True)
def s(x): return re.sub(r"\s+"," ",str(x)).strip() if x is not None else ""
oficial={}
for ws in wb.worksheets:
    for r in ws.iter_rows(values_only=True):
        if len(r)>=9 and re.fullmatch(r"\d{5,7}",s(r[1]).split(".")[0] or "x"):
            oficial[s(r[1]).split(".")[0]]={"desc":s(r[2]),"marca":s(r[3]),"modelo":s(r[4]),"serie":s(r[5]),"carac":s(r[8]),"partida":s(r[6])}
print("bienes en oficialía:",len(oficial))
P=json.load(open(D+"personas.json",encoding="utf-8"))
def nk(t): return re.sub(r"[^A-Z ]","",unicodedata.normalize("NFD",t.upper()).encode("ascii","ignore").decode()).strip()
def sin_titulo(t): return re.sub(r"^((MTRO|MTRA|LIC|LICDA|ING|DR|DRA|C|L\.?C\.?C|L\.?A\.?P|L\.?A\.?E|M\.?C|ARQ|CP|C\.?P)\.?\s+)+","",t.strip(),flags=re.I)
def titulo(t): return " ".join(w if "." in w else w.capitalize() for w in t.split())
dash=lambda v: v if v else "-"
faltan=0; lote=[]
cargos={nk(x["nombre_completo"]):x["cargo"] for x in P if not x["vacante"]}
for p in P:
    for b in p["bienes"]:
        o=oficial.get(b["inv"])
        if not o: faltan+=1; o={}
        b.update({"desc":o.get("desc",""),"marca":o.get("marca",""),"modelo":o.get("modelo",""),"serie":o.get("serie",""),"carac":o.get("carac","")})
    if p["vacante"]: continue
    jk=nk(sin_titulo(p["jefe"])); cj=cargos.get(jk,"")
    if not cj and len(jk.split())>=3:
        ws_=set(jk.split()); cj=next((c for k,c in cargos.items() if set(k.split())==ws_),"")
    lote.append({"n":p["n"],"area":p["area"],"persona":p["nombre_completo"],"persona_titulo":titulo(p["nombre_completo"]),"cargo":dash(p["cargo"]),
      "jefe":dash(p["jefe"].upper()),"cargo_jefe":dash(cj.upper()),
      "bienes":[{"inv":b["inv"],"desc":dash(b["desc"]),"marca":dash(b["marca"]),"modelo":dash(b["modelo"]),"serie":dash(b["serie"]),"carac":dash(b["carac"]),"obs":"-"} for b in p["bienes"]]})
json.dump(P,open(D+"personas.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
json.dump(lote,open(D+"salida/lote.json","w",encoding="utf-8"),ensure_ascii=False)
print("personas (sin vacantes):",len(lote),"bienes sin dato en oficialía:",faltan)
print("jefe sin cargo encontrado:",sum(1 for l in lote if l["cargo_jefe"]=="-"),"personas sin jefe:",sum(1 for l in lote if l["jefe"]=="-"))
