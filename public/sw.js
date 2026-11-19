// Service worker: deja abrir y operar sin internet Resguardos y la confirmación de existencia de Bienes.
// Estáticos: red primero (para recibir actualizaciones) y, si no hay red, la copia guardada.
// Los cambios del usuario NO pasan por aquí: los guardan resguardos.js y bienes.js en IndexedDB.
const CACHE = "rg-offline-v8";
const PRECARGA = ["resguardos.html", "js/resguardos.js", "js/sidebar.js", "js/encabezado-sistemas.js", "js/minisebiso-flotante.js", "js/asistente-extra.js", "js/asistente-ventanas.js",
  "css/resguardos.css", "css/ssidebar.css", "css/encabezado-sistemas.css", "css/minisebiso-flotante.css", "css/asistente-extra.css", "css/personal-up.css", "css/bienes.css", "favicon.ico",
  "bienes.html", "js/bienes.js", "css/fuente.css"];
// fotos y fichas PDF de la API: se guardan al verlas para tenerlas sin red
const FOTO = /^\/api\/(resguardos\/\d+\/foto|foto\/\d+\/\d+|ficha\/\d+\/pdf)$/;
const FICHA = /^\/api\/ficha\/\d+\/pdf$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECARGA.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// La foto o ficha lleva un token que vence: se guarda sin él (queda la versión ?v=)
const llave = (url) => { const u = new URL(url); u.searchParams.delete("t"); return u.href; };
const conTiempo = (req, ms) => new Promise((ok, mal) => { const t = setTimeout(() => mal(new Error("tiempo")), ms); fetch(req).then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); mal(e); }); });
const SIN_FICHA = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px Montserrat,system-ui,sans-serif;padding:24px;color:#611232"><h2>Sin internet</h2><p>Esta ficha técnica todavía no se ha abierto en este equipo. Ábrela cuando haya conexión y quedará guardada para verla sin red.</p></body>`;

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const mismo = url.origin === location.origin;
  if (mismo && url.pathname.startsWith("/api/") && !FOTO.test(url.pathname)) return;   // la API va directo a la red
  const k = FOTO.test(url.pathname) && mismo ? llave(req.url) : req;
  const ficha = mismo && FICHA.test(url.pathname);
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      if (ficha && !url.searchParams.get("t")) throw new Error("sin token");   // pedida sin internet: solo la copia
      const r = await conTiempo(req, ficha ? 60000 : 5000);   // la ficha viene de Drive y tarda
      if (r && (r.ok || r.type === "opaque")) c.put(k, r.clone()).catch(() => {});
      else if (ficha) { const g = await c.match(k); if (g) return g; }
      return r;
    } catch (err) {
      const g = await c.match(k) || (ficha ? null : await c.match(k, { ignoreSearch: true })) || (req.mode === "navigate" && !ficha ? await c.match(/bienes/.test(url.pathname) ? "bienes.html" : "resguardos.html") : null);
      if (g) return g;
      if (ficha) return new Response(SIN_FICHA, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      return new Response("Sin conexión", { status: 503, statusText: "Sin conexión" });
    }
  })());
});
