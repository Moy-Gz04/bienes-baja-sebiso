# Prepara los datos de un resguardo (por número de persona) en salida/datos.json para generar_resguardo.ps1
import json,re,sys,unicodedata
sys.stdout.reconfigure(encoding="utf-8")
n=int(sys.argv[1]); fecha=sys.argv[2]
P=json.load(open(__file__.replace("datos_resguardo.py","personas.json"),encoding="utf-8"))
def nk(t): return re.sub(r"[^A-Z ]","",unicodedata.normalize("NFD",t.upper()).encode("ascii","ignore").decode()).strip()
def sin_titulo(t): return re.sub(r"^((MTRO|MTRA|LIC|LICDA|ING|DR|DRA|C|L\.?C\.?C|L\.?A\.?P|L\.?A\.?E|M\.?C|ARQ|CP|C\.?P)\.?\s+)+","",nk(t) if False else t.strip(),flags=re.I)
def titulo(t):
    return " ".join(w if "." in w else w.capitalize() for w in t.split())
p=next(x for x in P if x["n"]==n)
jefe=p["jefe"]; jk=nk(sin_titulo(jefe))
cargo_jefe=""
for x in P:
    if not x["vacante"] and nk(x["nombre_completo"])==jk: cargo_jefe=x["cargo"]; break
if not cargo_jefe:   # el nombre del jefe puede traer otro orden o acentos: se compara por palabras
    ws=set(jk.split())
    for x in P:
        if not x["vacante"] and len(ws)>=3 and ws==set(nk(x["nombre_completo"]).split()): cargo_jefe=x["cargo"]; break
json.dump({"area":p["area"],"fecha":fecha,"persona":p["nombre_completo"],"persona_titulo":titulo(p["nombre_completo"]),"cargo":p["cargo"],
  "jefe":jefe.upper(),"cargo_jefe":cargo_jefe.upper(),"inventarios":[b["inv"] for b in p["bienes"]]},open(__file__.replace("datos_resguardo.py","salida/datos.json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
print(p["nombre_completo"],"|",p["cargo"],"|",jefe,"|",cargo_jefe or "(cargo del jefe no encontrado)",len(p["bienes"]))
