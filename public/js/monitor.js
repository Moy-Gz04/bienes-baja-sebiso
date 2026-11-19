// Monitor en tiempo real de las existencias confirmadas (consulta al servidor cada 4 s)
const GRUPOS = [["Todos", null, ""], ["Baja definitiva", "Baja definitiva", "baja"], ["Para reaprovechamiento", "Para reaprovechamiento", "reap"], ["DIF", "Propuesta DIF", "dif"]];
const MAX = 300;
let datos = [], grupo = "Todos", vistos = null;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const n = (x) => x.toLocaleString("es-MX");
const clase = (c) => (GRUPOS.find(g => g[1] === c) || [])[2] || "";
const en = (g) => g[1] ? datos.filter(d => d.clasificacion === g[1]) : datos;

function pintar(nuevos = new Set()) {
  $("moGrupos").innerHTML = GRUPOS.map(g => `<button type="button" role="tab" class="b-grupo ${g[2]}" data-g="${esc(g[0])}" aria-selected="${grupo === g[0]}"><span>${esc(g[0])}</span><b>${n(en(g).length)}</b></button>`).join("");
  const sel = en(GRUPOS.find(g => g[0] === grupo)), ver = sel.slice(0, MAX);
  $("moLista").innerHTML = `<div class="mo-fila mo-cab"><div>Hora</div><div>No. inv.</div><div>Descripción</div><div>Clasificación</div><div>Confirmó</div></div>` +
    (ver.length ? ver.map(d => `<div class="mo-fila${nuevos.has(d.no_inventario) ? " nueva" : ""}"><div>${esc(d.hora)}</div><div><b>${esc(d.no_inventario)}</b></div><div>${esc(d.descripcion)}<small>${esc([d.marca, d.modelo, d.serie].filter(Boolean).join(" · "))}${d.nuevo ? " · Registro nuevo" : ""}</small></div><div><span class="b-pill ${clase(d.clasificacion)}">${esc(d.clasificacion || "—")}</span></div><div>${esc(d.quien)}</div></div>`).join("") : `<div class="mo-vacio">Aún no hay confirmaciones en esta categoría.</div>`) +
    (sel.length > MAX ? `<div class="mo-resto">Se muestran las ${MAX} más recientes de ${n(sel.length)}.</div>` : "");
}

async function cargar() {
  try {
    const r = await fetch("/api/monitor-existencias", { headers: { Authorization: "Bearer " + localStorage.getItem("token") }, cache: "no-store" });
    if (r.status === 401) { localStorage.clear(); location.href = "index.html"; return; }
    const j = await r.json(); if (!j.ok) throw new Error(j.mensaje);
    datos = j.confirmados;
    const ids = new Set(datos.map(d => d.no_inventario)), nuevos = new Set(vistos ? [...ids].filter(i => !vistos.has(i)) : []);
    vistos = ids;
    $("moResumen").innerHTML = `<span><b>${n(j.total)}</b> bienes</span><span><b>${n(datos.length)}</b> confirmados</span><span><b>${n(j.total - datos.length)}</b> por confirmar</span>`;
    $("moVivo").classList.remove("off"); $("moVivo").lastChild.textContent = "En vivo · " + new Date().toLocaleTimeString("es-MX");
    pintar(nuevos);
  } catch (e) { $("moVivo").classList.add("off"); $("moVivo").lastChild.textContent = "Sin conexión, reintentando…"; }
}

$("moGrupos").addEventListener("click", (e) => { const b = e.target.closest("[data-g]"); if (b) { grupo = b.dataset.g; pintar(); } });
cargar(); setInterval(() => { if (!document.hidden) cargar(); }, 4000);
