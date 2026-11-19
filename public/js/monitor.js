// Monitor de existencias: consulta cada 4 s mientras la pestaña está visible.
(() => {
  "use strict";
  const GRUPOS = [["Todos", null, ""], ["Baja definitiva", "Baja definitiva", "baja"], ["Para reaprovechamiento", "Para reaprovechamiento", "reap"], ["DIF", "Propuesta DIF", "dif"]];
  const MAX = 300;
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const n = x => x.toLocaleString("es-MX");
  const normalizar = t => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
  const reloj = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const fecha = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
  let datos = [], grupo = 0, total = 0, vistos = null, cargando = false, ultima = "";
  const en = g => g[1] ? datos.filter(d => d.clasificacion === g[1]) : datos;
  const porcentaje = cantidad => total ? Math.min(100, cantidad / total * 100) : 0;
  const formatoPorcentaje = valor => valor.toLocaleString("es-MX", { maximumFractionDigits: 1 }) + "%";

  // 'hora' ya contiene la hora de México; no usar la zona del navegador.
  function momento(d) {
    let local = String(d.hora ?? "");
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(local)) {
      const instante = d.cuando ? new Date(d.cuando) : new Date(NaN);
      if (Number.isNaN(instante.getTime())) return { hora: "—", fecha: "Sin fecha" };
      const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instante);
      const parte = tipo => partes.find(p => p.type === tipo).value;
      local = `${parte("year")}-${parte("month")}-${parte("day")} ${reloj.format(instante)}`;
    }
    const dia = new Date(local.slice(0, 10) + "T12:00:00Z");
    return { hora: local.slice(11), fecha: Number.isNaN(dia.getTime()) ? "Sin fecha" : fecha.format(dia) };
  }

  // Mantener los botones entre consultas conserva el foco del teclado.
  $("moGrupos").innerHTML = GRUPOS.map((g, i) => `<button type="button" id="moTab${i}" role="tab" class="b-grupo ${g[2]}" data-g="${i}" aria-controls="moPanel" aria-selected="${i === grupo}" tabindex="${i === grupo ? 0 : -1}"><span>${esc(g[0])}</span><b>—</b><small>Del total de bienes</small></button>`).join("");

  function pintar(nuevos = new Set()) {
    [...$("moGrupos").children].forEach((boton, i) => {
      boton.setAttribute("aria-selected", String(i === grupo));
      boton.tabIndex = i === grupo ? 0 : -1;
      boton.querySelector("b").textContent = vistos ? n(en(GRUPOS[i]).length) : "—";
      boton.querySelector("small").textContent = vistos ? `${formatoPorcentaje(porcentaje(en(GRUPOS[i]).length))} del total` : "Del total de bienes";
    });
    $("moPanel").setAttribute("aria-labelledby", `moTab${grupo}`);
    const buscar = normalizar($("moBuscar").value.trim());
    const sel = en(GRUPOS[grupo]).filter(d => !buscar || [d.no_inventario, d.descripcion, d.quien].some(v => normalizar(v).includes(buscar)));
    const ver = sel.slice(0, MAX);
    $("moLista").innerHTML = ver.map(d => {
      const tiempo = momento(d);
      const clase = GRUPOS.find(g => g[1] === d.clasificacion)?.[2] || "";
      const detalle = [["Marca", d.marca], ["Modelo", d.modelo], ["Serie", d.serie]].filter(([, v]) => v).map(([etiqueta, v]) => `${etiqueta}: ${v}`).join(" · ");
      return `<tr class="${nuevos.has(String(d.no_inventario)) ? "nueva" : ""}"><td data-label="Hora"><div><strong class="mo-hora">${esc(tiempo.hora)}</strong><small>${esc(tiempo.fecha)}</small></div></td><td data-label="No. inventario"><b class="b-num">${esc(d.no_inventario)}</b></td><td data-label="Descripción"><div><strong>${esc(d.descripcion || "Sin descripción")}</strong><small>${esc(detalle)}</small>${d.nuevo ? '<span class="mo-nuevo">Nuevo</span>' : ""}</div></td><td data-label="Clasificación"><span class="b-pill ${clase}">${esc(d.clasificacion || "Sin clasificación")}</span></td><td data-label="Estado físico"><span>${esc(d.estado_fisico || "Sin especificar")}</span></td><td data-label="Confirmó"><span>${esc(d.quien || "Sin especificar")}</span></td><td data-label="Ficha técnica">${fichaCelda(d)}</td></tr>`;
    }).join("");
    $("moConteo").textContent = vistos ? `${n(sel.length)} ${sel.length === 1 ? "confirmación" : "confirmaciones"}` : "";
    $("moVacio").hidden = ver.length > 0;
    if (vistos) $("moVacio").innerHTML = `<i class="bi ${buscar ? "bi-search" : "bi-box-seam"}" aria-hidden="true"></i><strong>${buscar ? "No encontramos coincidencias" : "Aún no hay confirmaciones en esta categoría"}</strong><p>${buscar ? "Prueba con otro número de inventario, descripción o nombre." : "Las nuevas confirmaciones aparecerán aquí automáticamente."}</p>`;
    $("moResto").hidden = sel.length <= MAX;
    $("moResto").textContent = `Se muestran las ${n(MAX)} confirmaciones más recientes de ${n(sel.length)}. Usa el buscador para acotar los resultados.`;
  }

  async function cargar() {
    if (document.hidden || cargando) return;
    cargando = true;
    const control = new AbortController();
    const timeout = setTimeout(() => control.abort(), 15000);
    try {
      const r = await fetch("/api/monitor-existencias", { headers: { Authorization: "Bearer " + localStorage.getItem("token") }, cache: "no-store", signal: control.signal });
      if (r.status === 401 || r.status === 403) { localStorage.clear(); location.href = "index.html"; return; }
      if (!r.ok) throw new Error("Error de conexión");
      const j = await r.json();
      if (!j.ok || !Array.isArray(j.confirmados) || !Number.isFinite(Number(j.total)) || Number(j.total) < 0) throw new Error("Respuesta inválida");
      datos = j.confirmados;
      total = Number(j.total);
      datos.sort((a, b) => String(b.hora || b.cuando || "").localeCompare(String(a.hora || a.cuando || "")));
      const ids = new Set(datos.map(d => String(d.no_inventario)));
      const nuevos = new Set(vistos ? [...ids].filter(id => !vistos.has(id)) : []);
      vistos = ids;
      $("moResumen").innerHTML = `<span><b>${esc(n(total))}</b> bienes</span><span><b>${esc(n(datos.length))}</b> confirmados</span><span><b>${esc(n(Math.max(0, total - datos.length)))}</b> por confirmar</span>`;
      const avance = porcentaje(datos.length);
      $("moProgreso").value = avance;
      $("moProgreso").textContent = formatoPorcentaje(avance);
      $("moPorcentaje").textContent = formatoPorcentaje(avance);
      ultima = reloj.format(new Date());
      $("moVivo").classList.remove("off", "pendiente");
      $("moVivo").lastElementChild.textContent = `En vivo · Última actualización: ${ultima}`;
      pintar(nuevos);
    } catch {
      $("moVivo").classList.remove("pendiente");
      $("moVivo").classList.add("off");
      $("moVivo").lastElementChild.textContent = `Sin conexión · Reintentando…${ultima ? ` · Última actualización: ${ultima}` : ""}`;
      if (!vistos) $("moVacio").innerHTML = '<i class="bi bi-wifi-off" aria-hidden="true"></i><strong>No pudimos cargar las confirmaciones</strong><p>Reintentaremos la conexión automáticamente.</p>';
    } finally {
      clearTimeout(timeout);
      cargando = false;
    }
  }

  $("moGrupos").addEventListener("click", e => {
    const boton = e.target.closest("[data-g]");
    if (boton) { grupo = Number(boton.dataset.g); pintar(); }
  });
  $("moGrupos").addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    grupo = e.key === "Home" ? 0 : e.key === "End" ? GRUPOS.length - 1 : (grupo + (e.key === "ArrowRight" ? 1 : -1) + GRUPOS.length) % GRUPOS.length;
    pintar();
    $(`moTab${grupo}`).focus();
  });
  $("moBuscar").addEventListener("input", () => pintar());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) cargar(); });
  cargar();
  setInterval(cargar, 4000);
})();

// ── Ficha técnica: firmada (escaneada), del sistema (sin firma) o generándose
function fichaCelda(d) {
  if (!d.tiene_ficha || d.ficha_generando) return `<span class="mo-ficha-gen"><i class="bi bi-hourglass-split"></i> Generando…</span>`;
  const firma = d.firmada ? `<span class="mo-firma ok"><i class="bi bi-pen-fill"></i> Firmada</span>` : `<span class="mo-firma"><i class="bi bi-file-earmark"></i> Sin firma</span>`;
  return `<button type="button" class="mo-ficha" data-ficha="${esc(d.no_inventario)}" aria-label="Ver ficha técnica del ${esc(d.no_inventario)}"><i class="bi bi-file-earmark-pdf"></i> Ver ficha</button>${firma}`;
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ficha]"); if (!b) return;
  const v = window.open("about:blank", "_blank"); b.disabled = true;
  try {
    const r = await fetch(`/api/ficha/${encodeURIComponent(b.dataset.ficha)}/enlace`, { headers: { Authorization: "Bearer " + localStorage.getItem("token") } });
    const j = await r.json(); if (!j.ok) throw new Error(j.mensaje);
    if (v) v.location = j.url; else location.href = j.url;
  } catch (err) { if (v) v.close(); alert("No se pudo abrir la ficha: " + (err.message || "intenta de nuevo")); }
  finally { b.disabled = false; }
});