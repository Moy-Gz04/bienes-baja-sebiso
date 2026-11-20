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
// Pistola: escribe el código y manda Enter → coincidencia exacta de No. de inventario.
$("enQ").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return; e.preventDefault();
  const c = $("enQ").value.trim().replace(/\s+/g, ""); if (!c) return;
  const b = BIENES.find(x => x.no_inventario.toLowerCase() === c.toLowerCase());
  if (b) {
    tab = b.entregado ? "hecho" : "pend"; document.querySelectorAll(".en-tabs button").forEach(t => t.classList.toggle("on", t.dataset.t === tab));
    foco = b.no_inventario; $("enQ").value = ""; pintar();
    aviso(b.entregado ? `El bien ${b.no_inventario} ya estaba entregado (${b.entregado_en}).` : `Bien ${b.no_inventario} encontrado: presiona «Entregado».`, !b.entregado);
  } else { $("enQ").value = ""; foco = null; aviso(`El No. ${c} no está entre los bienes con existencia confirmada. Revisa que se haya confirmado o registrado.`); pintar(); }
  $("enQ").value = "";   // cada pistolazo deja la barra limpia para el siguiente
});
$("enQ").addEventListener("focus", () => $("enQ").select());
$("enQ").addEventListener("input", () => { foco = null; pintar(); });
$("enLista").addEventListener("click", (e) => { const b = e.target.closest("button[data-inv]"); if (b) marcar(b.dataset.inv, b.dataset.v === "1"); });
document.querySelectorAll(".en-tabs button").forEach(t => t.addEventListener("click", () => { tab = t.dataset.t; foco = null; document.querySelectorAll(".en-tabs button").forEach(x => x.classList.toggle("on", x === t)); pintar(); $("enQ").focus(); }));
$("enSalir").addEventListener("click", () => { if (confirm("¿Cerrar sesión?")) { localStorage.removeItem("token"); localStorage.removeItem("area"); location.href = "index.html"; } });
document.addEventListener("click", (e) => { if (!e.target.closest("button,input")) $("enQ").focus(); });
cargar(); setInterval(() => { if (!ocupado && !document.hidden) cargar(); }, 30000);
