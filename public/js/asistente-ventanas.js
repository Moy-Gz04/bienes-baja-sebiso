// =========================================================
// asistente-ventanas.js
// Todas las ventanas de acciones de WEB-GOB con el asistente, como en los
// demás sistemas. Las páginas siguen abriendo sus ventanas (.modal) igual
// que siempre; este script las toma al aparecer:
//   - Confirmaciones (cerrar sesión, eliminar, generar, enviar…): las
//     pregunta la mascota con los mismos textos y botones; al responder se
//     aprieta el botón original, así que todo hace exactamente lo de antes.
//   - Avisos de un solo botón (éxito, error, atención): los dice la mascota.
//   - Ventanas «cargando…»: la mascota aparece trabajando arriba.
//   - Ventanas con formulario o tablas: la mascota se asoma arriba.
//   - alert() también lo dice la mascota, y confirmarConAsistente() sustituye
//     a confirm() (devuelve una promesa con true/false).
// Con el asistente apagado todo vuelve a las ventanas normales.
// Cárguese después de minisebiso-flotante.js y asistente-extra.js.
// =========================================================
(function () {
  const M = window.MiniSEBISO;
  if (!M || !M.preguntar || window.__asistenteVentanas) return;
  window.__asistenteVentanas = true;

  const apagado = () => !!M.apagado;
  // Quita emojis y espacios de más de los textos de las ventanas
  const limpio = (t) => String(t || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const mascota = (extra = '') => `<div class="minisebiso ms-ventana-mascota ${extra}" aria-hidden="true"><div class="ms-cuerpo"><span class="ms-ojo-mov izq"><span class="ms-ojo"></span></span><span class="ms-ojo-mov der"><span class="ms-ojo"></span></span></div><div class="ms-estrella"></div></div>`;

  const css = document.createElement('style');
  css.textContent = `
    .ms-ventana-mascota{ width:78px; margin:-58px auto 4px; position:relative; z-index:2; pointer-events:none; }
    .ms-ventana-mascota.ms-trabajando-v{ animation:msvTrabajo 1.1s ease-in-out infinite; }
    .ms-ventana-mascota.ms-trabajando-v .ms-ojo-mov{ --dx:4px; --dy:3px; }
    .ms-ventana-con-mascota{ padding-top:44px !important; overflow:visible !important; }
    @keyframes msvTrabajo{ 0%,100%{ transform:translateY(0) rotate(-3deg);} 50%{ transform:translateY(-6px) rotate(3deg);} }
    /* Los estilos globales de botones de estas páginas (style.css) no deben pintar los de la mascota */
    .ms-dlg-overlay .ms-dlg-btn{ margin-top:0; }
    .ms-dlg-overlay button:not(.ms-dlg-btn), .ms-ayuda button, .ms-flotante button{ width:auto; margin-top:0; }
    .ms-dlg-overlay .ms-perso-op:not([aria-checked="true"]):hover{ background:#F6EEDD; color:#4A0A1D; }
    .ms-dlg-overlay .ms-perso-color:hover, .ms-dlg-overlay .ms-perso-cerrar:hover{ background:transparent; }
    .ms-dlg-overlay .ms-dlg-cancelar, .ms-dlg-overlay .ms-dlg-cancelar:hover{ background:#F4EFEA; color:#4A0A1D; }
    .ms-dlg-overlay .ms-dlg-cancelar:hover{ background:#EDE4DB; }
    .ms-dlg-overlay .ms-dlg-ok, .ms-dlg-overlay .ms-dlg-ok:hover{ background:linear-gradient(135deg, #7A1E35, #4A0A1D); color:#fff; }
    .ms-dlg-overlay .ms-dlg-ok.ms-dlg-ok-dorado, .ms-dlg-overlay .ms-dlg-ok.ms-dlg-ok-dorado:hover{ background:linear-gradient(135deg, #D8B866, #9C7A2E); color:#3A0818; }
    .ms-dlg-overlay .ms-dlg-ok.ms-dlg-ok-verde, .ms-dlg-overlay .ms-dlg-ok.ms-dlg-ok-verde:hover{ background:linear-gradient(135deg, #3E9B47, #22692A); color:#fff; }
    .ms-dlg-overlay .ms-dlg-ok:hover{ filter:brightness(1.06); }
    @media (prefers-reduced-motion:reduce){ .ms-ventana-mascota{ animation:none !important; } }`;
  document.head.appendChild(css);

  const tonoDe = (t) => /error|no se pudo|fall|inv[aá]lid|incorrect/i.test(t) ? 'error'
    : /atenci[oó]n|advertencia|selecciona|falta|requerid|obligatori/i.test(t) ? 'aviso'
    : /[eé]xito|correct|listo|generad|guardad|enviad|registrad|actualizad|eliminad/i.test(t) ? 'exito' : '';
  const esCancelar = (b) => /cancelar|^no\b|regresar|volver|cerrar$/i.test(limpio(b.textContent)) || b.classList.contains('btn-secundario');

  /* ---------- Ventanas de la página (.modal) ---------- */
  const enCurso = new WeakSet();
  async function tomar(modal) {
    if (enCurso.has(modal) || apagado()) return;
    // Red de seguridad: si reaparece sola justo después de contestarla, no se vuelve a preguntar
    if (Date.now() - (modal._msRespondida || 0) < 600) { modal.classList.remove('activo', 'active', 'show', 'visible', 'abierto'); modal.style.setProperty('display', 'none', 'important'); return; }
    const caja = modal.querySelector('.modal-spg-contenido, .modal-contenido, .modal-content, .modal-box, .modal-confirmar-contenido') || modal.firstElementChild || modal;
    const campos = [...caja.querySelectorAll('input:not([type=hidden]), select, textarea, table, iframe, canvas, img:not(.ms-ventana-mascota img)')].filter(visible);
    const botones = [...caja.querySelectorAll('button, .btn, a.btn')].filter(b => visible(b) && !b.closest('.ms-ventana-mascota'));

    // Con formulario/tablas, o «cargando» sin botones: la mascota se queda en la ventana
    if (campos.length || !botones.length) {
      if (!caja.querySelector('.ms-ventana-mascota')) {
        // Ventanas «Generar …»: la mascota va dentro del encabezado (el cuerpo tiene su propio scroll)
        const enc = caja.querySelector(':scope > .spg-header, :scope > .modal-header');
        if (enc) enc.insertAdjacentHTML('afterbegin', mascota('en-encabezado'));
        else {
          caja.insertAdjacentHTML('afterbegin', mascota(botones.length ? '' : 'ms-trabajando-v'));
          caja.classList.add('ms-ventana-con-mascota');
        }
      }
      return;
    }

    // Confirmación o aviso: lo pregunta/dice la mascota y luego se aprieta el botón original
    const titulo = limpio(caja.querySelector('h1, h2, h3, h4')?.textContent);
    const textos = [...caja.querySelectorAll('p, [id$="Mensaje"], [id$="mensaje"], .modal-mensaje')].filter(visible).map(p => limpio(p.textContent)).filter(Boolean);
    const cancelar = botones.find(esCancelar);
    const ok = [...botones].reverse().find(b => b !== cancelar) || botones[botones.length - 1];
    const textoOk = limpio(ok.textContent) || 'Aceptar';
    const todo = titulo + ' ' + textos.join(' ') + ' ' + textoOk;
    const soloOk = botones.length === 1 || !cancelar;

    enCurso.add(modal);
    modal.style.setProperty('display', 'none', 'important');
    try {
      const peligro = /elimin|borrar|cerrar sesi/i.test(todo);
      const si = await M.preguntar({
        titulo: soloOk ? ({ exito: '¡Listo!', error: '¡Ups!', aviso: '¡Atención!' }[tonoDe(todo)] || '¡Hola!') : '¡Hola!',
        pregunta: titulo || textos.shift() || '',
        detalle: textos.join(' '),
        btnOk: textoOk,
        btnCancel: cancelar ? limpio(cancelar.textContent) : 'Cancelar',
        iconoOk: /elimin|borrar/i.test(todo) ? 'ti-trash' : /cerrar sesi/i.test(todo) ? 'ti-logout' : soloOk ? 'ti-check' : 'ti-arrow-right',
        soloOk,
        tono: soloOk ? tonoDe(todo) : (peligro ? 'error' : ''),
        estiloOk: !soloOk && !peligro ? 'dorado' : '',
        saludoOk: soloOk ? '¡Va!' : '¡Va!', textoOk: soloOk ? '' : (/cerrar sesi/i.test(todo) ? '¡Hasta pronto!' : 'En eso estoy…'),
      });
      // La ventana original se queda oculta (si la página la vuelve a abrir, se toma otra vez)
      // Algunas páginas la muestran con una clase (.activo con !important): se quita también,
      // y el «none» va con !important; si la página la vuelve a abrir (style.display = 'flex'
      // o agregando la clase) se toma otra vez sin quedar en bucle
      const cerrarDeVerdad = () => {
        modal.classList.remove('activo', 'active', 'show', 'visible', 'abierto');
        modal.style.setProperty('display', 'none', 'important');
      };
      cerrarDeVerdad();
      if (si) ok.click();
      else if (cancelar) cancelar.click();
      if (!si) cerrarDeVerdad();
    } finally {
      modal._msRespondida = Date.now();
      enCurso.delete(modal);
    }
  }
  const abierta = (m) => getComputedStyle(m).display !== 'none' && !enCurso.has(m);
  // Ventanas: las .modal y también las que solo tienen id="modal…" (Anexo C, factura, cargando…),
  // sin contar las piezas internas que también se llaman «modal…» (p. ej. modalAlertaMensaje)
  const esVentana = (m) => !!m.classList && (m.classList.contains('modal') || m.classList.contains('modal-spg')
    || (/^modal/.test(m.id || '') && !(m.parentElement && m.parentElement.closest('[id^="modal"], .modal'))));
  function revisar(m) { if (esVentana(m) && abierta(m)) tomar(m); }
  new MutationObserver(ms => ms.forEach(r => {
    if (r.type === 'attributes') revisar(r.target);
    else r.addedNodes.forEach(n => { if (n.nodeType === 1) { revisar(n); n.querySelectorAll && n.querySelectorAll('.modal, .modal-spg, [id^="modal"]').forEach(revisar); } });
  })).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], subtree: true, childList: true });

  /* ---------- alert() y confirm() ---------- */
  const alertaOriginal = window.alert.bind(window);
  window.alert = function (msg) {
    if (apagado()) return alertaOriginal(msg);
    const t = limpio(msg);
    M.preguntar({ titulo: ({ exito: '¡Listo!', error: '¡Ups!', aviso: '¡Atención!' }[tonoDe(t)] || '¡Hola!'), pregunta: t, soloOk: true, btnOk: 'Entendido', iconoOk: 'ti-check', tono: tonoDe(t), saludoOk: '¡Va!', textoOk: '' });
  };
  window.confirmarConAsistente = function (msg, { btnOk = 'Sí', iconoOk = 'ti-check' } = {}) {
    if (apagado()) return Promise.resolve(window.confirm(msg));
    const peligro = /elimin|borrar/i.test(msg);
    return M.preguntar({
      titulo: '¡Hola!', pregunta: limpio(msg), btnOk: peligro ? 'Sí, eliminar' : btnOk, btnCancel: 'Cancelar',
      iconoOk: peligro ? 'ti-trash' : iconoOk, tono: peligro ? 'error' : '', estiloOk: peligro ? '' : 'dorado',
      saludoOk: '¡Va!', textoOk: 'En eso estoy…',
    });
  };

  /* ---------- Ventanas «Generar …»: marcar en dorado lo que falta por llenar ---------- */
  // Un campo falta si se puede editar y está vacío (o el select sigue en su opción vacía).
  // Se revisa al escribir y cada poco mientras la ventana está abierta, porque la página
  // también llena campos por su cuenta sin avisar.
  function marcarFaltantes() {
    document.querySelectorAll('.modal-spg-contenido').forEach(caja => {
      if (!visible(caja)) return;
      // Que el navegador no ofrezca tarjetas, direcciones ni contraseñas guardadas en estos formularios
      caja.querySelectorAll('input:not([autocomplete])').forEach(c => { c.setAttribute('autocomplete', 'off'); c.setAttribute('data-lpignore', 'true'); });
      caja.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea').forEach(c => {
        // Los opcionales (su texto de ayuda dice «opcional») no se marcan como faltantes
        const editable = !c.readOnly && !c.disabled && !/opcional/i.test(c.placeholder || '') && !c.hasAttribute('data-opcional');
        const vacio = c.tagName === 'SELECT' ? !c.value : !String(c.value || '').trim();
        c.classList.toggle('vg-falta', editable && vacio);
        c.closest('.campo-spg, .grupo-input-spg')?.classList.toggle('vg-falta-label', editable && vacio);
      });
    });
  }
  document.addEventListener('input', e => { if (e.target.closest && e.target.closest('.modal-spg-contenido')) marcarFaltantes(); }, true);
  document.addEventListener('change', e => { if (e.target.closest && e.target.closest('.modal-spg-contenido')) marcarFaltantes(); }, true);
  setInterval(() => { if (document.querySelector('.modal-spg-contenido') && [...document.querySelectorAll('.modal-spg-contenido')].some(visible)) marcarFaltantes(); }, 700);

  /* ---------- Desplegables de las ventanas «Generar …» con diseño propio ----------
     La lista nativa del navegador no se puede decorar: al abrir un <select> de estas
     ventanas se muestra una lista propia (con buscador si es larga). Al elegir se
     escribe en el <select> original y se avisa con «change», así la página hace lo
     mismo de siempre. */
  let lista = null;
  function cerrarLista(devolverFoco = true) {
    if (!lista) return;
    const { panel, sel } = lista;
    panel.remove(); sel.classList.remove('vg-abierto');
    removeEventListener('scroll', lista.reubicar, true); removeEventListener('resize', lista.reubicar);
    lista = null;
    if (devolverFoco) sel.focus();
  }
  function abrirLista(sel) {
    if (lista) { const era = lista.sel; cerrarLista(false); if (era === sel) return; }
    // Opciones sin repetir (algunos catálogos traen la misma opción dos veces)
    const vistos = new Set();
    const ops = [...sel.options].filter(o => !o.hidden && !o.disabled || o.value === '').filter(o => {
      const k = o.value + '|' + o.text.trim(); if (vistos.has(k)) return false; vistos.add(k); return true;
    });
    const panel = document.createElement('div');
    panel.className = 'vg-lista';
    panel.setAttribute('role', 'listbox');
    const conBuscador = ops.length > 8;
    panel.innerHTML = (conBuscador ? '<div class="vg-lista-buscar"><i class="ti ti-search" aria-hidden="true"></i><input type="text" placeholder="Buscar…" aria-label="Buscar opción"></div>' : '')
      + '<div class="vg-lista-ops"></div>';
    const cont = panel.querySelector('.vg-lista-ops');
    let marcada = -1;
    const pintar = (filtro = '') => {
      const f = filtro.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      cont.innerHTML = '';
      ops.forEach(o => {
        const t = o.text.trim();
        if (f && !t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f)) return;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'vg-op' + (o.value === '' ? ' vg-op-vacia' : '') + (o.value === sel.value && o.value !== '' ? ' vg-op-elegida' : '');
        b.setAttribute('role', 'option'); b.dataset.valor = o.value;
        b.innerHTML = `<span>${t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</span>${o.value === sel.value && o.value !== '' ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}`;
        b.addEventListener('mousedown', e => e.preventDefault());
        b.addEventListener('click', () => elegir(o.value));
        cont.appendChild(b);
      });
      if (!cont.children.length) cont.innerHTML = '<div class="vg-op-nada">Sin coincidencias</div>';
      marcada = [...cont.querySelectorAll('.vg-op')].findIndex(x => x.classList.contains('vg-op-elegida'));
      resaltar();
    };
    const resaltar = () => {
      const bs = [...cont.querySelectorAll('.vg-op')];
      bs.forEach((x, i) => x.classList.toggle('vg-op-activa', i === marcada));
      if (bs[marcada]) bs[marcada].scrollIntoView({ block: 'nearest' });
    };
    const elegir = (v) => {
      sel.value = v;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      cerrarLista(); marcarFaltantes();
    };
    const reubicar = () => {
      const r = sel.getBoundingClientRect();
      const abajo = innerHeight - r.bottom - 12, arriba = r.top - 12;
      const alto = Math.min(320, Math.max(abajo, arriba));
      panel.style.left = Math.max(8, r.left) + 'px';
      panel.style.width = r.width + 'px';
      panel.style.maxHeight = alto + 'px';
      if (abajo >= 200 || abajo >= arriba) { panel.style.top = (r.bottom + 6) + 'px'; panel.style.bottom = ''; }
      else { panel.style.bottom = (innerHeight - r.top + 6) + 'px'; panel.style.top = ''; }
    };
    document.body.appendChild(panel);
    sel.classList.add('vg-abierto');
    lista = { panel, sel, reubicar };
    reubicar(); pintar();
    addEventListener('scroll', reubicar, true); addEventListener('resize', reubicar);
    const buscar = panel.querySelector('.vg-lista-buscar input');
    if (buscar) { buscar.addEventListener('input', () => pintar(buscar.value)); setTimeout(() => buscar.focus(), 0); }
    panel.addEventListener('keydown', e => teclas(e));
    lista.teclas = teclas;
    function teclas(e) {
      const bs = [...cont.querySelectorAll('.vg-op')];
      if (e.key === 'ArrowDown') { e.preventDefault(); marcada = Math.min(bs.length - 1, marcada + 1); resaltar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marcada = Math.max(0, marcada - 1); resaltar(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (bs[marcada]) elegir(bs[marcada].dataset.valor); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); cerrarLista(); }
    }
  }
  const esLista = (el) => el && el.tagName === 'SELECT' && !el.disabled && !el.multiple && el.closest('.modal-spg-contenido') && !apagado();
  document.addEventListener('mousedown', e => {
    if (esLista(e.target)) { e.preventDefault(); e.target.focus(); abrirLista(e.target); }
    else if (lista && !lista.panel.contains(e.target)) cerrarLista(false);
  }, true);
  document.addEventListener('keydown', e => {
    if (lista && document.activeElement === lista.sel) { lista.teclas(e); return; }
    if (esLista(e.target) && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); abrirLista(e.target); }
  }, true);
  const cssLista = document.createElement('style');
  cssLista.textContent = `
    .vg-lista{ position:fixed; z-index:14000; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box;
      background:#FFFDF9; border:1px solid #E4D6C8; border-radius:16px; box-shadow:0 18px 40px rgba(42,10,21,.28), 0 0 0 1px rgba(169,130,76,.25);
      font-family:'Montserrat',sans-serif; animation:vgLista .16s ease-out; min-width:180px; }
    @keyframes vgLista{ from{ opacity:0; transform:translateY(-6px) scale(.98);} to{ opacity:1; transform:none; } }
    .vg-lista-buscar{ display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid #EFE4D6; background:#FBF6EE; }
    .vg-lista-buscar i{ color:#A9824C; font-size:16px; }
    .vg-lista-buscar input{ flex:1; border:0 !important; outline:0 !important; background:transparent !important; box-shadow:none !important;
      font:600 .86rem 'Montserrat',sans-serif !important; color:#3D1420 !important; padding:2px 0 !important; min-height:0 !important; margin:0 !important; width:auto !important; }
    .vg-lista-ops{ flex:1 1 auto; min-height:0; overflow-y:auto; padding:6px; display:flex; flex-direction:column; gap:2px; }
    .vg-lista-ops::-webkit-scrollbar{ width:8px; } .vg-lista-ops::-webkit-scrollbar-thumb{ background:#E4D6C8; border-radius:8px; }
    .vg-lista .vg-op{ flex-shrink:0 !important; display:flex !important; align-items:center; justify-content:space-between; gap:10px; width:100% !important; margin:0 !important;
      padding:9px 12px !important; border:0 !important; border-radius:10px !important; background:transparent !important; color:#3D1420 !important;
      font:600 .86rem 'Montserrat',sans-serif !important; text-align:left; cursor:pointer; box-shadow:none !important; transform:none !important; min-height:0 !important; }
    .vg-lista .vg-op:hover, .vg-lista .vg-op.vg-op-activa{ background:#F6EEDD !important; }
    .vg-lista .vg-op.vg-op-elegida{ background:linear-gradient(135deg,#5F2132,#3D1420) !important; color:#fff !important; }
    .vg-lista .vg-op.vg-op-elegida i{ color:#E9C873; }
    .vg-lista .vg-op.vg-op-vacia{ color:#9A8A90 !important; font-weight:500 !important; font-style:italic; }
    .vg-op-nada{ padding:14px; text-align:center; color:#9A8A90; font-size:.84rem; }
    select.vg-abierto{ border-color:#A9824C !important; box-shadow:0 0 0 3px rgba(169,130,76,.22) !important; }
    @media (prefers-reduced-motion:reduce){ .vg-lista{ animation:none; } }`;
  document.head.appendChild(cssLista);

  // Ventanas que ya estaban abiertas al cargar
  document.querySelectorAll('.modal, .modal-spg, [id^="modal"]').forEach(revisar);
})();
