// Entrega de bienes: mini sistema aparte. La pistola escribe el código y manda Enter; también hay buscador manual.
const $ = (id) => document.getElementById(id);
const H = () => ({ Authorization: "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
  $("enLista").innerHTML = lista.length ? lista.slice(0, 100).map(b => `<div class="en-item${b.no_inventario === foco ? " foco" : ""}">
      <div class="en-inv">${esc(b.no_inventario)}</div>
      <div class="en-desc"><b>${esc(b.descripcion)}</b><small>${esc([b.marca, b.modelo, b.serie && "Serie " + b.serie, b.estado_fisico, b.adscripcion].filter(x => x && x !== "SIN MARCA" && x !== "S/M").join(" · "))}</small></div>
      ${b.entregado ? `<div class="en-hecho">Entregado<br>${esc(b.entregado_en)}<br>${esc(b.entregado_por)}</div><button type="button" class="en-reg" data-inv="${esc(b.no_inventario)}" data-v="0">Regresar a por entregar</button>`
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
    if (b) { b.entregado = entregado; b.entregado_por = entregado ? "tú" : null; b.entregado_en = entregado ? "ahora" : null; }
    foco = null; $("enQ").value = ""; pintar();
    aviso(entregado ? `Bien ${inv} marcado como entregado.` : `Bien ${inv} regresó a por entregar.`, true);
    cargar();
  } catch (e) { aviso("Sin conexión: no se guardó. Intenta de nuevo."); }
  finally { ocupado = false; $("enQ").focus(); }
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
  $("enMOk").hidden = b.entregado; $("enMOk").dataset.inv = b.no_inventario;
  $("enModal").hidden = false; $("enModal").focus(); document.activeElement?.blur?.();
}
function cerrarFicha() { abierto = null; buffer = ""; $("enModal").hidden = true; $("enQ").value = ""; $("enQ").focus(); }
async function confirmarEntrega() {
  const b = abierto; if (!b) return;
  const pregunta = `¿Confirmas que el bien ${b.no_inventario} fue entregado?`, M = window.MiniSEBISO;
  const si = M && M.preguntar && !M.apagado
    ? await M.preguntar({ titulo: "Confirmar entrega", pregunta, detalle: b.descripcion, btnOk: "Sí, entregado", iconoOk: "ti-check", textoOk: "Lo paso a Entregados…", estiloOk: "dorado", btnCancel: "Cancelar", saludoOk: "¡Listo!", saludoCancel: "¡Va!", textoCancel: "Sigue sin entregarse." })
    : confirm(pregunta);
  if (!si) return;
  cerrarFicha(); await marcar(b.no_inventario, true);
}
function buscarCodigo(c) {
  c = String(c || "").trim().replace(/s+/g, ""); $("enQ").value = ""; if (!c) return;
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
$("enMCancel").addEventListener("click", cerrarFicha); $("enMCerrar").addEventListener("click", cerrarFicha);
$("enQ").addEventListener("input", () => { foco = null; pintar(); });
$("enLista").addEventListener("click", (e) => { const b = e.target.closest("button[data-inv]"); if (b) marcar(b.dataset.inv, b.dataset.v === "1"); });
document.querySelectorAll(".en-tabs button").forEach(t => t.addEventListener("click", () => { tab = t.dataset.t; foco = null; document.querySelectorAll(".en-tabs button").forEach(x => x.classList.toggle("on", x === t)); pintar(); $("enQ").focus(); }));
$("enSalir").addEventListener("click", () => { if (confirm("¿Cerrar sesión?")) { localStorage.removeItem("token"); localStorage.removeItem("area"); location.href = "index.html"; } });
document.addEventListener("click", (e) => { if (!e.target.closest("button,input")) $("enQ").focus(); });
cargar(); setInterval(() => { if (!ocupado && !document.hidden) cargar(); }, 30000);
$("enQ").addEventListener("focus", () => $("enQ").select());
