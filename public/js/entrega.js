// Entrega de bienes: mini sistema aparte. La pistola escribe el código y manda Enter; también hay buscador manual.
const $ = (id) => document.getElementById(id);
const H = () => ({ Authorization: "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// En celular/tableta no se enfoca solo el buscador: así el teclado no se abre sin que lo toquen
const TACTIL = matchMedia("(pointer: coarse)").matches;
const enfocar = () => { if (!TACTIL) $("enQ").focus(); };
const YO = (() => { try { return JSON.parse(atob(localStorage.getItem("token").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).usuario || "—"; } catch (e) { return "—"; } })();
let BIENES = [], tab = "pend", foco = null, ocupado = false, tAviso = 0;

function aviso(txt, ok) { const a = $("enAviso"); a.textContent = txt; a.className = "en-aviso" + (ok ? " ok" : ""); a.hidden = !txt; clearTimeout(tAviso); if (txt) tAviso = setTimeout(() => { a.hidden = true; }, 6000); }
function sesionVencida() { localStorage.removeItem("token"); location.href = "index.html"; }

async function cargar() {
  try {
    const r = await fetch("/api/entregas", { headers: H() });
    if (r.status === 401 || r.status === 403) return sesionVencida();
    const d = await r.json(); if (!d.ok) throw new Error(d.mensaje);
    BIENES = d.bienes; pintar();
  } catch (e) { aviso("No se pudo cargar la lista: " + (e.message || "sin conexión") + ". Reintenta."); }
}
function pintar() {
  const pend = BIENES.filter(b => !b.entregado), hecho = BIENES.filter(b => b.entregado);
  $("enPend").textContent = pend.length.toLocaleString("es-MX"); $("enHecho").textContent = hecho.length.toLocaleString("es-MX");
  const q = norm($("enQ").value.trim());
  let lista = (tab === "pend" ? pend : hecho);
  if (q) lista = lista.filter(b => norm([b.no_inventario, b.descripcion, b.marca, b.modelo, b.serie, b.adscripcion].join(" ")).includes(q));
  if (foco && !lista.some(b => b.no_inventario === foco)) foco = null;
  lista = lista.slice().sort((a, b) => (b.no_inventario === foco) - (a.no_inventario === foco));
  $("enLista").innerHTML = lista.length ? lista.slice(0, 100).map(b => `<div class="en-item${b.no_inventario === foco ? " foco" : ""}" data-inv="${esc(b.no_inventario)}">
      <div class="en-inv">${esc(b.no_inventario)}</div>
      <div class="en-mini">${[0, 1, 2].map(i => (b.fotos || [])[i] ? `<img src="${esc(b.fotos[i])}" loading="lazy" alt="">` : `<span><i class="bi bi-image"></i></span>`).join("")}</div>
      <div class="en-desc"><b>${esc(b.descripcion)}</b><small>${esc([b.marca, b.modelo, b.serie && "Serie " + b.serie, b.estado_fisico, b.adscripcion].filter(x => x && x !== "SIN MARCA" && x !== "S/M").join(" · "))}</small></div>
      ${b.entregado ? `<div class="en-hecho">Entregado<br>${esc(b.entregado_en)}<br>${esc(b.entregado_por)}</div><button type="button" class="en-reg" data-inv="${esc(b.no_inventario)}" data-v="0"><i class="bi bi-arrow-counterclockwise"></i> Regresar</button>`
        : `<button type="button" class="en-ok" data-inv="${esc(b.no_inventario)}" data-v="1"><i class="bi bi-check2-circle"></i> Entregado</button>`}
    </div>`).join("") + (lista.length > 100 ? `<div class="en-vacio">Mostrando 100 de ${lista.length}. Afina la búsqueda.</div>` : "")
    : `<div class="en-vacio">${q ? "Sin resultados." : tab === "pend" ? "No hay bienes por entregar." : "Todavía no hay entregados."}</div>`;
}
async function marcar(inv, entregado) {
  if (ocupado) return; ocupado = true;
  try {
    const r = await fetch("/api/entrega", { method: "POST", headers: H(), body: JSON.stringify({ no_inventario: inv, entregado }) });
    if (r.status === 401) return sesionVencida();
    const d = await r.json().catch(() => null);
    if (!d?.ok) { aviso(d?.mensaje || "No se pudo guardar. Intenta de nuevo."); return; }
    const b = BIENES.find(x => x.no_inventario === inv);
    if (b) { b.entregado = entregado; b.entregado_por = entregado ? YO : null; b.entregado_en = entregado ? "ahora" : null; }
    foco = null; $("enQ").value = ""; pintar();
    aviso(entregado ? `Bien ${inv} marcado como entregado.` : `Bien ${inv} regresó a por entregar.`, true);
    cargar();
  } catch (e) { aviso("Sin conexión: no se guardó. Intenta de nuevo."); }
  finally { ocupado = false; enfocar(); }
}
// Ventana del bien: 3 fotos + datos + botón Entregado (con la confirmación de MiniSEBISO)
let abierto = null, buffer = "";
function abrirFicha(b) {
  abierto = b; buffer = "";
  $("enMInv").textContent = "No. " + b.no_inventario; $("enMTit").textContent = b.descripcion || "Bien";
  const f = (b.fotos || []).slice(0, 3);
  $("enMFotos").innerHTML = [0, 1, 2].map(i => f[i] ? `<img src="${esc(f[i])}" alt="Foto ${i + 1} del bien ${esc(b.no_inventario)}">` : `<div class="en-sinfoto">Sin foto ${i + 1}</div>`).join("");
  const filas = [["Marca", b.marca], ["Modelo", b.modelo], ["Serie", b.serie], ["Estado físico", b.estado_fisico], ["Color", b.color], ["Material", b.material], ["Clasificación", b.clasificacion], ["Adscripción", b.adscripcion], ["Unidad", b.unidad_presupuestal], ["Ubicación", [b.ubicacion, b.edificio].filter(Boolean).join(" · ")]];
  $("enMInfo").innerHTML = filas.filter(([, v]) => v && v !== "SIN MARCA" && v !== "S/M" && v !== "S/N").map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("enMOk").hidden = b.entregado; $("enMOk").dataset.inv = b.no_inventario; $("enMReg").hidden = !b.entregado;
  $("enMInv").textContent = "No. " + b.no_inventario + (b.entregado ? ` · Entregado ${b.entregado_en || ""}${b.entregado_por ? " por " + b.entregado_por : ""}` : "");
  $("enModal").hidden = false; $("enModal").focus(); document.activeElement?.blur?.();
}
function cerrarFicha() { abierto = null; buffer = ""; $("enModal").hidden = true; $("enQ").value = ""; enfocar(); }
async function confirmarEntrega() {
  const b = abierto; if (!b) return;
  const pregunta = `¿Confirmas que el bien ${b.no_inventario} fue entregado?`, M = window.MiniSEBISO;
  const si = M && M.preguntar && !M.apagado
    ? await M.preguntar({ titulo: "Confirmar entrega", pregunta, detalle: b.descripcion, btnOk: "Sí, entregado", iconoOk: "ti-check", textoOk: "Lo paso a Entregados…", estiloOk: "dorado", rapido: true, btnCancel: "Cancelar", saludoOk: "¡Listo!", saludoCancel: "¡Va!", textoCancel: "Sigue sin entregarse." })
    : confirm(pregunta);
  if (!si) return;
  cerrarFicha(); await marcar(b.no_inventario, true);
}
async function confirmarRegreso(b) {
  if (!b) return;
  const pregunta = `¿Regreso el bien ${b.no_inventario} a Por entregar?`, M = window.MiniSEBISO;
  const si = M && M.preguntar && !M.apagado
    ? await M.preguntar({ titulo: "Regresar a por entregar", pregunta, detalle: b.descripcion, btnOk: "Sí, regresarlo", iconoOk: "ti-arrow-back-up", textoOk: "Lo regreso a Por entregar…", estiloOk: "dorado", rapido: true, btnCancel: "Cancelar", saludoOk: "¡Listo!", saludoCancel: "¡Va!", textoCancel: "Sigue como entregado." })
    : confirm(pregunta);
  if (!si) return;
  if (abierto) cerrarFicha(); await marcar(b.no_inventario, false);
}
function buscarCodigo(c) {
  c = String(c || "").trim().replace(/\s+/g, ""); $("enQ").value = ""; if (!c) return;
  const b = BIENES.find(x => x.no_inventario.toLowerCase() === c.toLowerCase());
  if (b) {
    tab = b.entregado ? "hecho" : "pend"; document.querySelectorAll(".en-tabs button").forEach(t => t.classList.toggle("on", t.dataset.t === tab));
    foco = b.no_inventario; pintar(); abrirFicha(b);
    aviso(b.entregado ? `El bien ${b.no_inventario} ya estaba entregado (${b.entregado_en}).` : "", false);
  } else { foco = null; aviso(`El No. ${c} no está entre los bienes con existencia confirmada. Revisa que se haya confirmado o registrado.`); pintar(); }
}
// Pistola: escribe el código y manda Enter. Con la ventana abierta la pistola no toca ningún botón: se acumula el código y el Enter abre el siguiente bien.
$("enQ").addEventListener("keydown", (e) => { if (e.key !== "Enter") return; e.preventDefault(); buscarCodigo($("enQ").value); });
document.addEventListener("keydown", (e) => {
  if ($("enModal").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Escape") { cerrarFicha(); return; }
  if (e.key === "Enter") { e.preventDefault(); const c = buffer; buffer = ""; if (c) { cerrarFicha(); buscarCodigo(c); } return; }
  if (e.key.length === 1) { e.preventDefault(); buffer += e.key; }
});
$("enMOk").addEventListener("click", confirmarEntrega);
$("enMReg").addEventListener("click", () => confirmarRegreso(abierto));
$("enMCancel").addEventListener("click", cerrarFicha); $("enMCerrar").addEventListener("click", cerrarFicha);
$("enQ").addEventListener("input", () => { foco = null; pintar(); });
$("enLista").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-inv]");
  if (b) { if (b.dataset.v === "1") { const x = BIENES.find(y => y.no_inventario === b.dataset.inv); if (x) { abrirFicha(x); confirmarEntrega(); } } else confirmarRegreso(BIENES.find(y => y.no_inventario === b.dataset.inv)); return; }
  const fila = e.target.closest(".en-item"); if (!fila) return;
  const x = BIENES.find(y => y.no_inventario === fila.dataset.inv); if (x) abrirFicha(x);
});
document.querySelectorAll(".en-tabs button").forEach(t => t.addEventListener("click", () => { tab = t.dataset.t; foco = null; document.querySelectorAll(".en-tabs button").forEach(x => x.classList.toggle("on", x === t)); pintar(); enfocar(); }));
$("enSalir").addEventListener("click", async () => {
  const M = window.MiniSEBISO;
  const si = M && M.preguntar && !M.apagado
    ? await M.preguntar({ titulo: "Cerrar sesión", pregunta: "¿Quieres cerrar tu sesión de Entrega?", btnOk: "Sí, salir", iconoOk: "ti-logout", textoOk: "Cerrando sesión…", estiloOk: "dorado", rapido: true, btnCancel: "Cancelar", saludoOk: "¡Hasta luego!", saludoCancel: "¡Va!", textoCancel: "Seguimos trabajando." })
    : confirm("¿Cerrar sesión?");
  if (si) { localStorage.removeItem("token"); localStorage.removeItem("area"); location.href = "index.html"; }
});
document.addEventListener("click", (e) => { if (!e.target.closest("button,input,.en-chat")) enfocar(); });
enfocar(); cargar(); setInterval(() => { if (!ocupado && !document.hidden) cargar(); }, 30000);
$("enQ").addEventListener("focus", () => $("enQ").select());

// Monitor en vivo: cada 3 s trae las últimas entregas (de todos los usuarios) con su hora
let vivoFirma = "", vivoOcupado = false;
async function vivo() {
  if (vivoOcupado || document.hidden) return; vivoOcupado = true;
  try {
    const r = await fetch("/api/entregas/recientes", { headers: H() });
    if (r.status === 401) return sesionVencida();
    const d = await r.json(); if (!d.ok) throw 0;
    $("enVHoy").textContent = `${d.hoy.toLocaleString("es-MX")} hoy`;
    $("enVAct").textContent = "Actualizado " + new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    $("enVAct").classList.remove("err");
    const firma = d.recientes.map(x => x.no_inventario + x.hora).join("|");
    if (firma === vivoFirma) return;
    const antes = new Set(vivoFirma.split("|")); const primera = !vivoFirma; vivoFirma = firma;
    const hoyF = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
    $("enVLista").innerHTML = d.recientes.length ? d.recientes.map(x => `<li class="${!primera && !antes.has(x.no_inventario + x.hora) ? "nuevo" : ""}" data-inv="${esc(x.no_inventario)}">
        <span class="en-vhora">${esc(x.hora.slice(0, 5))}<small>${x.fecha === hoyF ? esc(x.hora.slice(6)) + " s" : esc(x.fecha.slice(5).split("-").reverse().join("/"))}</small></span>
        <span class="en-vtxt"><b>${esc(x.no_inventario)}</b><small>${esc(x.descripcion || "")}</small></span>
        <span class="en-vquien">${esc(x.quien || "")}</span></li>`).join("")
      : `<li class="en-vvacio">Todavía no hay entregas.</li>`;
    $("enVVer").hidden = d.recientes.length < 2;
    if (!primera) {
      cargar();   // alguien entregó: refresca la lista de abajo
      d.recientes.filter(x => !antes.has(x.no_inventario + x.hora)).slice(0, 3).reverse().forEach(toast);
    }
  } catch { $("enVAct").textContent = "Sin conexión, reintentando…"; $("enVAct").classList.add("err"); }
  finally { vivoOcupado = false; }
}
// Notificación arriba: dura 3 s y se desvanece
function toast(x) {
  const t = document.createElement("div"); t.className = "en-toast";
  t.innerHTML = `<i class="bi bi-check-circle-fill"></i><div><b>Bien ${esc(x.no_inventario)} entregado</b><small>${esc(x.hora.slice(0, 5))} · ${esc(x.descripcion || "")}</small></div>`;
  $("enToasts").appendChild(t);
  setTimeout(() => { t.classList.add("sale"); setTimeout(() => t.remove(), 450); }, 3000);
}
// Ver: muestra todas las recientes o solo la última
$("enVVer").addEventListener("click", () => {
  const l = $("enVLista"), abierto = l.classList.toggle("solo1") === false;
  $("enVVer").setAttribute("aria-expanded", abierto);
  $("enVVer").innerHTML = abierto ? `<i class="bi bi-chevron-up"></i> Ocultar` : `<i class="bi bi-chevron-down"></i> Ver`;
});
$("enVLista").addEventListener("click", (e) => { const li = e.target.closest("li[data-inv]"); const b = li && BIENES.find(x => x.no_inventario === li.dataset.inv); if (b) abrirFicha(b); });
vivo(); setInterval(vivo, 3000);

// Bitácora: resumen por usuario (botones para filtrar) y lista de acciones con quién y cuándo
let BIT = null, bitFiltro = "";
$("enYo").textContent = YO;
function pintarBit() {
  const U = BIT.usuarios;
  $("enBUsu").innerHTML = `<button type="button" data-u="" class="${bitFiltro ? "" : "on"}"><b>Todos</b><small>${BIT.acciones.length.toLocaleString("es-MX")} acciones</small></button>` +
    U.map(u => `<button type="button" data-u="${esc(u.quien)}" class="${bitFiltro === u.quien ? "on" : ""}"><b>${esc(u.quien)}</b><small>${u.vigentes} entregados · ${u.hoy} hoy${u.regresos ? ` · ${u.regresos} regresos` : ""}</small></button>`).join("");
  const L = BIT.acciones.filter(a => !bitFiltro || a.quien === bitFiltro);
  $("enBLista").innerHTML = L.length ? L.slice(0, 500).map(a => `<li data-inv="${esc(a.no_inventario)}">
      <span class="en-btipo ${a.accion}">${a.accion === "entrega" ? '<i class="bi bi-check2-circle"></i> Entregó' : '<i class="bi bi-arrow-counterclockwise"></i> Regresó'}</span>
      <span class="en-vtxt"><b>${esc(a.no_inventario)}</b><small>${esc(a.descripcion || "")}${a.detalle ? " · " + esc(a.detalle) : ""}</small></span>
      <span class="en-bq"><b>${esc(a.quien)}</b><small>${esc(a.cuando.slice(8, 10) + "/" + a.cuando.slice(5, 7) + " " + a.cuando.slice(11, 16))}</small></span></li>`).join("")
    : `<li class="en-vvacio">Sin acciones registradas.</li>`;
}
async function abrirBit() {
  $("enBModal").hidden = false; $("enBLista").innerHTML = `<li class="en-vvacio">Cargando…</li>`; $("enBUsu").innerHTML = "";
  try {
    const r = await fetch("/api/entregas/bitacora", { headers: H() });
    if (r.status === 401) return sesionVencida();
    const d = await r.json(); if (!d.ok) throw new Error(d.mensaje);
    BIT = d; pintarBit();
  } catch (e) { $("enBLista").innerHTML = `<li class="en-vvacio">No se pudo cargar: ${esc(e.message || "sin conexión")}.</li>`; }
}
const cerrarBit = () => { $("enBModal").hidden = true; enfocar(); };
$("enBit").addEventListener("click", abrirBit);
$("enBCerrar").addEventListener("click", cerrarBit);
$("enBModal").addEventListener("click", (e) => { if (e.target.id === "enBModal") cerrarBit(); });
$("enBUsu").addEventListener("click", (e) => { const b = e.target.closest("button[data-u]"); if (b) { bitFiltro = b.dataset.u; pintarBit(); } });
$("enBLista").addEventListener("click", (e) => { const li = e.target.closest("li[data-inv]"); const b = li && BIENES.find(x => x.no_inventario === li.dataset.inv); if (b) { cerrarBit(); abrirFicha(b); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("enBModal").hidden) cerrarBit(); });
