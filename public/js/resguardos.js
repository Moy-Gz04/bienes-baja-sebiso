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
  const detalle = (b) => [b.desc, b.carac].filter(Boolean).join(" — ");
  const chips = lista.map(b => `<li data-inv="${esc(b.inv)}"${b.ok ? ' class="ok"' : ""}${detalle(b) ? ` title="${esc(detalle(b))}"` : ""}>${esc(b.inv)}${b.desc ? `<small>${esc(b.desc)}</small>` : ""}</li>`).join("");
  const mas = n > VISIBLES ? `<button type="button" class="rg-mas" data-id="${p.id}">${abierta ? "Ver menos" : `Ver los ${n} bienes`}</button>` : "";
  return `<article class="rg-card${p.vacante ? " vacante" : ""}" data-persona="${p.id}">
    <div class="rg-foto">${avatar}</div>
    <div class="rg-datos"><h3>${esc(p.nombre)}</h3>
      <p class="rg-cargo">${esc(p.cargo || (p.vacante ? "Plaza vacante" : "Sin cargo registrado"))}</p>
      ${p.jefe ? `<p class="rg-jefe"><i class="bi bi-diagram-2"></i> ${esc(p.jefe)}</p>` : ""}</div>
    <div class="rg-total"><b>${n}</b><span>${n === 1 ? "bien" : "bienes"}</span></div>
    <ul class="rg-bienes">${chips}</ul>
    <div class="rg-pie">${mas}${p.por_actualizar ? `<span class="rg-pend" title="Se movieron bienes o se registró a la persona después de generar el PDF"><i class="bi bi-arrow-repeat"></i> PDF por actualizar</span>` : ""}<button type="button" class="tv-btn rg-admin" data-admin="${p.id}"><i class="bi bi-pencil-square"></i> ${p.vacante ? "Registrar / mover" : "Mover / foto"}</button>${p.resguardo ? `<a class="tv-btn rg-pdf" href="${esc(p.resguardo)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> Ver resguardo</a>` : ""}</div></article>`;
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

// ── Trabajo sin internet ─────────────────────────────────────────────────────────────────────────
// Cada cambio se guarda primero en IndexedDB (cola) y recién después se aplica en pantalla; la cola se envía en orden
// en cuanto hay internet y un cambio solo sale de la cola cuando el servidor lo confirmó. Si el servidor lo rechaza
// pasa a "rechazadas" (queda visible, no se borra). La lista de personas se guarda también para poder abrir sin red.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
navigator.storage?.persist?.().catch(() => {});
const abrirBD = () => new Promise((ok, mal) => {
  const r = indexedDB.open("resguardos-offline", 1);
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
const guardarCopia = () => tx("datos", "readwrite", s => s.put(PERSONAS, "personas")).catch(() => {});
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const sync = { sinRed: false, sesion: false, copia: false, enviando: false, hubo: false, pend: 0, rech: [] };
const sinRed = () => !navigator.onLine || sync.sinRed;

function pintarSync() {
  const el = $("rgSync"), off = sinRed(), n = sync.pend, r = sync.rech;
  let cls = "", html = "";
  if (r.length) { cls = "mal"; html = `<div><b><i class="bi bi-exclamation-triangle"></i> ${r.length} ${r.length === 1 ? "cambio no se pudo aplicar" : "cambios no se pudieron aplicar"}</b> (siguen guardados aquí)<ul>${r.map(x => `<li>${esc(x.texto)} — ${esc(x.mensaje)}</li>`).join("")}</ul></div><button type="button" class="tv-btn" id="rgSyncReintentar"><i class="bi bi-arrow-repeat"></i> Reintentar</button>`; }
  else if (sync.sesion && n) { cls = "mal"; html = `<div><b><i class="bi bi-person-lock"></i> Tu sesión venció.</b> Tus ${n} cambios siguen guardados en este equipo; inicia sesión de nuevo y se enviarán solos.</div><a class="tv-btn" href="index.html">Iniciar sesión</a>`; }
  else if (off) { cls = "off"; html = `<div><b><i class="bi bi-wifi-off"></i> Sin internet.</b> Puedes seguir trabajando${n ? `; hay ${n} ${n === 1 ? "cambio guardado" : "cambios guardados"} en este equipo` : ""} y se enviarán solos cuando vuelva.</div>`; }
  else if (n) { cls = "env"; html = `<div><b><i class="bi bi-cloud-arrow-up"></i> Enviando ${n} ${n === 1 ? "cambio" : "cambios"}…</b> Están guardados en este equipo.</div>`; }
  else if (sync.copia) { cls = "off"; html = `<div><b><i class="bi bi-hdd"></i> Mostrando la última copia guardada.</b> No se pudo conectar con el servidor; se actualizará sola.</div>`; }
  el.hidden = !html; el.className = "rg-sync " + cls; el.innerHTML = html;
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
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000);
      let r;
      try { r = await fetch(op.ruta, { method: "POST", signal: ctl.signal, headers: { Authorization: "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" }, body: JSON.stringify({ ...op.cuerpo, opId: op.opId }) }); }
      catch (e) { sync.sinRed = true; break; } finally { clearTimeout(t); }
      if (r.status === 401) { sync.sesion = true; break; }
      if (r.status >= 500 || !(r.ok || permanente(r.status))) { sync.sinRed = true; break; }   // servidor dormido o saturado: se reintenta
      sync.sinRed = false;
      const d = await r.json().catch(() => null);
      if (d?.ok) {
        await tx("cola", "readwrite", s => s.delete(op.id));
        const p = op.tipo === "foto" && d.foto ? porId(op.persona) : null;
        if (p && String(p.foto).startsWith("data:")) { p.foto = d.foto; pintar(); if ($("rgDlg").open) pintarDlg(); guardarCopia(); }
      } else {
        await tx("rechazadas", "readwrite", s => s.put({ ...op, mensaje: d?.mensaje || "El servidor lo rechazó.", cuando: Date.now() }));   // primero se guarda, luego sale de la cola
        await tx("cola", "readwrite", s => s.delete(op.id)); sync.hubo = true;
      }
      await refrescarSync();
    }
  } catch (e) { sync.sinRed = true; }
  sync.enviando = false; await refrescarSync();
  if (sync.hubo && !sync.pend) { sync.hubo = false; cargar(); }   // hubo rechazos: se vuelve a leer lo real del servidor
}

// Guarda el cambio en la cola; solo si quedó guardado se aplica en pantalla.
async function cambiar(op, aplicar) {
  try { await tx("cola", "readwrite", s => s.add({ ...op, opId: uid(), creada: Date.now() })); } catch (e) { return false; }
  aplicar(); await guardarCopia(); await refrescarSync(); enviarCola();
  return true;
}
const sufijoRed = () => sinRed() ? " Sin internet: se guardó en este equipo y se enviará solo." : "";

async function cargar() {
  await enviarCola();
  let d = null;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch("/api/resguardos", { signal: ctl.signal, headers: { Authorization: "Bearer " + localStorage.getItem("token") } }).finally(() => clearTimeout(t));
    if (r.status === 401) { sync.sesion = true; if (!sync.pend) { localStorage.removeItem("token"); location.href = "index.html"; return; } }
    else d = await r.json();
  } catch (e) { sync.sinRed = true; }
  await refrescarSync();
  const copia = await tx("datos", "readonly", s => s.get("personas")).catch(() => null);
  if (d?.ok && !sync.pend) { PERSONAS = d.personas; sync.copia = false; sync.sinRed = false; guardarCopia(); }
  else if (PERSONAS.length) { sync.copia = !d?.ok; }
  else if (copia?.length) { PERSONAS = copia; sync.copia = !d?.ok; }
  else if (d?.ok) { PERSONAS = d.personas; }
  else { $("rgLista").innerHTML = `<p class="rg-vacio">${esc(d?.mensaje || "Sin internet y todavía no hay datos guardados en este equipo. Abre esta página una vez con internet.")}</p>`; pintarSync(); return; }
  PERSONAS.forEach(indexar);
  pintarAreas(); pintar(); pintarSync();
  if ($("rgDlg").open) pintarDlg();
}
{ const b = document.createElement("div"); b.id = "rgSync"; b.className = "rg-sync"; b.hidden = true; b.setAttribute("role", "status"); b.setAttribute("aria-live", "polite"); $("rgAreas").before(b);
  b.addEventListener("click", async (e) => {
    if (!e.target.closest("#rgSyncReintentar")) return;
    for (const x of sync.rech) { const { id, mensaje, cuando, ...op } = x; await tx("cola", "readwrite", s => s.add(op)); await tx("rechazadas", "readwrite", s => s.delete(id)); }
    await refrescarSync(); enviarCola();
  }); }
window.addEventListener("online", () => { sync.sinRed = false; pintarSync(); enviarCola().then(() => { if (sync.copia && !sync.pend) cargar(); }); });
window.addEventListener("offline", pintarSync);
document.addEventListener("visibilitychange", () => { if (!document.hidden) enviarCola(); });
setInterval(() => { if (sync.pend || sync.sesion === false && sync.sinRed) enviarCola(); if (sync.copia && !sync.pend && !sync.enviando) cargar(); }, 15000);

$("rgAreas").addEventListener("click", (e) => { const b = e.target.closest("[data-area]"); if (!b) return; estado.area = b.dataset.area; pintarAreas(); pintar(); });
$("rgLista").addEventListener("click", (e) => {
  const b = e.target.closest(".rg-mas");
  if (b) { const id = Number(b.dataset.id); estado.abiertos.has(id) ? estado.abiertos.delete(id) : estado.abiertos.add(id); pintar(); return; }
  if (e.target.closest("a")) return;
  const card = e.target.closest(".rg-card"); if (!card) return;
  const chip = e.target.closest("[data-inv]");
  abrirPersona(Number(card.dataset.persona), chip ? chip.dataset.inv : null);
});
["rgBuscar", "rgFoto", "rgTipo"].forEach(id => $(id).addEventListener("input", pintar));

// ── Ventana de la persona: mover un No. de inventario a otra persona, cambiar la foto y registrar a alguien en una vacante
const dlg = { id: 0, mover: null, area: "", msg: "", ok: true, ocupado: false };
const porId = (id) => PERSONAS.find(p => p.id === id);
function indexar(p) { p.indice = norm([p.nombre, p.cargo, p.jefe, p.seccion, p.area, ...p.bienes.flatMap(b => [b.inv, b.desc, b.tipo, b.serie])].join(" ")); }
function reducir(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      ok(cv.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo leer la foto")); };
    img.src = url;
  });
}
const areasOrden = () => [...new Map(PERSONAS.map(p => [p.area, p.area_orden])).entries()].sort((a, b) => a[1] - b[1]).map(([a]) => a);
const etiqueta = (q) => q.vacante ? `${q.nombre} (plaza vacante)` : `${q.nombre}${q.cargo ? " — " + q.cargo : ""}`;

function opcionesPersonas(area, excluir) {
  const secs = new Map();
  for (const q of PERSONAS) if (q.area === area && q.id !== excluir) { if (!secs.has(q.seccion)) secs.set(q.seccion, []); secs.get(q.seccion).push(q); }
  return `<option value="">Elige a la persona…</option>` + [...secs].map(([s, qs]) => `<optgroup label="${esc(s)}">${qs.map(q => `<option value="${q.id}">${esc(etiqueta(q))} · ${q.bienes.length}</option>`).join("")}</optgroup>`).join("");
}

function pintarDlg() {
  const p = porId(dlg.id); if (!p) return;
  const foto = p.foto ? `<img src="${esc(p.foto)}" alt="Foto de ${esc(p.nombre)}">` : `<span class="rg-ini${p.vacante ? " vac" : ""}">${p.vacante ? '<i class="bi bi-person-dash"></i>' : esc(iniciales(p.nombre))}</span>`;
  const registro = p.vacante ? `<form class="rg-reg" id="rgReg" novalidate>
      <h3><i class="bi bi-person-plus"></i> Registrar persona en esta vacante</h3>
      <div class="rg-reg-campos">
        <label>Nombre completo<input name="nombre" required maxlength="120" autocomplete="off" placeholder="Nombre y apellidos"></label>
        <label>Cargo<input name="cargo" required maxlength="120" autocomplete="off"></label>
        <label>Jefe inmediato<input name="jefe" maxlength="120" autocomplete="off" value="${esc(p.jefe || "")}"></label>
      </div>
      <div class="tv-dialogo-acc"><button type="submit" class="tv-btn tv-btn-principal" ${dlg.ocupado ? "disabled" : ""}><i class="bi bi-check-lg"></i> Registrar persona</button></div>
    </form>` : "";
  const bienes = p.bienes.map(b => {
    const sub = [b.desc, [b.marca, b.modelo].filter(v => v && v !== "-").join(" "), b.serie && b.serie !== "-" ? "Serie " + b.serie : ""].filter(Boolean).join(" · ");
    const abierto = dlg.mover === b.inv;
    return `<li class="${abierto ? "abierto" : ""}${b.ok ? " ok" : ""}"><div class="rg-b-fila"><div class="rg-b-txt"><b>${esc(b.inv)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>
      <button type="button" class="tv-btn rg-b-ok${b.ok ? " on" : ""}" data-ok="${esc(b.inv)}" aria-pressed="${!!b.ok}" ${dlg.ocupado ? "disabled" : ""}><i class="bi bi-check-circle${b.ok ? "-fill" : ""}"></i> ${b.ok ? "Correcto" : "Marcar correcto"}</button>
      <button type="button" class="tv-btn rg-b-mover" data-mover="${esc(b.inv)}" aria-expanded="${abierto}"><i class="bi bi-arrow-left-right"></i> ${abierto ? "Cancelar" : "Mover"}</button></div>
      ${abierto ? `<div class="rg-mover">
        <label>Área<select id="rgMovArea">${areasOrden().map(a => `<option${a === dlg.area ? " selected" : ""}>${esc(a)}</option>`).join("")}</select></label>
        <label>Persona que lo recibe<select id="rgMovPersona">${opcionesPersonas(dlg.area, p.id)}</select></label>
        <button type="button" class="tv-btn tv-btn-principal" id="rgMovOk" ${dlg.ocupado ? "disabled" : ""}><i class="bi bi-check-lg"></i> Mover aquí</button></div>` : ""}</li>`;
  }).join("");
  $("rgDlgCuerpo").innerHTML = `<div class="rg-d-cabeza">
      <div class="rg-d-foto">${foto}</div>
      <div class="rg-d-datos"><p class="tv-eyebrow">${esc(p.area)}${p.seccion && p.seccion.toUpperCase() !== p.area.toUpperCase() ? " · " + esc(p.seccion) : ""}</p>
        <h2 id="rgDlgNombre">${esc(p.nombre)}</h2>
        <p class="rg-cargo">${esc(p.cargo || (p.vacante ? "Plaza vacante" : "Sin cargo registrado"))}</p>
        ${p.jefe ? `<p class="rg-jefe"><i class="bi bi-diagram-2"></i> ${esc(p.jefe)}</p>` : ""}
        <div class="rg-d-acc"><button type="button" class="tv-btn" id="rgCambiarFoto" ${dlg.ocupado ? "disabled" : ""}><i class="bi bi-camera"></i> ${p.foto ? "Cambiar foto" : "Agregar foto"}</button>
          ${p.resguardo ? `<a class="tv-btn" href="${esc(p.resguardo)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> Ver resguardo</a>` : ""}</div></div>
    </div>
    <p class="rg-d-msg${dlg.ok ? "" : " mal"}" role="status">${esc(dlg.msg)}</p>
    ${registro}
    <h3 class="rg-d-tit">Bienes en resguardo <small>${p.bienes.length}</small></h3>
    ${p.bienes.length ? `<ul class="rg-d-bienes">${bienes}</ul>` : `<p class="rg-vacio rg-d-vacio">No tiene bienes asignados.</p>`}`;
}

function abrirPersona(id, inv) {
  const p = porId(id); if (!p) return;
  Object.assign(dlg, { id, mover: inv && p.bienes.some(b => b.inv === inv) ? inv : null, area: p.area, msg: "", ok: true, ocupado: false });
  pintarDlg();
  const d = $("rgDlg");
  if (!d.open) { d.showModal(); document.documentElement.classList.add("con-ventana"); }
  if (dlg.mover) $("rgMovPersona")?.focus();
}
const aviso = (msg, ok = true) => { dlg.msg = msg; dlg.ok = ok; };

async function mover() {
  const destino = Number($("rgMovPersona").value), o = porId(dlg.id), d = porId(destino), inv = dlg.mover;
  if (!d) { aviso("Elige a la persona que recibirá el bien.", false); return pintarDlg(); }
  dlg.ocupado = true; pintarDlg();
  const ok = await cambiar({ tipo: "mover", ruta: "/api/resguardos/mover", cuerpo: { origen: o.id, destino, inv }, persona: o.id, texto: `Mover ${inv} de ${o.nombre} a ${d.nombre}` }, () => {
    const i = o.bienes.findIndex(b => b.inv === inv), [b] = o.bienes.splice(i, 1);
    d.bienes.push(b); o.por_actualizar = d.por_actualizar = true; indexar(o); indexar(d); dlg.mover = null;
    pintarAreas(); pintar();
  });
  dlg.ocupado = false;
  aviso(ok ? `Listo: el ${inv} pasó a ${d.nombre}.${sufijoRed()}` : "No se pudo guardar el cambio en este equipo. Intenta de nuevo.", ok);
  pintarDlg();
}

async function registrar(form) {
  const f = Object.fromEntries(new FormData(form));
  const avisoSolo = (t) => { aviso(t, false); const m = $("rgDlgCuerpo").querySelector(".rg-d-msg"); m.textContent = t; m.classList.add("mal"); };
  if (f.nombre.trim().length < 5 || !f.cargo.trim()) return avisoSolo("Escribe el nombre completo y el cargo.");
  dlg.ocupado = true; form.querySelector("button[type=submit]").disabled = true;
  const t = (v) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 120), p = porId(dlg.id), datos = { nombre: t(f.nombre), cargo: t(f.cargo), jefe: t(f.jefe) || null };
  const ok = await cambiar({ tipo: "persona", ruta: `/api/resguardos/${p.id}/persona`, cuerpo: f, persona: p.id, texto: `Registrar a ${datos.nombre} en la vacante «${p.nombre}»` }, () => { Object.assign(p, datos, { vacante: false, por_actualizar: true }); indexar(p); pintar(); });
  dlg.ocupado = false;
  if (ok) { aviso(`Se registró a ${p.nombre}.${sufijoRed()}`); pintarDlg(); }
  else { form.querySelector("button[type=submit]").disabled = false; avisoSolo("No se pudo guardar el cambio en este equipo. Intenta de nuevo."); }
}

async function marcarCorrecto(inv) {
  const b = porId(dlg.id).bienes.find(x => x.inv === inv); if (!b) return;
  const nuevo = !b.ok;
  dlg.ocupado = true; pintarDlg();
  const ok = await cambiar({ tipo: "correcto", ruta: "/api/resguardos/correcto", cuerpo: { inv, correcto: nuevo }, persona: dlg.id, texto: `${nuevo ? "Marcar" : "Quitar"} correcto el ${inv}` }, () => {
    for (const q of PERSONAS) for (const x of q.bienes) if (x.inv === inv) x.ok = nuevo;
    pintar();
  });
  dlg.ocupado = false;
  aviso(ok ? (nuevo ? `El ${inv} quedó marcado como correcto.` : `Se quitó la marca de correcto al ${inv}.`) + sufijoRed() : "No se pudo guardar la marca en este equipo. Intenta de nuevo.", ok);
  pintarDlg();
}

$("rgDlgCuerpo").addEventListener("click", (e) => {
  const k = e.target.closest("[data-ok]"); if (k) return marcarCorrecto(k.dataset.ok);
  const m = e.target.closest("[data-mover]");
  if (m) { dlg.mover = dlg.mover === m.dataset.mover ? null : m.dataset.mover; dlg.area = porId(dlg.id).area; aviso(""); pintarDlg(); if (dlg.mover) $("rgMovPersona").focus(); return; }
  if (e.target.closest("#rgMovOk")) return mover();
  if (e.target.closest("#rgCambiarFoto")) $("rgFotoArchivo").click();
});
$("rgDlgCuerpo").addEventListener("change", (e) => { if (e.target.id === "rgMovArea") { dlg.area = e.target.value; $("rgMovPersona").innerHTML = opcionesPersonas(dlg.area, dlg.id); } });
$("rgDlgCuerpo").addEventListener("submit", (e) => { if (e.target.id === "rgReg") { e.preventDefault(); registrar(e.target); } });
$("rgFotoArchivo").addEventListener("change", async (e) => {
  const archivo = e.target.files[0]; e.target.value = ""; if (!archivo) return;
  dlg.ocupado = true; aviso("Guardando foto…"); pintarDlg();
  try {
    const url = await reducir(archivo), p = porId(dlg.id);
    const ok = await cambiar({ tipo: "foto", ruta: `/api/resguardos/${p.id}/foto`, cuerpo: { foto: url }, persona: p.id, texto: `Cambiar la foto de ${p.nombre}` }, () => { p.foto = url; pintar(); });
    aviso(ok ? "Foto actualizada." + sufijoRed() : "No se pudo guardar la foto en este equipo.", ok);
  } catch (err) { aviso("No se pudo leer la foto. Prueba con otra.", false); }
  dlg.ocupado = false; pintarDlg();
});
const dlgEl = $("rgDlg");
dlgEl.addEventListener("click", (e) => { if (e.target === dlgEl || e.target.closest("[data-cerrar]")) dlgEl.close(); });
dlgEl.addEventListener("close", () => document.documentElement.classList.remove("con-ventana"));
cargar();
