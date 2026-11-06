let BIENES = [];
let SOLO_CAPTURA = false;   // usuario que solo toma fotos de los bienes que no tienen
const estado = { grupo: "", abierto: null, foto: 0, vista: [] };
let SOLO_COMPROBAR = false; // usuario que solo marca palomita / equis en Propuesta DIF
const GRUPOS_COMPROBAR = [["", "Todos"], ["Por comprobar", "Por comprobar"], ["Comprobado", "Comprobado"], ["No comprobado", "No comprobado"]];
const GRUPOS_CAPTURA = [["", "Todos"], ["Faltan fotos", "Faltan fotos"], ["Fotos tomadas", "Fotos tomadas"]];
let GRUPOS = [
  ["", "Todos"], ["Baja definitiva", "Baja definitiva"], ["Para reaprovechamiento", "Reaprovechamiento"],
  ["Propuesta DIF", "Propuesta DIF"], ["Pendiente de estatus", "Pendiente de estatus"], ["__sinfotos", "Sin fotos"], ["__capturar", "Capturar datos"],
];

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const pesos = (n) => n ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : "—";
const fecha = (f) => f ? new Date(f + "T12:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "";
const sinArea = (t) => String(t || "").replace(/^\d+\s*-\s*/, "");
const clase = (c) => ({ "Baja definitiva": "baja", "Para reaprovechamiento": "reap", "Propuesta DIF": "dif", "Pendiente de estatus": "pend", "Fuera del padrón": "foto", "__sinfotos": "sinf", "__capturar": "capt", "Faltan fotos": "baja", "Fotos tomadas": "reap", "Por comprobar": "dif", "Comprobado": "reap", "No comprobado": "baja" }[c] || "");
const estadoDe = (b) => b.estado_fisico || b.estado_ficha || b.condicion_foto || "";
// Datos que se revisan para el apartado "Capturar datos"
const DATOS_CLAVE = [["marca", "marca"], ["modelo", "modelo"], ["serie", "serie"], ["material", "material"], ["color", "color"], ["adscripcion", "adscripción"],
  ["ubicacion", "ubicación"], ["fecha_adquisicion", "fecha"], ["moi", "monto"], ["organo_superior", "órgano superior"], ["unidad_presupuestal", "unidad presupuestal"], ["resguardo", "resguardo"]];
const lleno = (x) => { const t = String(x ?? "").trim(); return !!t && t !== "-" && t !== "0" && !/^s\/?[mn]$/i.test(t); };
function faltantes(b) {
  const f = DATOS_CLAVE.filter(([k]) => !lleno(k === "ubicacion" ? (b.ubicacion || b.edificio) : b[k])).map(([, t]) => t);
  if (!lleno(estadoDe(b))) f.unshift("estado");
  return f;
}
const porCapturar = (b) => { if (b.captura_omitida) return false; const f = faltantes(b); return f.includes("estado") || f.includes("ubicación") || f.length >= 5; };
const enGrupoDe = (b, g) => !g || (g === "__sinfotos" ? !b.fotos.length : g === "__capturar" ? porCapturar(b) : b.clasificacion === g);

function filtrados() {
  const terminos = norm($("bBuscar").value).split(/\s+/).filter(Boolean);
  const est = $("bEstado").value, fotos = $("bFotos").value, ficha = $("bFicha").value;
  const enGrupo = (b) => enGrupoDe(b, estado.grupo);
  const lista = BIENES.filter(b => enGrupo(b) && (!est || estadoDe(b) === est)
    && (!fotos || (fotos === "si") === b.fotos.length > 0) && (!ficha || (ficha === "si") === !!b.ficha) && terminos.every(t => b.indice.includes(t)));
  const o = $("bOrden").value;
  if (o === "moi") lista.sort((a, b) => (b.moi || 0) - (a.moi || 0));
  else if (o === "fecha") lista.sort((a, b) => (a.fecha_adquisicion || "9").localeCompare(b.fecha_adquisicion || "9"));
  return lista;
}

function pintarGrupos() {
  $("bGrupos").innerHTML = GRUPOS.map(([v, t]) => {
    const l = BIENES.filter(b => enGrupoDe(b, v));
    return `<button type="button" role="tab" class="b-grupo ${clase(v)}" data-grupo="${esc(v)}" aria-selected="${estado.grupo === v}">
      <span>${t}</span><b>${l.length.toLocaleString("es-MX")}</b><small>${pesos(l.reduce((s, b) => s + (b.moi || 0), 0))}</small></button>`;
  }).join("");
}

function comprobacion(b) {
  const v = b.comprobado ? b.comprobado.valor : null, t = b.comprobado ? ` · ${b.comprobado.quien} ${b.comprobado.cuando}` : "";
  return `<span class="b-marcas"><button type="button" class="b-marca si${v === true ? " activa" : ""}" data-comp="si" title="Comprobado${v === true ? t : ""}" aria-label="Marcar ${esc(b.no_inventario)} como comprobado" aria-pressed="${v === true}"><i class="bi bi-check-lg"></i></button><button type="button" class="b-marca no${v === false ? " activa" : ""}" data-comp="no" title="No comprobado${v === false ? t : ""}" aria-label="Marcar ${esc(b.no_inventario)} como no comprobado" aria-pressed="${v === false}"><i class="bi bi-x-lg"></i></button></span>`;
}

async function quitarDeCaptura(inv) {
  const b = BIENES.find(x => x.no_inventario === inv); if (!b) return;
  const M = window.MiniSEBISO;
  const si = M && M.preguntar && !M.apagado
    ? await M.preguntar({ titulo: "Quitar de Capturar datos", pregunta: `¿Quito el bien ${inv} de Capturar datos?`, detalle: b.descripcion || "", btnOk: "Sí, quitarlo", iconoOk: "ti-x", textoOk: "Lo quito del apartado…", btnCancel: "Cancelar", saludoOk: "¡Listo!", saludoCancel: "¡Va!", textoCancel: "Lo dejamos en el apartado." })
    : confirm(`¿Quito el bien ${inv} de Capturar datos?`);
  if (!si) return;
  try {
    const r = await fetch(`/api/bienes/${encodeURIComponent(inv)}/omitir-captura`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") }, body: JSON.stringify({ quitar: true }) });
    if (r.status === 401) { location.href = "index.html"; return; }
    const d = await r.json();
    if (!d.ok) { alert(d.mensaje || "No se pudo quitar."); return; }
    b.captura_omitida = true; pintarGrupos(); pintar();
  } catch (x) { alert("Sin conexión. Intenta de nuevo."); }
}

async function marcarComprobado(inv, cual) {
  const b = BIENES.find(x => x.no_inventario === inv); if (!b) return;
  const actual = b.comprobado ? b.comprobado.valor : null, nuevo = cual === "si";
  const valor = actual === nuevo ? null : nuevo;
  const desc = [b.descripcion, b.marca && b.marca !== "SIN MARCA" ? b.marca : ""].filter(Boolean).join(" · ");
  const op = valor === null
    ? { titulo: "Quitar marca", pregunta: `¿Le quito la marca de comprobación al bien ${inv}?`, btnOk: "Sí, quitarla", iconoOk: "ti-eraser", textoOk: "Le quito la marca…" }
    : valor
      ? { titulo: "Comprobado", pregunta: `¿Marco el bien ${inv} como comprobado?`, btnOk: "Sí, comprobado", iconoOk: "ti-check", textoOk: "Lo marco como comprobado…", estiloOk: "dorado" }
      : { titulo: "No comprobado", pregunta: `¿Marco el bien ${inv} como NO comprobado?`, btnOk: "Sí, no comprobado", iconoOk: "ti-x", textoOk: "Lo marco como no comprobado…" };
  const M = window.MiniSEBISO;
  const si = M && M.preguntar && !M.apagado
    ? await M.preguntar({ ...op, detalle: desc, btnCancel: "Cancelar", saludoOk: "¡Listo!", saludoCancel: "¡Va!", textoCancel: "Lo dejamos como está." })
    : confirm(op.pregunta);
  if (!si) return;
  const r = await fetch("/api/comprobado", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") }, body: JSON.stringify({ no_inventario: inv, valor }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) return alert(j.mensaje || "No se pudo guardar la comprobación.");
  b.comprobado = j.comprobado;
  if (SOLO_COMPROBAR) { b.clasificacion = !b.comprobado ? "Por comprobar" : b.comprobado.valor ? "Comprobado" : "No comprobado"; pintarGrupos(); }
  const celda = document.querySelector(`tr[data-inv="${CSS.escape(inv)}"] .b-comp`); if (celda) celda.innerHTML = comprobacion(b);
}

function pintar() {
  const lista = filtrados();
  estado.vista = lista;
  $("bCuerpo").innerHTML = lista.map(b => `<tr data-inv="${esc(b.no_inventario)}">
      <td class="b-c">${b.fotos.length ? `<img class="b-mini" src="${b.fotos[0]}" alt="" loading="lazy">` : `<span class="b-mini b-mini-vacia"><i class="bi bi-camera"></i></span>`}</td>
      <td class="b-num">${esc(b.no_inventario)}</td>
      <td><span class="b-desc"><b>${esc(b.descripcion || "Sin descripción")}</b> ${esc([b.marca, b.modelo].filter(x => x && x !== "SIN MARCA").join(" · "))}<small>${esc(sinArea(b.unidad_presupuestal))}</small>${b.clasificacion === "Propuesta DIF" && b.propuesta_dif ? `<small class="b-area-dif">Área: ${esc(b.propuesta_dif)}</small>` : ""}${estado.grupo === "__capturar" ? `<small class="b-faltan">Falta: ${esc(faltantes(b).join(", "))}</small><button type="button" class="b-quitar" data-quitar title="Quitar de Capturar datos"><i class="bi bi-x-circle"></i> Quitar de este apartado</button>` : ""}</span></td>
      <td><span class="b-pill ${clase(b.clasificacion)}">${esc(b.clasificacion)}</span>${b.propuesta_dif ? `<small class="b-sub">${esc(b.propuesta_dif)}</small>` : ""}</td>
      <td class="b-c">${estadoDe(b) ? `<span class="b-estado e-${norm(estadoDe(b)).toLowerCase()}">${esc(estadoDe(b))}</span>` : "—"}</td>
      <td class="b-d">${pesos(b.moi)}</td>
      <td class="b-c"><button type="button" class="p-icono b-ver" title="Ver ficha técnica" aria-label="Ver ficha técnica del ${esc(b.no_inventario)}"><i class="bi bi-file-earmark-text"></i></button></td>
      ${SOLO_CAPTURA ? "" : `<td class="b-c b-comp">${comprobacion(b)}</td>`}
    </tr>`).join("") || `<tr><td colspan="8" class="tv-vacio">Ningún bien coincide con la búsqueda.</td></tr>`;
  $("bConteo").textContent = `${lista.length.toLocaleString("es-MX")} ${lista.length === 1 ? "bien" : "bienes"}`;
  const total = lista.reduce((s, b) => s + (b.moi || 0), 0);
  $("bResumen").innerHTML = `<span><b>${lista.length.toLocaleString("es-MX")}</b> bienes</span><span><b>${pesos(total)}</b> valor M.O.I.</span><span><b>${lista.filter(b => b.fotos.length).length.toLocaleString("es-MX")}</b> con fotos</span><span><b>${lista.filter(b => b.ficha).length.toLocaleString("es-MX")}</b> con ficha previa</span>`;
}

const DATOS = [
  ["No. inventario", "no_inventario"], ["Clave armonizada", "clave_armonizada"], ["COG", "cog"],
  ["Marca", "marca"], ["Modelo", "modelo"], ["Serie", "serie"],
  ["Material", "material"], ["Color", "color"], ["Ubicación", "ubicacion"],
  ["M.O.I.", (b) => pesos(b.moi)], ["Fecha de adquisición", (b) => fecha(b.fecha_adquisicion)], ["Estado físico (padrón)", "estado_fisico"],
  ["Estado en ficha técnica", "estado_ficha"], ["Condición en fotos", "condicion_foto"], ["Revisó", (b) => [b["revisó"], fecha(b.revisado_en)].filter(Boolean).join(" · ")], ["Propuesta DIF", "propuesta_dif"],
  ["Clasificación en el padrón", "clasificacion_padron"], ["Clasificación en la App", "app_clasificacion"], ["Estatus capturado", (b) => b.estatus_capturado ? `${b.estatus_capturado.quien} · ${fecha(b.estatus_capturado.cuando.slice(0, 10))}` : ""],
  ["Datos de ficha completados", (b) => b.datos_completados ? `${b.datos_completados.quien} · ${b.datos_completados.cuando}` : ""],
  ["Fotos tomadas en el sistema", (b) => b.fotos_capturadas ? `${b.fotos_capturadas.quien} · ${fecha(b.fotos_capturadas.cuando)}` : ""],
  ["Unidad presupuestal", (b) => sinArea(b.unidad_presupuestal), 2], ["Adscripción", "adscripcion"],
  ["Edificio", "edificio", 3], ["Folio fiscal", "folio_fiscal", 3],
];
const valor = (b, c) => (typeof c === "function" ? c(b) : b[c]) || "";

const DATOS_CAPTURA = [["No. inventario", "no_inventario"], ["Marca", "marca"], ["Modelo", "modelo"], ["Serie", "serie"], ["Material", "material"], ["Color", "color"],
  ["Ubicación", (b) => b.ubicacion || b.edificio, 3], ["Unidad presupuestal", (b) => sinArea(b.unidad_presupuestal), 2], ["Adscripción", "adscripcion"]];

function fichaHTML(b) {
  return `<dl class="b-datos">${(SOLO_CAPTURA ? DATOS_CAPTURA : DATOS).map(([t, c, ancho]) => `<div${ancho ? ` class="a${ancho}"` : ""}><dt>${t}</dt><dd>${esc(valor(b, c)) || "—"}</dd></div>`).join("")}</dl>
    ${b.caracteristicas ? `<p class="b-texto"><b>Características</b>${esc(b.caracteristicas)}</p>` : ""}
    ${avisoFicha(b)}
    ${b.pendiente && !b.estatus_capturado ? `<p class="b-nota b-nota-pend"><i class="bi bi-exclamation-triangle"></i> ${esc(b.pendiente)}</p>` : ""}
`;
}

// ── Ficha generada en el servidor (al completar datos o tomar fotos)
function avisoFicha(b) {
  const g = b.ficha_generando;
  if (!g || SOLO_COMPROBAR) return "";
  if (g.estado === "generando") return `<p class="b-nota b-nota-gen" role="status"><i class="bi bi-hourglass-split"></i> Generando ficha… (se sube a Drive en unos segundos)</p>`;
  if (g.estado === "lista") return `<p class="b-nota b-nota-gen lista" role="status"><i class="bi bi-check-circle"></i> La ficha ya está generada y en Drive.</p>`;
  return `<p class="b-nota b-nota-gen error" role="status"><i class="bi bi-exclamation-triangle"></i> No se pudo generar la ficha: ${esc(g.error || "")}</p>`;
}
const vigilando = new Set();
async function vigilarFicha(b) {
  if (vigilando.has(b.no_inventario)) return;
  vigilando.add(b.no_inventario);
  try {
    for (let i = 0; i < 60 && b.ficha_generando && b.ficha_generando.estado === "generando"; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const r = await fetch(`/api/ficha/${encodeURIComponent(b.no_inventario)}/estado`, { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
      const d = await r.json().catch(() => ({}));
      if (d.ok && d.ficha_generando) b.ficha_generando = d.ficha_generando;
    }
    if (b.ficha_generando && b.ficha_generando.estado === "lista") { b.tiene_pdf = b.pdf_en_drive = true; }
    if (estado.abierto === b && $("bDialogo").open) verFicha(b.no_inventario);
  } finally { vigilando.delete(b.no_inventario); }
}

// ── Completar los datos de la ficha oficial (rol completo)
const CAMPOS_FICHA = [["estado_fisico", "Estado físico"], ["descripcion", "Descripción", 2], ["marca", "Marca"], ["modelo", "Modelo"], ["serie", "Serie"], ["material", "Material"], ["color", "Color"],
  ["agrupados", "Agrupados"], ["organo_superior", "Órgano superior", 2], ["unidad_presupuestal", "Unidad presupuestal", 2], ["adscripcion", "Adscripción"],
  ["ubicacion", "Ubicación", 2], ["fecha_adquisicion", "Fecha de adquisición", 0, "date"], ["moi", "Monto original (M.O.I.)", 0, "number"], ["cog", "COG"],
  ["clave_armonizada", "Clave armonizada"], ["resguardo", "Resguardo"], ["estatus_contable", "Estatus contable"]];
function abrirDatos() {
  const b = estado.abierto;
  $("bDatosTitulo").textContent = `Completar datos de la ficha · ${b.no_inventario}`;
  $("bCampos").innerHTML = CAMPOS_FICHA.map(([k, t, ancho, tipo]) => {
    const v = k === "estado_fisico" ? estadoDe(b) : k === "moi" ? (b.moi || "") : k === "ubicacion" ? (b.ubicacion || b.edificio || "") : (b[k] ?? "");
    return `<label class="${ancho ? "a" + ancho : ""}${String(v).trim() ? "" : " falta"}"><span>${t}${String(v).trim() ? "" : ` <i class="b-falta-eti">Falta</i>`}</span>
      <input name="${k}" type="${tipo || "text"}"${tipo === "number" ? ` step="0.01" min="0"` : ""} maxlength="300" value="${esc(v)}" data-orig="${esc(v)}"></label>`;
  }).join("");
  $("bDatosMsg").textContent = b.datos_completados ? `Completado por ${b.datos_completados.quien} · ${b.datos_completados.cuando}` : "";
  $("bDatosGuardar").disabled = false;
  abrir($("bDatosDlg"));
}
async function guardarDatos(e) {
  e.preventDefault();
  const b = estado.abierto, datos = {};
  $("bCampos").querySelectorAll("input").forEach(i => { datos[i.name] = i.value.trim(); });
  $("bDatosGuardar").disabled = true; $("bDatosMsg").textContent = "Guardando…";
  try {
    const r = await fetch(`/api/bienes/${encodeURIComponent(b.no_inventario)}/datos`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") }, body: JSON.stringify({ datos }) });
    if (r.status === 401) { location.href = "index.html"; return; }
    const d = await r.json();
    if (!d.ok) { $("bDatosMsg").textContent = d.mensaje || "No se pudo guardar."; $("bDatosGuardar").disabled = false; return; }
    Object.assign(b, d.datos); b.datos_completados = d.datos_completados; b.ficha_generando = d.ficha_generando;
    cerrar($("bDatosDlg")); pintar(); verFicha(b.no_inventario); vigilarFicha(b);
  } catch (x) { $("bDatosMsg").textContent = "Sin conexión. Intenta de nuevo."; $("bDatosGuardar").disabled = false; }
}

// ── Captura de las 3 fotos desde el celular (bienes sin fotos)
const captura = { fotos: [null, null, null] };
const TOMAS = ["Frente", "Costado", "Etiqueta"];
function reducir(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      ok(cv.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo leer la foto")); };
    img.src = url;
  });
}
function pintarCaptura() {
  const b = estado.abierto;
  const ver = !!b.puede_capturar_fotos && (!b.fotos.length || captura.rehacer);
  $("bCapFotos").hidden = !ver;
  $("bRehacer").hidden = !(b.puede_capturar_fotos && b.fotos.length && !captura.rehacer);
  if (!ver) return;
  [...$("bCapCasillas").children].forEach((casilla, i) => {
    const f = captura.fotos[i];
    casilla.classList.toggle("lista", !!f);
    casilla.querySelector("img").src = f || "";
    casilla.querySelector("img").hidden = !f;
    casilla.querySelector("span").textContent = f ? `${TOMAS[i]} ✓` : TOMAS[i];
  });
  const n = captura.fotos.filter(Boolean).length;
  $("bCapGuardar").disabled = n < 3;
  $("bCapGuardar").textContent = n < 3 ? `Falta: ${TOMAS.filter((_, i) => !captura.fotos[i]).join(", ").toLowerCase()}` : "Guardar las 3 fotos";
}
async function guardarCaptura() {
  const b = estado.abierto;
  $("bCapGuardar").disabled = true; $("bCapMsg").textContent = "Guardando fotos…";
  try {
    const r = await fetch(`/api/bienes/${encodeURIComponent(b.no_inventario)}/fotos`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") }, body: JSON.stringify({ fotos: captura.fotos }) });
    if (r.status === 401) { location.href = "index.html"; return; }
    const d = await r.json();
    if (!d.ok) { $("bCapMsg").textContent = d.mensaje || "No se pudieron guardar."; $("bCapGuardar").disabled = false; return; }
    b.fotos = d.fotos; b.fotos_capturadas = d.fotos_capturadas; b.ficha_generando = d.ficha_generando;
    if (SOLO_CAPTURA) b.clasificacion = "Fotos tomadas";
    captura.fotos = [null, null, null]; captura.rehacer = false;
    pintarGrupos(); pintar(); verFicha(b.no_inventario); vigilarFicha(b);
    $("bCapMsg").textContent = "";
  } catch (e) { $("bCapMsg").textContent = "Sin conexión. Intenta de nuevo."; $("bCapGuardar").disabled = false; }
}

function mostrarFoto() {
  const b = estado.abierto, n = b.fotos.length;
  $("bFoto").hidden = !n; $("bSinFoto").hidden = !!n;
  document.querySelector(".b-foto").hidden = !n && !!b.puede_capturar_fotos;   // sin fotos: arriba va la captura
  $("bFotoAnt").hidden = $("bFotoSig").hidden = n < 2;
  if (n) { $("bFoto").src = b.fotos[estado.foto]; $("bFoto").alt = `Foto ${estado.foto + 1} de ${n} del bien ${b.no_inventario}`; }
  [...$("bMiniaturas").children].forEach((m, i) => m.setAttribute("aria-current", String(i === estado.foto)));
}

function verFicha(inv) {
  const b = BIENES.find(x => x.no_inventario === inv);
  if (!b) return;
  if (estado.abierto !== b) { captura.fotos = [null, null, null]; captura.rehacer = false; $("bCapMsg").textContent = ""; }
  estado.abierto = b; estado.foto = 0;
  $("bTitulo").textContent = b.descripcion || `Bien ${b.no_inventario}`;
  $("bChips").innerHTML = `<span class="b-pill ${clase(b.clasificacion)}">${esc(b.clasificacion)}</span><span class="b-inv">No. ${esc(b.no_inventario)}</span>`
    + (estadoDe(b) ? `<span class="b-estado e-${norm(estadoDe(b)).toLowerCase()}">${esc(estadoDe(b))}</span>` : "");
  $("bDetalle").innerHTML = fichaHTML(b);
  $("bDescargar").hidden = $("bImprimir").hidden = SOLO_CAPTURA || !b.tiene_pdf;
  $("bCompletar").hidden = SOLO_CAPTURA || SOLO_COMPROBAR;
  if (b.ficha_generando && b.ficha_generando.estado === "generando") vigilarFicha(b);
  $("bCaptura").hidden = !b.pendiente;
  if (b.pendiente) {
    $("bCapturaTitulo").textContent = b.estatus_capturado ? "Estatus capturado" : "Capturar estatus";
    [...$("bOpciones").querySelectorAll("button")].forEach(x => x.setAttribute("aria-pressed", String(!!b.estatus_capturado && x.dataset.v === b.clasificacion)));
    $("bQuitar").hidden = !b.estatus_capturado; $("bCapturaMsg").textContent = "";
  }
  $("bMiniaturas").innerHTML = b.fotos.map((f, i) => `<button type="button" data-i="${i}" aria-label="Ver foto ${i + 1}"><img src="${f}" alt=""></button>`).join("");
  const i = estado.vista.indexOf(b);
  $("bAnteriorBien").disabled = i <= 0; $("bSiguienteBien").disabled = i < 0 || i >= estado.vista.length - 1;
  mostrarFoto(); pintarCaptura();
  if (!$("bDialogo").open) abrir($("bDialogo"));
}

// La ficha técnica oficial se ve en PDF dentro del sistema
// ── Ventanas: en el celular el botón Atrás cierra la ventana de arriba (no saca del sistema),
// el fondo no se mueve detrás y tocar fuera de la ventana también la cierra.
const pila = [];
function abrir(dlg) {
  if (dlg.open) return;
  dlg.showModal();
  pila.push(dlg);
  document.documentElement.classList.add("con-ventana");
  history.pushState({ ventana: dlg.id }, "");
}
function cerrar(dlg, desdeAtras = false) {
  if (!dlg.open) return;
  dlg.close();
}
function alCerrar(dlg) {
  const i = pila.indexOf(dlg);
  if (i < 0) return;
  pila.splice(i, 1);
  if (!pila.length) document.documentElement.classList.remove("con-ventana");
  if (dlg.id === "bPdf") $("bPdfMarco").removeAttribute("src");   // suelta el PDF (en iPhone se queda pegado)
  if (!dlg._porAtras && history.state && history.state.ventana === dlg.id) history.back();
  dlg._porAtras = false;
}
window.addEventListener("popstate", () => {
  const arriba = pila[pila.length - 1];
  if (arriba) { arriba._porAtras = true; arriba.close(); }
});

// El PDF vive en Drive: el servidor da un enlace que dura unos minutos y lo entrega
async function enlacePdf(b) {
  const r = await fetch(`/api/ficha/${encodeURIComponent(b.no_inventario)}/enlace`, { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
  if (r.status === 401) { location.href = "index.html"; return null; }
  return (await r.json()).url;
}
const esMovil = () => matchMedia("(pointer: coarse)").matches && window.innerWidth <= 900;
async function verPdf(b) {
  // en el celular el visor dentro de la página falla (sobre todo en iPhone): se abre aparte
  if (esMovil()) { const pesta = window.open("", "_blank"); const url = await enlacePdf(b); if (url && pesta) pesta.location = url; else if (url) location.href = url; return; }
  $("bPdfTitulo").textContent = `Ficha técnica · ${b.no_inventario}`;
  $("bPdfMarco").removeAttribute("src");
  abrir($("bPdf"));
  const url = await enlacePdf(b);
  if (url) { $("bPdfMarco").src = url; $("bPdfAbrir").href = url; }
}

// ── Gráficas: todo el padrón en resumen (siempre sobre todos los bienes, no sobre el filtro)
function barras(titulo, filas, { dinero = false, nota = "" } = {}) {
  const max = Math.max(1, ...filas.map(f => f[1]));
  const total = filas.reduce((s, f) => s + f[1], 0);
  return `<section class="g-caja"><h3>${titulo}</h3>${nota ? `<p class="g-nota">${nota}</p>` : ""}<div class="g-barras">${filas.map(([eti, v, extra]) => {
    const txt = dinero ? pesos(v) : v.toLocaleString("es-MX");
    const pct = total ? Math.round(v / total * 1000) / 10 : 0;
    return `<div class="g-fila" tabindex="0" data-tip="${esc(`${eti}: ${txt} (${pct}%)${extra ? " · " + extra : ""}`)}">
      <span class="g-eti">${esc(eti)}</span><span class="g-pista"><span class="g-barra" style="width:${Math.max(v ? 1.5 : 0, v / max * 100)}%"></span></span><span class="g-val">${txt}</span></div>`;
  }).join("")}</div></section>`;
}
function avance(titulo, hecho, total, texto) {
  const pct = total ? Math.round(hecho / total * 100) : 0;
  return `<section class="g-caja g-avance"><h3>${titulo}</h3><div class="g-num"><b>${pct}%</b><span>${texto}</span></div>
    <div class="g-pista g-pista-alta" role="img" aria-label="${pct}%"><span class="g-barra" style="width:${pct}%"></span></div></section>`;
}
function pintarGraficas() {
  const B = BIENES;
  const cuenta = (fn) => { const m = new Map(); B.forEach(b => { const k = fn(b); if (k) m.set(k, (m.get(k) || 0) + 1); }); return m; };
  const suma = (fn) => { const m = new Map(); B.forEach(b => { const k = fn(b); if (k) m.set(k, (m.get(k) || 0) + (b.moi || 0)); }); return m; };
  const orden = ["Baja definitiva", "Para reaprovechamiento", "Propuesta DIF", "Pendiente de estatus"];
  const porClas = cuenta(b => b.clasificacion), valClas = suma(b => b.clasificacion);
  const porEst = cuenta(b => estadoDe(b) || "Sin estado");
  const porUnidad = [...cuenta(b => sinArea(b.unidad_presupuestal) || "Sin unidad")].sort((a, b) => b[1] - a[1]);
  const unidades = porUnidad.slice(0, 7);
  const resto = porUnidad.slice(7).reduce((s, f) => s + f[1], 0);
  if (resto) unidades.push([`Otras ${porUnidad.length - 7} unidades`, resto]);
  const porDescr = [...cuenta(b => b.descripcion)].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const decada = [...cuenta(b => b.fecha_adquisicion ? `${b.fecha_adquisicion.slice(0, 3)}0s` : "")].sort();
  const total = B.length, valor = B.reduce((s, b) => s + (b.moi || 0), 0);
  const conFotos = B.filter(b => b.fotos.length).length, tomadas = B.filter(b => b.fotos_capturadas).length;
  const pend = B.filter(b => b.pendiente).length, pendHechos = B.filter(b => b.pendiente && b.estatus_capturado).length;
  const conPdf = B.filter(b => b.pdf_en_drive).length;
  const n = (x) => x.toLocaleString("es-MX");
  $("bGrafCuerpo").innerHTML = `
    <div class="g-cifras">
      <div><b>${n(total)}</b><span>bienes</span></div>
      <div><b>${pesos(valor)}</b><span>valor M.O.I.</span></div>
      <div><b>${n(porClas.get("Baja definitiva") || 0)}</b><span>en baja definitiva</span></div>
      <div><b>${n((porClas.get("Para reaprovechamiento") || 0) + (porClas.get("Propuesta DIF") || 0))}</b><span>servibles (reaprovechamiento + DIF)</span></div>
    </div>
    <div class="g-rejilla">
      ${barras("Bienes por clasificación", orden.map(k => [k, porClas.get(k) || 0, pesos(valClas.get(k) || 0)]))}
      ${barras("Valor M.O.I. por clasificación", orden.map(k => [k, valClas.get(k) || 0]), { dinero: true })}
      ${barras("Estado físico", ["Bueno", "Regular", "Malo", "Inservible", "Sin estado"].filter(k => porEst.get(k)).map(k => [k, porEst.get(k)]), { nota: "Según el padrón; si no lo trae, la ficha técnica." })}
      ${barras("Por unidad presupuestal", unidades)}
      ${barras("Bienes más comunes", porDescr)}
      ${barras("Año de adquisición (por década)", decada)}
      ${avance("Fotos", conFotos, total, `${n(conFotos)} de ${n(total)} con fotos · ${n(tomadas)} tomadas en el sistema`)}
      ${avance("Estatus de pendientes", pendHechos, pend, `${n(pendHechos)} de ${n(pend)} ya capturados`)}
      ${avance("Fichas técnicas en Drive", conPdf, total, `${n(conPdf)} de ${n(total)} ya subidas`)}
    </div>`;
}

function imprimir() {
  const b = estado.abierto;
  $("bImpresion").innerHTML = `<img class="b-membrete" src="img/membrete-bienestar.png" alt="">
    <h1>Ficha técnica del bien ${esc(b.no_inventario)}</h1><p class="b-imp-sub">${esc(b.descripcion)} · ${esc(b.clasificacion)}</p>
    ${b.fotos.length ? `<div class="b-imp-fotos">${b.fotos.slice(0, 3).map(f => `<img src="${f}" alt="">`).join("")}</div>` : ""}
    ${fichaHTML(b)}`;
  const fotos = [...$("bImpresion").querySelectorAll("img")];
  Promise.all(fotos.map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))).then(() => window.print());
}

document.addEventListener("DOMContentLoaded", async () => {
  $("bCuerpo").innerHTML = `<tr><td colspan="7" class="tv-vacio">Cargando bienes…</td></tr>`;
  const r = await fetch("/api/bienes", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
  if (r.status === 401) { location.href = "index.html"; return; }
  const respuesta = await r.json();
  BIENES = respuesta.bienes;
  if (respuesta.rol === "captura") {
    SOLO_CAPTURA = true; document.querySelector(".b-comp-th")?.remove(); GRUPOS = GRUPOS_CAPTURA; estado.grupo = "Faltan fotos";
    document.body.classList.add("solo-captura");
    document.querySelector(".tv-eyebrow").textContent = "Captura de fotos";
    document.querySelector(".tv-cabeza h1").textContent = "Bienes sin fotos";
  }
  if (respuesta.rol === "comprobar") {
    SOLO_COMPROBAR = true; GRUPOS = GRUPOS_COMPROBAR; estado.grupo = "Por comprobar";
    document.body.classList.add("solo-comprobar");
    document.querySelector(".tv-eyebrow").textContent = "Comprobación física";
    document.querySelector(".tv-cabeza h1").textContent = "Propuesta DIF";
  }
  BIENES.forEach(b => { b.indice = norm([b.no_inventario, b.descripcion, b.marca, b.modelo, b.serie, b.cog, b.clave_armonizada, b.adscripcion, b.unidad_presupuestal, b.edificio, b.folio_fiscal, b.propuesta_dif, b.caracteristicas, b.material, b.color, b.ubicacion].join(" ")); });
  const estados = [...new Set(BIENES.map(estadoDe).filter(Boolean))].sort();
  $("bEstado").innerHTML = `<option value="">Todos los estados</option>` + estados.map(e => `<option>${esc(e)}</option>`).join("");
  pintarGrupos();
  $("bGrupos").addEventListener("click", (e) => {
    const g = e.target.closest(".b-grupo"); if (!g) return;
    estado.grupo = g.dataset.grupo; pintarGrupos(); pintar();
  });
  ["bBuscar", "bEstado", "bFotos", "bFicha", "bOrden"].forEach(id => $(id).addEventListener("input", pintar));
  $("bCuerpo").addEventListener("click", (e) => { const q = e.target.closest("[data-quitar]"); if (q) { e.stopPropagation(); quitarDeCaptura(q.closest("tr").dataset.inv); return; } const m = e.target.closest("[data-comp]"); if (m) { e.stopPropagation(); marcarComprobado(m.closest("tr").dataset.inv, m.dataset.comp); return; } const f = e.target.closest("tr[data-inv]"); if (f) verFicha(f.dataset.inv); });
  $("bMiniaturas").addEventListener("click", (e) => { const m = e.target.closest("button"); if (m) { estado.foto = +m.dataset.i; mostrarFoto(); } });
  const mover = (d) => { const n = estado.abierto.fotos.length; if (n) { estado.foto = (estado.foto + d + n) % n; mostrarFoto(); } };
  $("bFotoAnt").addEventListener("click", () => mover(-1));
  $("bFotoSig").addEventListener("click", () => mover(1));
  const otroBien = (d) => { const l = estado.vista, i = l.indexOf(estado.abierto) + d; if (l[i]) verFicha(l[i].no_inventario); };
  $("bAnteriorBien").addEventListener("click", () => otroBien(-1));
  $("bSiguienteBien").addEventListener("click", () => otroBien(1));
  $("bDialogo").addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); mover(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); mover(1); }
  });
  $("bFoto").addEventListener("click", () => window.open($("bFoto").src, "_blank"));
  $("bImprimir").addEventListener("click", () => verPdf(estado.abierto));
  $("bGraficas").hidden = SOLO_CAPTURA || SOLO_COMPROBAR;
  $("bGraficas").addEventListener("click", () => { pintarGraficas(); abrir($("bGraf")); });
  $("bGrafCerrar").addEventListener("click", () => cerrar($("bGraf")));
  // recuadro con el detalle al pasar el cursor o tocar una barra
  const tip = $("bTip");
  const mostrarTip = (fila, x, y) => {
    tip.textContent = fila.dataset.tip; tip.hidden = false;
    const caja = $("bGraf").getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(8, x - caja.left - w / 2), caja.width - w - 8) + "px";
    tip.style.top = (y - caja.top - tip.offsetHeight - 12) + "px";
  };
  $("bGrafCuerpo").addEventListener("pointermove", (e) => { const f = e.target.closest(".g-fila"); if (f) mostrarTip(f, e.clientX, e.clientY); else tip.hidden = true; });
  $("bGrafCuerpo").addEventListener("pointerleave", () => { tip.hidden = true; });
  $("bGrafCuerpo").addEventListener("focusin", (e) => { const f = e.target.closest(".g-fila"); if (f) { const r = f.getBoundingClientRect(); mostrarTip(f, r.left + r.width / 2, r.top); } });
  $("bGrafCuerpo").addEventListener("focusout", () => { tip.hidden = true; });
  $("bPdfCerrar").addEventListener("click", () => cerrar($("bPdf")));
  document.querySelectorAll("dialog").forEach(dlg => {
    dlg.addEventListener("close", () => alCerrar(dlg));
    // tocar el fondo oscuro (fuera de la caja) cierra
    dlg.addEventListener("click", (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cerrar(dlg);
    });
    dlg.querySelectorAll("[data-cerrar]").forEach(x => x.addEventListener("click", () => cerrar(dlg)));
  });
  $("bCapCasillas").addEventListener("change", async (e) => {
    const i = +e.target.dataset.i, archivo = e.target.files && e.target.files[0]; e.target.value = "";
    if (!archivo) return;
    $("bCapMsg").textContent = "Preparando foto…";
    try { captura.fotos[i] = await reducir(archivo); $("bCapMsg").textContent = ""; } catch (x) { $("bCapMsg").textContent = "Esa foto no se pudo leer. Tómala otra vez."; }
    pintarCaptura();
  });
  $("bCapGuardar").addEventListener("click", guardarCaptura);
  $("bCompletar").addEventListener("click", abrirDatos);
  $("bDatosForm").addEventListener("submit", guardarDatos);
  $("bCampos").addEventListener("input", (e) => { const l = e.target.closest("label"); if (l) { l.classList.toggle("cambiado", e.target.value.trim() !== e.target.dataset.orig); l.classList.toggle("falta", !e.target.value.trim()); } });
  $("bRehacer").addEventListener("click", () => { captura.rehacer = true; captura.fotos = [null, null, null]; pintarCaptura(); });
  $("bDescargar").addEventListener("click", async (e) => { e.preventDefault(); const url = await enlacePdf(estado.abierto); if (url) window.open(url, "_blank", "noopener"); });
  const capturar = async (valor) => {
    const b = estado.abierto;
    $("bCapturaMsg").textContent = "Guardando…";
    const r = await fetch("/api/estatus", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") }, body: JSON.stringify({ no_inventario: b.no_inventario, clasificacion: valor }) });
    if (r.status === 401) { location.href = "index.html"; return; }
    const d = await r.json();
    if (!d.ok) { $("bCapturaMsg").textContent = d.mensaje || "No se pudo guardar."; return; }
    b.estatus_capturado = d.estatus; b.clasificacion = d.estatus ? d.estatus.clasificacion : "Pendiente de estatus";
    pintarGrupos(); pintar(); verFicha(b.no_inventario);
    $("bCapturaMsg").textContent = d.estatus ? `Guardado: ${d.estatus.clasificacion}` : "Se regresó a Pendiente de estatus";
  };
  $("bOpciones").addEventListener("click", (e) => { const o = e.target.closest("button"); if (o) capturar(o.dataset.v); });
  $("bQuitar").addEventListener("click", () => capturar(null));
  pintar();
});
