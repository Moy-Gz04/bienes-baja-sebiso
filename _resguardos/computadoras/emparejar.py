# Empareja cada hoja escaneada de "RESGUARDOS-COMPUTADORAS (derecho).pdf" con una persona de resguardo_personas.
# Usa el OCR de la firma del responsable (ocrL) y de la columna NOMBRE DEL USUARIO (ocrU); las hojas e inventarios
# vienen de relacion.json (sacado de "Resguardos computadoras - SI NO.pdf"). Correcciones a mano en manual.json {hoja: persona_id|null}.
import json, re, unicodedata, os, difflib
OCR = r'C:\Users\jgome\AppData\Local\Temp\compus'
base = os.path.dirname(os.path.abspath(__file__))
P = [p for p in json.load(open(os.path.join(base, 'personas.json'), encoding='utf-8')) if not p['vacante']]
rel = json.load(open(os.path.join(base, 'relacion.json'), encoding='utf-8'))
manual = json.load(open(os.path.join(base, 'manual.json'), encoding='utf-8')) if os.path.exists(os.path.join(base, 'manual.json')) else {}
n = lambda s: re.sub(r'[^a-z ]', ' ', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())
FIRMANTES = re.compile(r'rosa leticia|munoz ch|gomez moreno|coordinadora|mtr[oa]\.?|lic\.', re.I)

def leer(carpeta, pg):
    f = os.path.join(OCR, carpeta, f'{pg:03d}.txt')
    return open(f, encoding='utf-8').read() if os.path.exists(f) else ''

def zona(pg):
    L = leer('ocrL', pg); k = L.upper().rfind('FIRMA DEL'); a = L[k:].split('\n', 1)[-1] if k >= 0 else ''
    U = leer('ocrU', pg); U = U.split('Vo.Bo')[0]
    lineas = [x for x in (a + '\n' + U).split('\n') if not FIRMANTES.search(n(x)) and 'RESGUARD' not in x.upper() and 'ESTADO' not in x.upper()]
    return '\n'.join(lineas)

def score(nombre, words):
    toks = [t for t in n(nombre).split() if len(t) >= 3 and t not in ('del', 'los', 'las')]
    return sum(1 for t in toks if t in words or difflib.get_close_matches(t, words, 1, 0.8)) / len(toks)

hojas = {}
for r in rel:
    for h in r['hojas']: hojas.setdefault(h, []).append(r['inv'])
res = {}
for pg in range(1, 242):
    z = zona(pg); words = list(set(x for x in n(z).split() if len(x) >= 3))
    T = leer('ocr', pg); m = re.search(r'AREA.?\s*(.*?)\s*FECHA', T); area = set(x for x in n(m[1] if m else '').split() if len(x) >= 4)
    aw = lambda p: len(area & set(n(p['area'] + ' ' + p['seccion']).split())) / max(1, len(area))
    cand = sorted(((score(p['nombre'], words) + 0.15 * aw(p), p) for p in P), key=lambda x: -x[0])
    s, p = cand[0]
    pid = p['id'] if s >= 0.5 and s - cand[1][0] >= 0.1 else None
    if str(pg) in manual: pid = manual[str(pg)]
    res[pg] = {'inv': hojas.get(pg, []), 'persona': pid, 'score': round(s, 2), 'area_pag': m[1] if m else '', 'area_p': aw(p), 'top': [(round(a, 2), b['id'], b['nombre']) for a, b in cand[:2]],
               'texto': ' / '.join(x.strip() for x in z.split('\n') if len(x.strip()) > 6)[:160]}
json.dump(res, open(os.path.join(base, 'emparejado.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
dud = [pg for pg, r in res.items() if r['persona'] is None]
print('hojas con persona:', 241 - len(dud), ' sin:', len(dud))
for pg in dud: print('?',pg, res[pg]['inv'], res[pg]['top'][0], '|', res[pg]['texto'])
for pg, r in res.items():
    if r['persona'] and r['area_p'] < 0.5: print('area?', pg, r['top'][0], '|', r['area_pag'])
