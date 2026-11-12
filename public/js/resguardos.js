let PERSONAS = [];
const estado = { area: "", abiertos: new Set() };
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const iniciales = (n) => n.split(/\s+/).filter(w => /^\p{L}/u.test(w) && w.length > 2).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
const VISIBLES = 8;   // bienes que se ven sin abrir la tarjeta

function filtrados() {
  const q = norm($("rgBuscar").value).split(/\s+/).filter(Boolean), foto = $("rgFoto").value, tipo = $("rgTipo").value;
  return PERSONAS.filter(p => (!estado.area || p.area === estado.area) && (!foto || (foto === "si") === !!p.foto) && (!tipo || (tipo === "v") === p.vacante) && q.every(t => p.indice.includes(t)));
}

function tarjeta(p) {
  const abierta = estado.abiertos.has(p.id), n = p.bienes.length, lista = abierta ? p.bienes : p.bienes.slice(0, VISIBLES);
  const avatar = p.foto ? `<img src="${esc(p.foto)}" alt="Foto de ${esc(p.nombre)}" loading="lazy">` : `<span class="rg-ini${p.vacante ? " vac" : ""}">${p.vacante ? '<i class="bi bi-person-dash"></i>' : esc(iniciales(p.nombre))}</span>`;
  const detalle = (b) => [b.tipo, b.modelo, b.desc, b.serie && "S/N " + b.serie, b.obs].filter(Boolean).join(" · ");
  const chips = lista.map(b => `<li${detalle(b) ? ` title="${esc(detalle(b))}"` : ""}>${esc(b.inv)}</li>`).join("");
  const mas = n > VISIBLES ? `<button type="button" class="rg-mas" data-id="${p.id}">${abierta ? "Ver menos" : `Ver los ${n} bienes`}</button>` : "";
  return `<article class="rg-card${p.vacante ? " vacante" : ""}">
    <div class="rg-foto">${avatar}</div>
    <div class="rg-datos"><h3>${esc(p.nombre)}</h3>
      <p class="rg-cargo">${esc(p.cargo || (p.vacante ? "Plaza vacante" : "Sin cargo registrado"))}</p>
      ${p.jefe ? `<p class="rg-jefe"><i class="bi bi-diagram-2"></i> ${esc(p.jefe)}</p>` : ""}</div>
    <div class="rg-total"><b>${n}</b><span>${n === 1 ? "bien" : "bienes"}</span></div>
    <ul class="rg-bienes">${chips}</ul>${mas}</article>`;
}

function pintar() {
  const lista = filtrados(), porArea = new Map();
  for (const p of lista) { if (!porArea.has(p.area)) porArea.set(p.area, new Map()); const s = porArea.get(p.area); if (!s.has(p.seccion)) s.set(p.seccion, []); s.get(p.seccion).push(p); }
  const bienes = lista.reduce((a, p) => a + p.bienes.length, 0);
  $("rgResumen").innerHTML = `<div><b>${lista.length}</b>personas</div><div><b>${bienes.toLocaleString("es-MX")}</b>bienes</div><div><b>${porArea.size}</b>${porArea.size === 1 ? "área" : "áreas"}</div>`;
  $("rgLista").innerHTML = lista.length ? [...porArea].map(([area, secs]) => {
    const total = [...secs.values()].flat();
    return `<section class="rg-area"><header><h2>${esc(area)}</h2><span>${total.length} personas · ${total.reduce((a, p) => a + p.bienes.length, 0)} bienes</span></header>
      ${[...secs].map(([sec, ps]) => `<div class="rg-seccion">${secs.size > 1 || sec.toUpperCase() !== area.toUpperCase() ? `<h3 class="rg-sec-t">${esc(sec)} <small>${ps.length}</small></h3>` : ""}
        <div class="rg-grid">${ps.map(tarjeta).join("")}</div></div>`).join("")}</section>`;
  }).join("") : `<p class="rg-vacio">No hay personas que coincidan con la búsqueda.</p>`;
}

function pintarAreas() {
  const areas = [...new Map(PERSONAS.map(p => [p.area, p.area_orden])).entries()].sort((a, b) => a[1] - b[1]).map(([a]) => a);
  const cuenta = (a) => PERSONAS.filter(p => !a || p.area === a);
  $("rgAreas").innerHTML = [["", "Todas las áreas"], ...areas.map(a => [a, a])].map(([a, t]) => {
    const c = cuenta(a);
    return `<button type="button" role="tab" class="rg-area-btn" aria-selected="${estado.area === a}" data-area="${esc(a)}"><span>${esc(t)}</span><b>${c.length}</b><small>${c.reduce((s, p) => s + p.bienes.length, 0)} bienes</small></button>`;
  }).join("");
}

async function cargar() {
  const r = await fetch("/api/resguardos", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
  if (r.status === 401) { localStorage.removeItem("token"); location.href = "index.html"; return; }
  const d = await r.json();
  if (!d.ok) { $("rgLista").innerHTML = `<p class="rg-vacio">${esc(d.mensaje || "No se pudieron cargar los resguardos.")}</p>`; return; }
  PERSONAS = d.personas.map(p => ({ ...p, indice: norm([p.nombre, p.cargo, p.jefe, p.seccion, p.area, ...p.bienes.flatMap(b => [b.inv, b.desc, b.tipo, b.serie])].join(" ")) }));
  pintarAreas(); pintar();
}

$("rgAreas").addEventListener("click", (e) => { const b = e.target.closest("[data-area]"); if (!b) return; estado.area = b.dataset.area; pintarAreas(); pintar(); });
$("rgLista").addEventListener("click", (e) => { const b = e.target.closest(".rg-mas"); if (!b) return; const id = Number(b.dataset.id); estado.abiertos.has(id) ? estado.abiertos.delete(id) : estado.abiertos.add(id); pintar(); });
["rgBuscar", "rgFoto", "rgTipo"].forEach(id => $(id).addEventListener("input", pintar));
cargar();
