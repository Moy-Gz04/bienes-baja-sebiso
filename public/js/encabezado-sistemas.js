// =========================================================
// encabezado-sistemas.js
// El mismo encabezado y menú de los demás sistemas (Correspondencia,
// Programas, Contratos) para todas las páginas de WEB-GOB.
// Cada página sigue armando su barra de siempre (js-sid/sidebar_*.js o
// js/sidebar_CP.js); este script toma de ahí los botones del menú y el
// «Cerrar sesión» (con lo que ya hacían) y los pasa al encabezado nuevo:
//   - banda blanca: estrella, «Gobierno del Estado de Hidalgo»,
//     «Secretaría de Bienestar e Inclusión Social», fecha y Cerrar sesión;
//   - banda guinda: «MENÚ» y las pestañas de la página;
//   - el usuario (su área) fijo en la esquina inferior izquierda.
// Cárguese después del script de la barra.
// =========================================================
(function () {
  const BASE = (document.currentScript && document.currentScript.src || '').replace(/js\/encabezado-sistemas\.js.*$/, '');

  const fuente = document.createElement('link');
  fuente.rel = 'stylesheet';
  fuente.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(fuente);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = BASE + 'css/encabezado-sistemas.css?v=6';
  document.head.appendChild(css);

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function armar() {
    const barra = document.querySelector('#sidebar-container .sidebar');
    if (!barra || document.querySelector('.hs-encabezado')) return !!barra;

    const salirViejo = barra.querySelector('.logout-btn');
    const botones = [...barra.querySelectorAll('.sidebar-menu button, .sidebar-menu a')];

    const hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const enc = document.createElement('header');
    enc.className = 'hs-encabezado';
    enc.innerHTML = `
      <div class="hs-banda">
        <div class="hs-marca">
          <img class="hs-logo" src="${BASE}img/logo-hidalgo.png" alt="Estrella del Gobierno del Estado de Hidalgo">
          <div class="hs-marca-texto">
            <div class="hs-gobierno">Gobierno del Estado de Hidalgo</div>
            <div class="hs-secretaria">Secretaría de Bienestar e Inclusión Social</div>
          </div>
        </div>
        <div class="hs-derecha">
          <div class="hs-fecha">${esc(hoy.charAt(0).toUpperCase() + hoy.slice(1))}</div>
          <button type="button" class="hs-salir" id="btnLogout"><i class="ti ti-logout" aria-hidden="true"></i> Cerrar sesión</button>
        </div>
      </div>
      <nav class="hs-menu" aria-label="Menú">
        <span class="hs-menu-label">Menú</span>
        <div class="hs-menu-items"></div>
      </nav>`;

    // Las pestañas hacen exactamente lo mismo que los botones de antes
    const items = enc.querySelector('.hs-menu-items');
    // A dónde lleva cada botón (de su onclick o href), para marcar la pestaña de la página actual
    const destino = (b) => {
      const m = (b.getAttribute('onclick') || '').match(/['"]([^'"]+\.html[^'"]*)['"]/) || [null, b.getAttribute('href')];
      try { return m[1] ? new URL(m[1], location.href).pathname.split('/').pop().toLowerCase().replace(/.html$/, '') : ''; } catch (e) { return ''; }
    };
    // (Netlify publica «UP-06.html» como «up-06»: se compara sin .html y en minúsculas)
    const aqui = location.pathname.split('/').pop().toLowerCase().replace(/.html$/, '');
    const hayActivo = botones.some(b => b.classList.contains('activo') || b.classList.contains('active'));
    botones.forEach(b => {
      const t = (b.querySelector('.menu-btn-texto') || b).textContent.trim().replace(/\s+/g, ' ');
      if (!t) return;
      const p = document.createElement('button');
      p.type = 'button';
      const activo = hayActivo ? (b.classList.contains('activo') || b.classList.contains('active')) : destino(b) === aqui;
      p.className = 'hs-menu-item' + (activo ? ' activo' : '');
      if (activo) p.setAttribute('aria-current', 'page');
      p.textContent = t;
      p.addEventListener('click', () => b.click());
      items.appendChild(p);
    });
    // Páginas fuera del menú (p. ej. Reportes.html): se marca la pestaña que se llama como la página
    if (!items.querySelector('.activo')) {
      const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const nombre = norm(aqui.replace(/\.html.*$/, ''));
      const p = [...items.children].find(x => norm(x.textContent) === nombre);
      if (p) { p.classList.add('activo'); p.setAttribute('aria-current', 'page'); }
    }
    enc.querySelector('.hs-salir').addEventListener('click', () => { if (salirViejo) salirViejo.click(); else if (typeof logout === 'function') logout(); });

    // El segundo encabezado (franja guinda con el título de la página) ya no se muestra:
    // el nombre de la UP pasa al menú, alineado a la derecha
    const franja = document.querySelector('.contenido .topbar');
    const sub = franja && franja.querySelector('.subtitulo');
    if (franja) {
      // (la franja ya está oculta desde el <head>, así que las líneas se separan por sus <br>)
      const lineas = (sub ? sub.innerHTML : '').split(/<br\s*\/?>/i)
        .map(t => { const d = document.createElement('div'); d.innerHTML = t; return d.textContent.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
      let up = lineas[lineas.length - 1] || '';
      if (/^\d{2}\b/.test(up)) up = 'UP ' + up;
      if (up) {
        const et = document.createElement('div');
        et.className = 'hs-menu-up';
        et.title = lineas.join(' · ');
        et.innerHTML = `<span>${esc(up)}</span>`;
        enc.querySelector('.hs-menu').appendChild(et);
      }
      franja.classList.add('hs-oculta');
    }

    document.body.insertBefore(enc, document.body.firstChild);
    barra.classList.add('hs-oculta');
    document.body.classList.add('con-encabezado-sistemas');

    // El usuario (su área) fijo en la esquina inferior izquierda
    let area = '';
    try { area = localStorage.getItem('area') || ''; } catch (e) { /* sin storage */ }
    if (area && !document.querySelector('.hs-usuario')) {
      const yo = document.createElement('div');
      yo.className = 'hs-usuario';
      yo.innerHTML = `<span class="hs-avatar"><i class="ti ti-user" aria-hidden="true"></i></span><span class="hs-usuario-nombre">${esc(area === 'Administracion' ? 'Administración' : area)}</span>`;
      document.body.appendChild(yo);
    }
    return true;
  }

  if (!armar()) {
    const obs = new MutationObserver(() => { if (armar()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => { if (armar()) obs.disconnect(); });
  }
})();
