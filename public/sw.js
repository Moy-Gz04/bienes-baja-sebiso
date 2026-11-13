// Service worker: deja abrir y operar el apartado Resguardos sin internet.
// Estáticos: red primero (para recibir actualizaciones) y, si no hay red, la copia guardada.
// Los cambios del usuario NO pasan por aquí: los guarda resguardos.js en IndexedDB.
const CACHE = "rg-offline-v1";
const PRECARGA = ["resguardos.html", "js/resguardos.js", "js/sidebar.js", "js/encabezado-sistemas.js", "js/minisebiso-flotante.js", "js/asistente-extra.js", "js/asistente-ventanas.js",
  "css/resguardos.css", "css/ssidebar.css", "css/encabezado-sistemas.css", "css/minisebiso-flotante.css", "css/asistente-extra.css", "css/personal-up.css", "css/bienes.css", "favicon.ico"];
const FOTO = /^\/api\/resguardos\/\d+\/foto$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECARGA.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// La foto lleva un token que vence: se guarda sin él (queda la versión ?v=)
const llave = (url) => { const u = new URL(url); u.searchParams.delete("t"); return u.href; };
const conTiempo = (req, ms) => new Promise((ok, mal) => { const t = setTimeout(() => mal(new Error("tiempo")), ms); fetch(req).then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); mal(e); }); });

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const mismo = url.origin === location.origin;
  if (mismo && url.pathname.startsWith("/api/") && !FOTO.test(url.pathname)) return;   // la API va directo a la red
  const k = FOTO.test(url.pathname) && mismo ? llave(req.url) : req;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await conTiempo(req, 5000);
      if (r && (r.ok || r.type === "opaque")) c.put(k, r.clone()).catch(() => {});
      return r;
    } catch (err) {
      const g = await c.match(k) || await c.match(k, { ignoreSearch: true }) || (req.mode === "navigate" ? await c.match("resguardos.html") : null);
      if (g) return g;
      return new Response("Sin conexión", { status: 503, statusText: "Sin conexión" });
    }
  })());
});
