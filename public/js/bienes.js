let BIENES = [];
const estado = { pagina: 1, grupo: "", abierto: null, foto: 0, vista: [] };
const GRUPOS = [
  ["", "Todos"], ["Baja definitiva", "Baja definitiva"], ["Para reaprovechamiento", "Reaprovechamiento"],
  ["Propuesta DIF", "Propuesta DIF"], ["Pendiente de estatus", "Pendiente de estatus"], ["Fuera del padrón", "Fuera del padrón"], ["__sinfotos", "Sin fotos"],
];

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const pesos = (n) => n ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN" }) : "—";
const fecha = (f) => f ? new Date(f + "T12:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "";
const sinArea = (t) => String(t || "").replace(/^\d+\s*-\s*/, "");
const clase = (c) => ({ "Baja definitiva": "baja", "Para reaprovechamiento": "reap", "Propuesta DIF": "dif", "Pendiente de estatus": "pend", "Fuera del padrón": "foto", "__sinfotos": "sinf" }[c] || "");
const estadoDe = (b) => b.estado_fisico || b.estado_ficha || b.condicion_foto || "";

function filtrados() {
  const terminos = norm($("bBuscar").value).split(/\s+/).filter(Boolean);
  const est = $("bEstado").value, fotos = $("bFotos").value, ficha = $("bFicha").value;
  const enGrupo = (b) => !estado.grupo || (estado.grupo === "__sinfotos" ? !b.fotos.length : b.clasificacion === estado.grupo);
  const lista = BIENES.filter(b => enGrupo(b) && (!est || estadoDe(b) === est)
    && (!fotos || (fotos === "si") === b.fotos.length > 0) && (!ficha || (ficha === "si") === !!b.ficha) && terminos.every(t => b.indice.includes(t)));
  const o = $("bOrden").value;
  if (o === "moi") lista.sort((a, b) => (b.moi || 0) - (a.moi || 0));
  else if (o === "fecha") lista.sort((a, b) => (a.fecha_adquisicion || "9").localeCompare(b.fecha_adquisicion || "9"));
  return lista;
}

// Sin barras deslizantes: en cada página caben las filas que permite la ventana
function filasPorPagina() {
  const arriba = $("bContenedor").getBoundingClientRect().top;
  const movil = window.innerWidth <= 900;
  return Math.max(4, Math.floor((window.innerHeight - arriba - (movil ? 0 : 34) - 58) / (movil ? 92 : 53)));
}

function pintarGrupos() {
  $("bGrupos").innerHTML = GRUPOS.map(([v, t]) => {
    const l = !v ? BIENES : v === "__sinfotos" ? BIENES.filter(b => !b.fotos.length) : BIENES.filter(b => b.clasificacion === v);
    return `<button type="button" role="tab" class="b-grupo ${clase(v)}" data-grupo="${esc(v)}" aria-selected="${estado.grupo === v}">
      <span>${t}</span><b>${l.length.toLocaleString("es-MX")}</b><small>${pesos(l.reduce((s, b) => s + (b.moi || 0), 0))}</small></button>`;
  }).join("");
}

function pintar() {
  const lista = filtrados();
  estado.vista = lista;
  const porPagina = filasPorPagina();
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  estado.pagina = Math.min(estado.pagina, paginas);
  const inicio = (estado.pagina - 1) * porPagina;
  $("bCuerpo").innerHTML = lista.slice(inicio, inicio + porPagina).map(b => `<tr data-inv="${esc(b.no_inventario)}">
      <td class="b-c">${b.fotos.length ? `<img class="b-mini" src="${b.fotos[0]}" alt="" loading="lazy">` : `<span class="b-mini b-mini-vacia"><i class="bi bi-camera"></i></span>`}</td>
      <td class="b-num">${esc(b.no_inventario)}${b.avisos.length ? ` <i class="bi bi-info-circle-fill b-aviso" title="${esc(b.avisos.join(" "))}"></i>` : ""}</td>
      <td><span class="b-desc"><b>${esc(b.descripcion || "Sin descripción")}</b> ${esc([b.marca, b.modelo].filter(x => x && x !== "SIN MARCA").join(" · "))}<small>${esc(sinArea(b.unidad_presupuestal))}</small></span></td>
      <td><span class="b-pill ${clase(b.clasificacion)}">${esc(b.clasificacion)}</span>${b.propuesta_dif ? `<small class="b-sub">${esc(b.propuesta_dif)}</small>` : ""}</td>
      <td class="b-c">${estadoDe(b) ? `<span class="b-estado e-${norm(estadoDe(b)).toLowerCase()}">${esc(estadoDe(b))}</span>` : "—"}</td>
      <td class="b-d">${pesos(b.moi)}</td>
      <td class="b-c"><button type="button" class="p-icono b-ver" title="Ver ficha técnica" aria-label="Ver ficha técnica del ${esc(b.no_inventario)}"><i class="bi bi-file-earmark-text"></i></button></td>
    </tr>`).join("") || `<tr><td colspan="7" class="tv-vacio">Ningún bien coincide con la búsqueda.</td></tr>`;
  $("bConteo").textContent = `${lista.length.toLocaleString("es-MX")} ${lista.length === 1 ? "bien" : "bienes"}`;
  $("bPagina").textContent = `Página ${estado.pagina} de ${paginas}`;
  $("bAnterior").disabled = estado.pagina <= 1;
  $("bSiguiente").disabled = estado.pagina >= paginas;
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
  ["Fotos tomadas en el sistema", (b) => b.fotos_capturadas ? `${b.fotos_capturadas.quien} · ${fecha(b.fotos_capturadas.cuando)}` : ""],
  ["Unidad presupuestal", (b) => sinArea(b.unidad_presupuestal), 2], ["Adscripción", "adscripcion"],
  ["Edificio", "edificio", 3], ["Folio fiscal", "folio_fiscal", 3],
];
const valor = (b, c) => (typeof c === "function" ? c(b) : b[c]) || "";

function fichaHTML(b) {
  return `<dl class="b-datos">${DATOS.map(([t, c, ancho]) => `<div${ancho ? ` class="a${ancho}"` : ""}><dt>${t}</dt><dd>${esc(valor(b, c)) || "—"}</dd></div>`).join("")}</dl>
    ${b.caracteristicas ? `<p class="b-texto"><b>Características</b>${esc(b.caracteristicas)}</p>` : ""}
    ${b.pendiente && !b.estatus_capturado ? `<p class="b-nota b-nota-pend"><i class="bi bi-exclamation-triangle"></i> ${esc(b.pendiente)}</p>` : ""}
    ${b.avisos.length ? `<p class="b-nota"><i class="bi bi-info-circle"></i> ${esc(b.avisos.join(" "))}</p>` : ""}`;
}

// ── Captura de las 3 fotos desde el celular (bienes sin fotos)
const captura = { fotos: [null, null, null] };
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
    casilla.querySelector("span").textContent = f ? `Foto ${i + 1} ✓` : `Tomar foto ${i + 1}`;
  });
  const n = captura.fotos.filter(Boolean).length;
  $("bCapGuardar").disabled = n < 3;
  $("bCapGuardar").textContent = n < 3 ? `Faltan ${3 - n} ${3 - n === 1 ? "foto" : "fotos"}` : "Guardar las 3 fotos";
}
async function guardarCaptura() {
  const b = estado.abierto;
  $("bCapGuardar").disabled = true; $("bCapMsg").textContent = "Guardando fotos…";
  try {
    const r = await fetch(`/api/bienes/${encodeURIComponent(b.no_inventario)}/fotos`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("token") }, body: JSON.stringify({ fotos: captura.fotos }) });
    if (r.status === 401) { location.href = "index.html"; return; }
    const d = await r.json();
    if (!d.ok) { $("bCapMsg").textContent = d.mensaje || "No se pudieron guardar."; $("bCapGuardar").disabled = false; return; }
    b.fotos = d.fotos; b.fotos_capturadas = d.fotos_capturadas;
    captura.fotos = [null, null, null]; captura.rehacer = false;
    pintarGrupos(); pintar(); verFicha(b.no_inventario);
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
  $("bDescargar").hidden = !b.tiene_pdf; $("bImprimir").hidden = !b.tiene_pdf;
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
  if (!$("bDialogo").open) $("bDialogo").showModal();
}

// La ficha técnica oficial se ve en PDF dentro del sistema
// El PDF vive en Drive: el servidor da un enlace que dura unos minutos y lo entrega
async function enlacePdf(b) {
  const r = await fetch(`/api/ficha/${encodeURIComponent(b.no_inventario)}/enlace`, { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
  if (r.status === 401) { location.href = "index.html"; return null; }
  return (await r.json()).url;
}
async function verPdf(b) {
  $("bPdfTitulo").textContent = `Ficha técnica · ${b.no_inventario}`;
  $("bPdfMarco").removeAttribute("src");
  $("bPdf").showModal();
  const url = await enlacePdf(b);
  if (url) { $("bPdfMarco").src = url; $("bPdfAbrir").href = url; }
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
  BIENES = (await r.json()).bienes;
  BIENES.forEach(b => { b.indice = norm([b.no_inventario, b.descripcion, b.marca, b.modelo, b.serie, b.cog, b.clave_armonizada, b.adscripcion, b.unidad_presupuestal, b.edificio, b.folio_fiscal, b.propuesta_dif, b.caracteristicas, b.material, b.color, b.ubicacion].join(" ")); });
  const estados = [...new Set(BIENES.map(estadoDe).filter(Boolean))].sort();
  $("bEstado").innerHTML = `<option value="">Todos los estados</option>` + estados.map(e => `<option>${esc(e)}</option>`).join("");
  pintarGrupos();
  $("bGrupos").addEventListener("click", (e) => {
    const g = e.target.closest(".b-grupo"); if (!g) return;
    estado.grupo = g.dataset.grupo; estado.pagina = 1; pintarGrupos(); pintar();
  });
  ["bBuscar", "bEstado", "bFotos", "bFicha", "bOrden"].forEach(id => $(id).addEventListener("input", () => { estado.pagina = 1; pintar(); }));
  $("bAnterior").addEventListener("click", () => { estado.pagina--; pintar(); });
  $("bSiguiente").addEventListener("click", () => { estado.pagina++; pintar(); });
  $("bCuerpo").addEventListener("click", (e) => { const f = e.target.closest("tr[data-inv]"); if (f) verFicha(f.dataset.inv); });
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
  $("bPdfCerrar").addEventListener("click", () => $("bPdf").close());
  $("bCapCasillas").addEventListener("change", async (e) => {
    const i = +e.target.dataset.i, archivo = e.target.files && e.target.files[0]; e.target.value = "";
    if (!archivo) return;
    $("bCapMsg").textContent = "Preparando foto…";
    try { captura.fotos[i] = await reducir(archivo); $("bCapMsg").textContent = ""; } catch (x) { $("bCapMsg").textContent = "Esa foto no se pudo leer. Tómala otra vez."; }
    pintarCaptura();
  });
  $("bCapGuardar").addEventListener("click", guardarCaptura);
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
  window.addEventListener("resize", pintar);
  // el encabezado se arma después: al cambiar de alto, se recalculan los renglones que caben
  let arribaAntes = $("bContenedor").getBoundingClientRect().top;
  const revisar = () => { const a = $("bContenedor").getBoundingClientRect().top + window.scrollY; if (Math.abs(a - arribaAntes) > 2) { arribaAntes = a; pintar(); } };
  if (window.ResizeObserver) new ResizeObserver(revisar).observe(document.body);
  pintar();
});
