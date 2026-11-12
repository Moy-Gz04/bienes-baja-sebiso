# Revisa los resguardos generados: hojas, que la última hoja traiga el recuadro de firmas al pie y no quede una hoja casi vacía.
import pymupdf,glob,sys,re
sys.stdout.reconfigure(encoding="utf-8")
malos=[];hojas={}
for f in sorted(glob.glob(r"C:\Users\jgome\Downloads\Resguardos Nuevo Edificio\*\*.pdf")):
    d=pymupdf.open(f); n=len(d); hojas[n]=hojas.get(n,0)+1
    ult=d[-1]; t=ult.get_text()
    fondo=max((r["rect"][3] for r in ult.get_drawings()),default=0)
    filas=len(re.findall(r"^\d{6}$",t,re.M))   # números de inventario en la última hoja
    firma="FIRMA DEL SERVIDOR" in t
    if not firma or fondo<480 or (n>1 and filas==0):
        malos.append((re.search(r"\((\d+)\)\.pdf$",f).group(1),n,round(fondo),filas,firma,f.split("\\")[-1][:50]))
print("hojas:",dict(sorted(hojas.items())),"revisar:",len(malos))
for m in malos: print(m)
