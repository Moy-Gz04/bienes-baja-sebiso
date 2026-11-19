let BIENES = [];
let SOLO_CAPTURA = false;   // usuario que solo toma fotos de los bienes que no tienen
const estado = { grupo: "", abierto: null, foto: 0, vista: [] };
let SOLO_COMPROBAR = false; // usuario que solo marca palomita / equis en Propuesta DIF
const GRUPOS_COMPROBAR = [["", "Todos"], ["Por comprobar", "Por comprobar"], ["Comprobado", "Comprobado"], ["No comprobado", "No comprobado"]];
let SOLO_EXISTENCIA = false; // usuario que solo consulta y confirma la existencia física (funciona sin internet)
const GRUPOS_EXISTENCIA = [["", "Todos"], ["Por confirmar", "Por confirmar"], ["Confirmados", "Confirmados"], ["__nuevos", "Registrados"]];
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
const clase = (c) => ({ "Baja definitiva": "baja", "Para reaprovechamiento": "reap", "Propuesta DIF": "dif", "Pendiente de estatus": "pend", "Fuera del padrón": "foto", "__sinfotos": "sinf", "__capturar": "capt", "Faltan fotos": "baja", "Fotos tomadas": "reap", "Por comprobar": "dif", "Comprobado": "reap", "No comprobado": "baja", "Por confirmar": "dif", "Confirmados": "reap", "__nuevos": "capt" }[c] || "");
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
const porCapturar = (b) => { if (b.captura_omitida || b.fotos.length) return false; const f = faltantes(b); return f.includes("estado") || f.includes("ubicación") || f.length >= 5; };
const enGrupoDe = (b, g) => !g || (g === "__nuevos" ? !!b.nuevo : g === "__sinfotos" ? !b.fotos.length : g === "__capturar" ? porCapturar(b) : b.clasificacion === g);

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
      <td><span class="b-pill ${clase(clasDe(b))}">${esc(clasDe(b))}</span>${b.propuesta_dif ? `<small class="b-sub">${esc(b.propuesta_dif)}</small>` : ""}</td>
      <td class="b-c">${estadoDe(b) ? `<span class="b-estado e-${norm(estadoDe(b)).toLowerCase()}">${esc(estadoDe(b))}</span>` : "—"}</td>
      <td class="b-d">${pesos(b.moi)}</td>
      <td class="b-c"><button type="button" class="p-icono b-ver" title="Ver ficha técnica" aria-label="Ver ficha técnica del ${esc(b.no_inventario)}"><i class="bi bi-file-earmark-text"></i></button></td>
      ${SOLO_CAPTURA ? "" : `<td class="b-c b-comp">${SOLO_EXISTENCIA ? botonExistencia(b) : comprobacion(b)}</td>`}
    </tr>`).join("") || `<tr><td colspan="8" class="tv-vacio">Ningún bien coincide con la búsqueda.</td></tr>`;
  $("bConteo").textContent = `${lista.length.toLocaleString("es-MX")} ${lista.length === 1 ? "bien" : "bienes"}`;
  const total = lista.reduce((s, b) => s + (b.moi || 0), 0);
  if (SOLO_EXISTENCIA) { const c = lista.filter(b => b.existencia).length; $("bResumen").innerHTML = `<span><b>${lista.length.toLocaleString("es-MX")}</b> bienes</span><span><b>${c.toLocaleString("es-MX")}</b> confirmados</span><span><b>${(lista.length - c).toLocaleString("es-MX")}</b> por confirmar</span>`; return; }
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

const DATOS_EXISTENCIA = [["No. inventario", "no_inventario"], ["Clave armonizada", "clave_armonizada"], ["COG", "cog"], ["Marca", "marca"], ["Modelo", "modelo"], ["Serie", "serie"],
  ["Material", "material"], ["Color", "color"], ["Ubicación", (b) => b.ubicacion || b.edificio], ["M.O.I.", (b) => pesos(b.moi)], ["Fecha de adquisición", (b) => fecha(b.fecha_adquisicion)],
  ["Estado físico", (b) => estadoDe(b)], ["Clasificación", "clasificacion_bien"], ["Existencia", (b) => b.existencia ? "Confirmada · " + b.existencia.quien + " · " + b.existencia.cuando : "Por confirmar"],
  ["Unidad presupuestal", (b) => sinArea(b.unidad_presupuestal), 2], ["Adscripción", "adscripcion"], ["Folio fiscal", "folio_fiscal"],
  ["Registrado en el sistema", (b) => b.nuevo ? [b.registrado_por || yo(), b.registrado_en ? horaLocal(b.registrado_en) : ""].filter(Boolean).join(" · ") : "", 2]];
const DATOS_CAPTURA = [["No. inventario", "no_inventario"], ["Marca", "marca"], ["Modelo", "modelo"], ["Serie", "serie"], ["Material", "material"], ["Color", "color"],
  ["Ubicación", (b) => b.ubicacion || b.edificio, 3], ["Unidad presupuestal", (b) => sinArea(b.unidad_presupuestal), 2], ["Adscripción", "adscripcion"]];

function fichaHTML(b) {
  return `<dl class="b-datos">${(SOLO_CAPTURA ? DATOS_CAPTURA : SOLO_EXISTENCIA ? DATOS_EXISTENCIA : DATOS).map(([t, c, ancho]) => `<div${ancho ? ` class="a${ancho}"` : ""}><dt>${t}</dt><dd>${esc(valor(b, c)) || "—"}</dd></div>`).join("")}</dl>
    ${b.caracteristicas ? `<p class="b-texto"><b>Características</b>${esc(b.caracteristicas)}</p>` : ""}
    ${avisoFicha(b)}
    ${b.pendiente && !b.estatus_capturado ? `<p class="b-nota b-nota-pend"><i class="bi bi-exclamation-triangle"></i> ${esc(b.pendiente)}</p>` : ""}
`;
}

// ── Ficha generada en el servidor (al completar datos o tomar fotos)
function avisoFicha(b) {
  const g = b.ficha_generando;
  if (!g || SOLO_COMPROBAR || SOLO_EXISTENCIA) return "";
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
  $("bChips").innerHTML = `<span class="b-pill ${clase(clasDe(b))}">${esc(clasDe(b))}</span>${SOLO_EXISTENCIA ? `<span class="b-pill ${clase(b.clasificacion)}">${b.existencia ? "Existencia confirmada" : "Por confirmar"}</span>` : ""}<span class="b-inv">No. ${esc(b.no_inventario)}</span>`
    + (estadoDe(b) ? `<span class="b-estado e-${norm(estadoDe(b)).toLowerCase()}">${esc(estadoDe(b))}</span>` : "");
  $("bDetalle").innerHTML = fichaHTML(b);
  $("bDescargar").hidden = $("bImprimir").hidden = SOLO_CAPTURA || !b.tiene_pdf;
  if (SOLO_EXISTENCIA) { $("bDescargar").hidden = true; pintarBotonExistencia(b); pintarBotonClas(b); }
  $("bCompletar").hidden = SOLO_CAPTURA || SOLO_COMPROBAR || SOLO_EXISTENCIA;
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
  if (SOLO_EXISTENCIA) {   // sin internet: la ficha guardada en este equipo (si ya se abrió antes)
    try { const r = await fetch(`/api/ficha/${encodeURIComponent(b.no_inventario)}/enlace`, { headers: { Authorization: "Bearer " + localStorage.getItem("token") } }); const d = await r.json(); if (d.url) return d.url; } catch (e) {}
    return `/api/ficha/${encodeURIComponent(b.no_inventario)}/pdf`;
  }
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
  let respuesta;
  if (localStorage.getItem("rol") === "existencia") { respuesta = await cargarExistencia(); if (!respuesta) return; }
  else {
    const r = await fetch("/api/bienes", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
    if (r.status === 401) { location.href = "index.html"; return; }
    respuesta = await r.json();
  }
  BIENES = respuesta.bienes;
  if (respuesta.rol === "captura") {
    SOLO_CAPTURA = true; document.querySelector(".b-comp-th")?.remove(); GRUPOS = GRUPOS_CAPTURA; estado.grupo = "Faltan fotos";
    document.body.classList.add("solo-captura");
    document.querySelector(".tv-eyebrow").textContent = "Captura de fotos";
    document.querySelector(".tv-cabeza h1").textContent = "Bienes sin fotos";
  }
  if (respuesta.rol === "existencia") {
    SOLO_EXISTENCIA = true; GRUPOS = GRUPOS_EXISTENCIA; estado.grupo = "Por confirmar";
    document.body.classList.add("solo-existencia");
    document.querySelector(".tv-eyebrow").textContent = "Inventario de bienes";
    document.querySelector(".tv-cabeza h1").textContent = "Confirmación de existencia";
    document.querySelector(".b-comp-th").textContent = "Existencia";
    $("bExistencia").addEventListener("click", () => estado.abierto && marcarExistencia(estado.abierto.no_inventario));
    $("bNuevo").hidden = false;
    $("bNuevo").addEventListener("click", abrirNuevo);
    $("bNuevoForm").addEventListener("submit", guardarNuevo);
    $("bNuevoCasillas").addEventListener("change", async (e) => {
      const i = +e.target.dataset.i, archivo = e.target.files && e.target.files[0]; e.target.value = "";
      if (!archivo) return;
      $("bNuevoMsg").textContent = "Preparando foto…";
      try { nuevoFotos[i] = await reducir(archivo); $("bNuevoMsg").textContent = ""; } catch (x) { $("bNuevoMsg").textContent = "Esa foto no se pudo leer. Tómala otra vez."; }
      pintarNuevoFotos();
    });
    $("bNuevoCampos").addEventListener("input", (e) => { const l = e.target.closest("label"); if (l && e.target.required) l.classList.toggle("falta", !e.target.value.trim()); });
    $("bCambiarClas").addEventListener("click", () => estado.abierto && cambiarClasificacion(estado.abierto.no_inventario));
    aplicarCola(await tx("cola", "readonly", s => s.getAll()).catch(() => []));
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
  $("bCuerpo").addEventListener("click", (e) => { const q = e.target.closest("[data-quitar]"); if (q) { e.stopPropagation(); quitarDeCaptura(q.closest("tr").dataset.inv); return; } const x = e.target.closest("[data-exist]"); if (x) { e.stopPropagation(); marcarExistencia(x.closest("tr").dataset.inv); return; } const m = e.target.closest("[data-comp]"); if (m) { e.stopPropagation(); marcarComprobado(m.closest("tr").dataset.inv, m.dataset.comp); return; } const f = e.target.closest("tr[data-inv]"); if (f) verFicha(f.dataset.inv); });
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
  $("bGraficas").hidden = SOLO_CAPTURA || SOLO_COMPROBAR || SOLO_EXISTENCIA;
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
  pintar(); pintarSync();
});

// ── Confirmación de existencia (rol "existencia") y trabajo sin internet ─────────────────────────────
// La lista de bienes se guarda en este equipo (IndexedDB) para abrir sin red. Cada confirmación se guarda primero en la
// cola y luego se aplica en pantalla; la cola se envía en orden en cuanto hay internet y solo sale de ella cuando el
// servidor la confirmó. Si el servidor la rechaza pasa a "rechazadas" y queda visible con opción de reintentar.
const clasDe = (b) => SOLO_EXISTENCIA ? (b.clasificacion_bien || "") : b.clasificacion;
const abrirBD = () => new Promise((ok, mal) => {
  const r = indexedDB.open("bienes-existencia", 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("cola", { keyPath: "id", autoIncrement: true }); d.createObjectStore("rechazadas", { keyPath: "id" }); d.createObjectStore("datos"); };
  r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error);
});
let _bd; const bd = () => (_bd ||= abrirBD());
async function tx(tabla, modo, fn) {
  const d = await bd();
  return new Promise((ok, mal) => {
    const t = d.transaction(tabla, modo); let res; const q = fn(t.objectStore(tabla));
    if (q) q.onsuccess = () => { res = q.result; };
    t.oncomplete = () => ok(res); t.onerror = t.onabort = () => mal(t.error);
  });
}
const guardarCopia = () => tx("datos", "readwrite", s => s.put({ ok: true, rol: "existencia", bienes: BIENES.map(({ indice, ...b }) => b), guardada: Date.now() }, "bienes")).catch(() => {});
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const sync = { sinRed: false, sesion: false, copia: false, enviando: false, pend: 0, rech: [] };
const sinRed = () => !navigator.onLine || sync.sinRed;
const yo = () => { try { return JSON.parse(atob(localStorage.getItem("token").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).usuario || "—"; } catch (e) { return "—"; } };
const horaLocal = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
function aplicarOp(op) {
  if (op.tipo === "nuevo") { agregarNuevoLocal(op); return; }
  const b = BIENES.find(x => x.no_inventario === op.no_inventario); if (!b) return;
  if (op.tipo === "clasif") { b.clasificacion_bien = op.clasificacion; return; }
  b.existencia = op.confirmado ? { quien: yo(), cuando: horaLocal(op.cuando) } : null;
  b.clasificacion = b.existencia ? "Confirmados" : "Por confirmar";
}
const aplicarCola = (ops) => ops.forEach(aplicarOp);

async function cargarExistencia() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
  { const el = document.createElement("div"); el.id = "bSync"; el.className = "b-sync"; el.hidden = true; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); $("bGrupos").before(el);
    el.addEventListener("click", async (e) => {
      if (e.target.closest("#bSyncSesion")) { location.href = "index.html"; return; }
      if (!e.target.closest("#bSyncReintentar")) return;
      for (const x of sync.rech) { const { id, mensaje, ...op } = x; await tx("cola", "readwrite", s => s.add(op)); await tx("rechazadas", "readwrite", s => s.delete(id)); }
      await refrescarSync(); enviarCola();
    }); }
  await enviarCola();
  let d = null;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
    const r = await fetch("/api/bienes", { signal: ctl.signal, headers: { Authorization: "Bearer " + localStorage.getItem("token") } }).finally(() => clearTimeout(t));
    if (r.status === 401) { sync.sesion = true; await refrescarSync(); if (!sync.pend) { localStorage.removeItem("token"); location.href = "index.html"; return null; } }
    else d = await r.json();
  } catch (e) { sync.sinRed = true; }
  if (d?.ok) { sync.copia = false; tx("datos", "readwrite", s => s.put({ ...d, guardada: Date.now() }, "bienes")).catch(() => {}); }
  else {
    const copia = await tx("datos", "readonly", s => s.get("bienes")).catch(() => null);
    if (!copia) { $("bCuerpo").innerHTML = `<tr><td colspan="8" class="tv-vacio">${esc(d?.mensaje || "Sin internet y todavía no hay datos guardados en este equipo. Abre esta página una vez con internet.")}</td></tr>`; return null; }
    d = copia; sync.copia = true;
  }
  await refrescarSync();
  window.addEventListener("online", () => { sync.sinRed = false; pintarSync(); enviarCola(); });
  window.addEventListener("offline", pintarSync);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) enviarCola(); });
  setInterval(() => { if (sync.pend && !sync.sesion) enviarCola(); }, 15000);
  return d;
}

function pintarSync() {
  const el = $("bSync"); if (!el) return;
  const off = sinRed(), n = sync.pend, r = sync.rech;
  let cls = "", html = "";
  if (r.length) { cls = "mal"; html = `<div><b><i class="bi bi-exclamation-triangle"></i> ${r.length} ${r.length === 1 ? "cambio no se pudo aplicar" : "cambios no se pudieron aplicar"}</b> (siguen guardados aquí)<ul>${r.map(x => `<li>${esc(x.no_inventario)}${x.tipo === "clasif" ? " (cambio a " + esc(corta(x.clasificacion)) + ")" : x.tipo === "nuevo" ? " (registro nuevo)" : ""} — ${esc(x.mensaje)}</li>`).join("")}</ul></div><button type="button" class="tv-btn" id="bSyncReintentar"><i class="bi bi-arrow-repeat"></i> Reintentar</button>`; }
  else if (sync.sesion && n) { cls = "mal"; html = `<div><b><i class="bi bi-person-lock"></i> Tu sesión venció.</b> Tus ${n} cambios siguen guardados en este equipo; inicia sesión de nuevo y se subirán solos.</div><button type="button" class="tv-btn" id="bSyncSesion">Iniciar sesión</button>`; }
  else if (off) { cls = "off"; html = `<div><b><i class="bi bi-wifi-off"></i> Sin internet.</b> Puedes seguir confirmando${n ? `; hay ${n} ${n === 1 ? "cambio guardado" : "cambios guardados"} en este equipo` : ""} y se subirán solos cuando vuelva.</div>`; }
  else if (n) { cls = "env"; html = `<div><b><i class="bi bi-cloud-arrow-up"></i> Subiendo ${n} ${n === 1 ? "cambio" : "cambios"}…</b> Están guardados en este equipo.</div>`; }
  else if (sync.copia) { cls = "off"; html = `<div><b><i class="bi bi-hdd"></i> Mostrando la última copia guardada.</b> No se pudo conectar con el servidor.</div>`; }
  el.hidden = !html; el.className = "b-sync " + cls; el.innerHTML = html;
}
async function refrescarSync() {
  try { sync.pend = await tx("cola", "readonly", s => s.count()); sync.rech = await tx("rechazadas", "readonly", s => s.getAll()); } catch (e) {}
  pintarSync();
}
const permanente = (s) => s >= 400 && s < 500 && ![401, 408, 425, 429].includes(s);
async function enviarCola() {
  if (sync.enviando) return; sync.enviando = true; sync.sesion = false;
  try {
    for (;;) {
      const op = (await tx("cola", "readonly", s => s.getAll()))[0]; if (!op) break;
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), op.tipo === "nuevo" ? 150000 : 45000);
      let r;
      try { r = await fetch(op.tipo === "nuevo" ? "/api/nuevo" : op.tipo === "clasif" ? "/api/clasificacion" : "/api/existencia", { method: "POST", signal: ctl.signal, headers: { Authorization: "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" }, body: JSON.stringify(op.tipo === "nuevo" ? { datos: op.datos, fotos: op.fotos, opId: op.opId } : op.tipo === "clasif" ? { no_inventario: op.no_inventario, clasificacion: op.clasificacion, opId: op.opId } : { no_inventario: op.no_inventario, confirmado: op.confirmado, cuando: op.cuando, opId: op.opId }) }); }
      catch (e) { sync.sinRed = true; break; } finally { clearTimeout(t); }
      if (r.status === 401) { sync.sesion = true; break; }
      if (r.status >= 500 || !(r.ok || permanente(r.status))) { sync.sinRed = true; break; }   // servidor dormido o saturado: se reintenta
      sync.sinRed = false;
      const d = await r.json().catch(() => null);
      if (d?.ok) await tx("cola", "readwrite", s => s.delete(op.id));
      else {
        await tx("rechazadas", "readwrite", s => s.put({ ...op, mensaje: d?.mensaje || "El servidor lo rechazó." }));   // primero se guarda, luego sale de la cola
        await tx("cola", "readwrite", s => s.delete(op.id));
      }
      await refrescarSync();
    }
  } catch (e) { sync.sinRed = true; }
  sync.enviando = false; await refrescarSync();
  if (sync.copia && !sync.pend && !sync.sinRed && !sync.sesion && BIENES.length) recargarDatos();
}
// Volvió la red y ya no hay pendientes: se toma lo real del servidor en lugar de la copia guardada
async function recargarDatos() {
  try {
    const r = await fetch("/api/bienes", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
    const d = r.ok ? await r.json() : null; if (!d?.ok || sync.pend) return;
    BIENES = d.bienes; sync.copia = false;
    BIENES.forEach(b => { b.indice = norm([b.no_inventario, b.descripcion, b.marca, b.modelo, b.serie, b.cog, b.clave_armonizada, b.adscripcion, b.unidad_presupuestal, b.edificio, b.folio_fiscal, b.propuesta_dif, b.caracteristicas, b.material, b.color, b.ubicacion].join(" ")); });
    tx("datos", "readwrite", s => s.put({ ...d, guardada: Date.now() }, "bienes")).catch(() => {});
    const abierto = estado.abierto && $("bDialogo").open ? estado.abierto.no_inventario : null;
    pintarGrupos(); pintar(); pintarSync();
    if (abierto) verFicha(abierto);
  } catch (e) {}
}

function botonExistencia(b) {
  if (!b.existencia) return `<button type="button" class="b-exist" data-exist aria-label="Confirmar existencia del ${esc(b.no_inventario)}"><i class="bi bi-check2-circle"></i> Confirmar existencia</button>`;
  return `<span class="b-exist-ok" title="${esc(b.existencia.quien)} · ${esc(b.existencia.cuando)}"><i class="bi bi-patch-check-fill"></i> Confirmado<small>${esc(b.existencia.cuando)}</small></span><button type="button" class="b-exist-reg" data-exist title="Regresar a Por confirmar" aria-label="Regresar el ${esc(b.no_inventario)} a Por confirmar"><i class="bi bi-arrow-counterclockwise"></i></button>`;
}
function pintarBotonExistencia(b) {
  const x = $("bExistencia"); x.hidden = false;
  x.className = "tv-btn b-exist-dlg" + (b.existencia ? " reg" : " tv-btn-principal");
  x.innerHTML = b.existencia ? `<i class="bi bi-arrow-counterclockwise"></i> Regresar a Por confirmar` : `<i class="bi bi-check2-circle"></i> Confirmar existencia`;
}
// ── Cambiar entre Baja definitiva y Reaprovechamiento (con Mini SEBISO; también sin internet)
const OTRA_CLAS = { "Baja definitiva": "Para reaprovechamiento", "Para reaprovechamiento": "Baja definitiva" };
const corta = (c) => c === "Para reaprovechamiento" ? "Reaprovechamiento" : c;
function pintarBotonClas(b) {
  const x = $("bCambiarClas"), otra = OTRA_CLAS[b.clasificacion_bien];
  x.hidden = !otra; if (!otra) return;
  x.innerHTML = `<i class="bi bi-arrow-left-right"></i> Cambiar a ${corta(otra)}`;
}
async function cambiarClasificacion(inv) {
  const b = BIENES.find(x => x.no_inventario === inv), otra = b && OTRA_CLAS[b.clasificacion_bien]; if (!otra || marcando) return;
  const M = window.MiniSEBISO, pregunta = `¿Cambio el bien ${inv} de ${corta(b.clasificacion_bien)} a ${corta(otra)}?`;
  marcando = true;
  try {
    const si = M && M.preguntar && !M.apagado
      ? await M.preguntar({ titulo: "Cambiar estatus", pregunta, detalle: b.descripcion || "", btnOk: "Sí, cambiarlo", iconoOk: "ti-arrows-exchange", textoOk: `Lo paso a ${corta(otra)}…`, estiloOk: "dorado", btnCancel: "Cancelar", saludoOk: "¡Listo!", saludoCancel: "¡Va!", textoCancel: "Lo dejamos como está." })
      : confirm(pregunta);
    if (!si) return;
    const nueva = { tipo: "clasif", no_inventario: inv, clasificacion: otra, cuando: new Date().toISOString(), opId: uid() };
    try { await tx("cola", "readwrite", s => s.add(nueva)); } catch (e) { alert("No se pudo guardar en este equipo. Intenta de nuevo."); return; }
    aplicarOp(nueva); await guardarCopia();
    pintar();
    if ($("bDialogo").open && estado.abierto === b) verFicha(inv);
    await refrescarSync(); enviarCola();
  } finally { marcando = false; }
}
// ── Registrar un bien nuevo (fotos opcionales). Se guarda primero en la cola: funciona sin internet.
let nuevoFotos = [null, null, null];
function pintarNuevoFotos() {
  [...$("bNuevoCasillas").children].forEach((c, i) => {
    const f = nuevoFotos[i]; c.classList.toggle("lista", !!f);
    c.querySelector("img").src = f || ""; c.querySelector("img").hidden = !f;
    c.querySelector("span").textContent = f ? `${TOMAS[i]} ✓` : TOMAS[i];
  });
}
function abrirNuevo() {
  $("bNuevoForm").reset(); nuevoFotos = [null, null, null]; pintarNuevoFotos();
  $("bNuevoCampos").querySelectorAll("input[required]").forEach(i => i.closest("label").classList.add("falta"));
  $("bNuevoMsg").textContent = ""; $("bNuevoGuardar").disabled = false;
  abrir($("bNuevoDlg"));
  setTimeout(() => $("bNuevoForm").no_inventario.focus(), 50);
}
function agregarNuevoLocal(op) {
  const d = op.datos;
  if (BIENES.some(x => x.no_inventario === d.no_inventario)) return;
  const b = { ...d, moi: 0, nuevo: true, registrado_en: op.cuando, clasificacion_bien: d.clasificacion, fotos: (op.fotos || []).filter(Boolean),
    existencia: { quien: yo(), cuando: horaLocal(op.cuando) }, clasificacion: "Confirmados", tiene_pdf: false, puede_capturar_fotos: false, avisos: [], filas: [] };
  b.indice = norm([b.no_inventario, b.descripcion, b.marca, b.modelo, b.serie, b.adscripcion, b.unidad_presupuestal, b.ubicacion, b.material, b.color, b.caracteristicas].join(" "));
  BIENES.push(b);
}
async function guardarNuevo(e) {
  e.preventDefault();
  const f = $("bNuevoForm"), datos = {};
  [...f.elements].forEach(el => { if (el.name && el.type !== "file") datos[el.name] = el.value.trim(); });
  datos.no_inventario = datos.no_inventario.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9\-\/]{1,40}$/.test(datos.no_inventario)) { $("bNuevoMsg").textContent = "Escribe el No. de inventario."; f.no_inventario.focus(); return; }
  if (!datos.descripcion) { $("bNuevoMsg").textContent = "Falta la descripción."; f.descripcion.focus(); return; }
  if (BIENES.some(x => x.no_inventario === datos.no_inventario)) { $("bNuevoMsg").textContent = `El No. ${datos.no_inventario} ya está en la lista.`; f.no_inventario.focus(); return; }
  const n = nuevoFotos.filter(Boolean).length;
  const M = window.MiniSEBISO, pregunta = `¿Registro el bien ${datos.no_inventario}?`;
  const detalle = `${datos.descripcion} · ${n ? n + (n === 1 ? " foto" : " fotos") : "sin fotos"} · ${datos.clasificacion === "Para reaprovechamiento" ? "Reaprovechamiento" : "Baja definitiva"}`;
  const si = M && M.preguntar && !M.apagado
    ? await M.preguntar({ titulo: "Registrar bien", pregunta, detalle, btnOk: "Sí, registrarlo", iconoOk: "ti-plus", textoOk: "Lo registro…", estiloOk: "dorado", btnCancel: "Cancelar", saludoOk: "¡Listo!", saludoCancel: "¡Va!", textoCancel: "Sigue editando." })
    : confirm(pregunta);
  if (!si) return;
  $("bNuevoGuardar").disabled = true;
  const op = { tipo: "nuevo", no_inventario: datos.no_inventario, datos, fotos: nuevoFotos.filter(Boolean), cuando: new Date().toISOString(), opId: uid() };
  try { await tx("cola", "readwrite", s => s.add(op)); } catch (x) { $("bNuevoMsg").textContent = "No se pudo guardar en este equipo. Intenta de nuevo."; $("bNuevoGuardar").disabled = false; return; }
  agregarNuevoLocal(op); await guardarCopia();
  cerrar($("bNuevoDlg"));
  estado.grupo = "__nuevos"; pintarGrupos(); pintar();
  await refrescarSync(); enviarCola();
}
let marcando = false;
async function marcarExistencia(inv) {
  const b = BIENES.find(x => x.no_inventario === inv); if (!b || marcando) return;
  const confirmado = !b.existencia;
  const desc = [b.descripcion, b.marca && b.marca !== "SIN MARCA" ? b.marca : "", b.serie && b.serie !== "S/N" ? "Serie " + b.serie : ""].filter(Boolean).join(" · ");
  const op = confirmado
    ? { titulo: "Confirmar existencia", pregunta: `¿Confirmas que el bien ${inv} existe físicamente?`, btnOk: "Sí, confirmar", iconoOk: "ti-check", textoOk: "Lo paso a Confirmados…", estiloOk: "dorado" }
    : { titulo: "Regresar a Por confirmar", pregunta: `¿Regreso el bien ${inv} a Por confirmar?`, btnOk: "Sí, regresarlo", iconoOk: "ti-arrow-back-up", textoOk: "Lo regreso a Por confirmar…" };
  const M = window.MiniSEBISO;
  marcando = true;
  try {
    const si = M && M.preguntar && !M.apagado
      ? await M.preguntar({ ...op, detalle: desc, btnCancel: "Cancelar", saludoOk: "¡Listo!", saludoCancel: "¡Va!", textoCancel: "Lo dejamos como está." })
      : confirm(op.pregunta);
    if (!si) return;
    const nueva = { no_inventario: inv, confirmado, cuando: new Date().toISOString(), opId: uid() };
    try { await tx("cola", "readwrite", s => s.add(nueva)); } catch (e) { alert("No se pudo guardar en este equipo. Intenta de nuevo."); return; }
    aplicarOp(nueva); await guardarCopia();
    pintarGrupos(); pintar();
    if ($("bDialogo").open && estado.abierto === b) verFicha(inv);
    await refrescarSync(); enviarCola();
  } finally { marcando = false; }
}

// ── Galería: cada casilla de foto (captura y registro) trae un botón para elegir la imagen de la galería.
// La casilla sigue abriendo la cámara; el botón usa un selector sin "capture" y entrega la foto al mismo cuadro.
document.addEventListener("DOMContentLoaded", () => {
  ["bCapCasillas", "bNuevoCasillas"].forEach(id => {
    const cont = $(id); if (!cont) return;
    [...cont.children].forEach(label => {
      const cam = label.querySelector("input[type=file]");
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "b-cap-gal"; btn.innerHTML = `<i class="bi bi-images"></i> Galería`;
      btn.setAttribute("aria-label", `Elegir de la galería: ${label.querySelector("span")?.textContent || "foto"}`);
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const sel = document.createElement("input"); sel.type = "file"; sel.accept = "image/*";
        sel.addEventListener("change", () => {
          if (!sel.files || !sel.files[0]) return;
          const dt = new DataTransfer(); dt.items.add(sel.files[0]); cam.files = dt.files;   // mismo flujo que la cámara
          cam.dispatchEvent(new Event("change", { bubbles: true }));
        });
        sel.click();
      });
      label.appendChild(btn);
    });
  });
});
