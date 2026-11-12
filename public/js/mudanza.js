const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const ROT = { frente: "Foto de frente", lado: "Foto de lado", etiqueta: "Foto de la etiqueta" };
let REGISTROS = [];
const fotos = { frente: null, lado: null, etiqueta: null };

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
async function api(ruta, op = {}) {
  const r = await fetch(ruta, { ...op, headers: { Authorization: "Bearer " + localStorage.getItem("token"), ...(op.body ? { "Content-Type": "application/json" } : {}) } });
  if (r.status === 401) { localStorage.removeItem("token"); location.href = "index.html"; throw new Error("sesión"); }
  return r.json();
}
function msg(t, ok) { const m = $("muMsg"); m.textContent = t || ""; m.className = "mu-msg" + (ok ? " ok" : ""); }

function pintarTomas() {
  document.querySelectorAll(".mu-toma").forEach(d => {
    const k = d.dataset.k, b = d.querySelector("button"), f = fotos[k];
    b.classList.toggle("listo", !!f); if (f) b.classList.remove("mal");
    b.innerHTML = f ? `<img src="${f}" alt="${ROT[k]}">` : `<span><i class="bi bi-camera"></i>${ROT[k]}</span>`;
  });
}
document.querySelectorAll(".mu-toma").forEach(d => {
  const inp = d.querySelector("input"), k = d.dataset.k;
  d.querySelector("button").addEventListener("click", () => inp.click());
  inp.addEventListener("change", async () => {
    const f = inp.files[0]; inp.value = ""; if (!f) return;
    try { fotos[k] = await reducir(f); msg(""); } catch (e) { msg("No se pudo leer la foto. Intenta de nuevo."); }
    pintarTomas();
  });
});
pintarTomas();

function limpiar() { $("muForm").reset(); for (const k in fotos) fotos[k] = null; pintarTomas(); }
$("muLimpiar").addEventListener("click", () => { limpiar(); msg(""); });

$("muForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  let falta = false;
  for (const id of ["muInv", "muDesc", "muPersona", "muCargo"]) { const v = !$(id).value.trim(); $(id).classList.toggle("mal", v); falta = falta || v; }
  document.querySelectorAll(".mu-foto").forEach(b => b.classList.remove("mal"));
  const sinFoto = Object.keys(fotos).filter(k => !fotos[k]);
  sinFoto.forEach(k => document.querySelector(`.mu-toma[data-k="${k}"] button`).classList.add("mal"));
  if (falta || sinFoto.length) return msg(falta ? "Completa los datos marcados." : "Faltan fotos: " + sinFoto.join(", ") + ".");
  $("muGuardar").disabled = true; msg("Guardando…");
  try {
    const d = await api("/api/mudanza", { method: "POST", body: JSON.stringify({ no_inventario: $("muInv").value, descripcion: $("muDesc").value, serie: $("muSerie").value || "S/S", persona: $("muPersona").value, cargo: $("muCargo").value, fotos }) });
    if (!d.ok) { msg(d.mensaje || "No se pudo guardar."); return; }
    // persona y cargo se conservan: suelen repetirse en el siguiente bien
    const p = $("muPersona").value, c = $("muCargo").value; limpiar(); $("muPersona").value = p; $("muCargo").value = c;
    msg("Bien guardado.", true); await cargar(); $("muInv").focus();
  } catch (x) { if (x.message !== "sesión") msg("Sin conexión. Intenta de nuevo."); }
  finally { $("muGuardar").disabled = false; }
});
["muInv", "muDesc", "muPersona", "muCargo"].forEach(id => $(id).addEventListener("input", () => $(id).classList.remove("mal")));

function pintar() {
  const q = norm($("muBuscar").value).split(/\s+/).filter(Boolean);
  const lista = REGISTROS.filter(r => { const i = norm([r.no_inventario, r.descripcion, r.serie, r.persona, r.cargo].join(" ")); return q.every(t => i.includes(t)); });
  $("muResumen").innerHTML = `<div><b>${REGISTROS.length}</b>capturados</div><div><b>${new Set(REGISTROS.map(r => norm(r.persona))).size}</b>personas</div>`;
  $("muLista").innerHTML = lista.length ? lista.map(r => `<article class="mu-card">
    <h3>${esc(r.no_inventario)}</h3><p class="d">${esc(r.descripcion)}</p><p>Serie: ${esc(r.serie || "S/S")}</p>
    <p><i class="bi bi-person"></i> ${esc(r.persona)} · ${esc(r.cargo)}</p>
    <div class="mu-fotos">${["frente", "lado", "etiqueta"].map(k => `<img src="${esc(r.fotos[k])}" alt="Foto ${k}" loading="lazy" data-ver="${esc(r.fotos[k])}">`).join("")}</div>
    <div class="mu-pie"><span>${esc(r.quien)} · ${esc(r.cuando)}</span><button type="button" class="mu-borrar" data-id="${r.id}">Borrar</button></div></article>`).join("")
    : `<p class="mu-vacio">${REGISTROS.length ? "Nada coincide con la búsqueda." : "Todavía no hay bienes capturados."}</p>`;
}
$("muBuscar").addEventListener("input", pintar);
$("muLista").addEventListener("click", async (e) => {
  const im = e.target.closest("[data-ver]");
  if (im) { const v = document.createElement("div"); v.className = "mu-visor"; v.innerHTML = `<img src="${esc(im.dataset.ver)}" alt="">`; v.onclick = () => v.remove(); document.body.append(v); return; }
  const b = e.target.closest(".mu-borrar"); if (!b) return;
  if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "¿Seguro? Toca otra vez"; setTimeout(() => { b.dataset.sure = ""; b.textContent = "Borrar"; }, 3000); return; }
  const d = await api("/api/mudanza/" + b.dataset.id, { method: "DELETE" });
  if (d.ok) cargar(); else msg(d.mensaje || "No se pudo borrar.");
});

async function cargar() {
  try {
    const d = await api("/api/mudanza");
    if (!d.ok) { $("muLista").innerHTML = `<p class="mu-vacio">${esc(d.mensaje || "No se pudo cargar.")}</p>`; return; }
    REGISTROS = d.registros; pintar();
  } catch (x) { if (x.message !== "sesión") $("muLista").innerHTML = `<p class="mu-vacio">Sin conexión.</p>`; }
}
cargar();
