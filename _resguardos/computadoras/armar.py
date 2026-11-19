# Arma, por persona, el PDF con sus hojas escaneadas de resguardo de computadoras y computadoras.json para Neon.
# Sin hojas repetidas: una hoja se omite si todos sus inventarios ya venían en hojas anteriores (re-escaneos).
import json, os, re, pymupdf
base = os.path.dirname(os.path.abspath(__file__))
SRC = r'C:\Users\jgome\OneDrive\Escritorio\CAPTURADOS\RESGUARDOS-COMPUTADORAS (derecho).pdf'
SAL = os.path.join(os.path.expanduser('~'), 'Downloads', 'Resguardos computadoras por persona')
os.makedirs(SAL, exist_ok=True)
E = json.load(open(os.path.join(base, 'emparejado.json'), encoding='utf-8'))
R = {r['inv']: r for r in json.load(open(os.path.join(base, 'relacion.json'), encoding='utf-8'))}
R['369414'] = {'inv': '369414', 'desc': 'COMPUTADORA LAP-TOP', 'marca': '-', 'modelo': '-', 'serie': '1ZRF3G4', 'hojas': [42]}  # escaneada, no está en el Excel
E['42']['inv'] = sorted(set(E['42']['inv']) | {'369414'})
P = {p['id']: p for p in json.load(open(os.path.join(base, 'personas.json'), encoding='utf-8'))}
src = pymupdf.open(SRC)
por = {}
for pg in sorted(E, key=int):
    r = E[pg]
    if r['persona']: por.setdefault(r['persona'], []).append((int(pg), r['inv']))
compus, pdfs = [], []
lim = lambda t: re.sub(r'\s+', ' ', re.sub(r'[\/:*?"<>|]', ' ', t)).strip()
for pid, hojas in por.items():
    vistos, usar = set(), []
    for pg, invs in hojas:
        if invs and set(invs) <= vistos: continue
        usar.append(pg); vistos |= set(invs)
    for i in sorted(vistos):
        x = R[i]; compus.append({'inv': i, 'persona_id': pid, 'desc': x['desc'], 'marca': x['marca'], 'modelo': x['modelo'], 'serie': x['serie'], 'hojas': [h for h, v in hojas if i in v]})
    doc = pymupdf.open()
    for pg in usar: doc.insert_pdf(src, from_page=pg - 1, to_page=pg - 1)
    nombre = f"RESGUARDO COMPUTADORA - {lim(P[pid]['nombre'])} ({pid}).pdf"
    doc.save(os.path.join(SAL, nombre), garbage=3, deflate=True)
    pdfs.append({'persona_id': pid, 'archivo': nombre, 'hojas': usar})
json.dump({'computadoras': compus, 'pdfs': pdfs}, open(os.path.join(base, 'computadoras.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(compus), 'computadoras,', len(pdfs), 'PDF en', SAL)
