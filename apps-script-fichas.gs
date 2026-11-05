/**
 * Apps Script del Sistema de Bienes en propuesta de baja (SEBISO).
 * Guarda el PDF de la ficha técnica de cada bien en una carpeta de Drive y lo
 * registra en la hoja "Fichas" de la hoja de cálculo donde vive este script.
 *
 * Hoja "Fichas":  No. inventario | Archivo | ID Drive | Enlace | Origen | Actualizado
 * Un número de inventario = una fila: si se vuelve a subir, se reemplaza el PDF
 * (el anterior va a la papelera) y se actualiza la misma fila. No hay repetidos.
 *
 * Instalación:
 *  1. Crea una hoja de cálculo nueva ("Fichas técnicas - Bienes en baja") y abre
 *     Extensiones > Apps Script. Pega este código y guarda.
 *  2. Ejecuta una vez la función `instalar` (autoriza los permisos). Usa la carpeta
 *     CARPETA_ID, crea la hoja "Fichas" y la clave secreta; en el registro (Ver > Registros)
 *     aparecen la carpeta y la CLAVE.
 *  3. Implementar > Nueva implementación > Tipo: Aplicación web.
 *     Ejecutar como: Yo. Quién tiene acceso: Cualquier usuario.
 *     Copia la URL ".../exec".
 *  4. En el proyecto, en .env:  APPS_SCRIPT_FICHAS_URL=<url>  y  APPS_SCRIPT_FICHAS_CLAVE=<clave>
 * Para cambios posteriores: Implementar > Administrar implementaciones > (lápiz) >
 * Versión: "Nueva versión". Así la URL no cambia.
 *
 * Los PDF quedan PRIVADOS en Drive. El sistema los pide con la acción "obtener"
 * (con la clave) y se los entrega al usuario ya autenticado.
 */

var CARPETA_ID = '1oy4uyo7cy2CofAVVe8PGQP-ewB9vGAn3';
var HOJA = 'Fichas';
var ENCABEZADOS = ['No. inventario', 'Archivo', 'ID Drive', 'Enlace', 'Origen', 'Actualizado'];

function props_() { return PropertiesService.getScriptProperties(); }

function instalar() {
  var p = props_();
  if (!p.getProperty('CLAVE')) {
    p.setProperty('CLAVE', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('Carpeta: ' + DriveApp.getFolderById(CARPETA_ID).getName());   // comprueba el acceso a la carpeta
  hoja_();
  Logger.log('CLAVE: ' + p.getProperty('CLAVE'));
}

function hoja_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var h = libro.getSheetByName(HOJA) || libro.insertSheet(HOJA);
  if (h.getLastRow() === 0) {
    h.appendRow(ENCABEZADOS);
    h.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold').setBackground('#5F2132').setFontColor('#ffffff');
    h.setFrozenRows(1);
    h.getRange('A:A').setNumberFormat('@');   // el número de inventario como texto (no pierde ceros)
  }
  return h;
}

function responder_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return responder_({ ok: true, mensaje: 'Apps Script de fichas activo.', version: 'fichas-paralelo-2026-11-05' });
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d.clave || d.clave !== props_().getProperty('CLAVE')) return responder_({ ok: false, error: 'Clave incorrecta.' });
    if (d.accion === 'guardar') return responder_(guardar_(d));
    if (d.accion === 'guardarVarios') return responder_(guardarVarios_(d));
    if (d.accion === 'obtener') return responder_(obtener_(d));
    if (d.accion === 'guardarFotos') return responder_(guardarFotos_(d));
    if (d.accion === 'guardarCarpeta') return responder_(guardarCarpeta_(d));
    if (d.accion === 'renombrarFichas') return responder_(renombrarFichas_());
    if (d.accion === 'listar') return responder_(listar_());
    return responder_({ ok: false, error: 'Acción no reconocida: ' + d.accion });
  } catch (err) {
    return responder_({ ok: false, error: String(err) });
  }
}

/** Fila (1-based) del inventario en la hoja, o 0 si no está. */
function filaDe_(h, inv) {
  var n = h.getLastRow();
  if (n < 2) return 0;
  var valores = h.getRange(2, 1, n - 1, 1).getDisplayValues();
  for (var i = 0; i < valores.length; i++) if (String(valores[i][0]).trim() === inv) return i + 2;
  return 0;
}

/** { no_inventario, pdf_base64, origen? } -> guarda o reemplaza el PDF de ese bien. */
function guardar_(d) {
  var inv = String(d.no_inventario || '').trim();
  if (!/^\d+$/.test(inv)) return { ok: false, error: 'Número de inventario no válido.' };
  if (!d.pdf_base64) return { ok: false, error: 'Falta el PDF.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var h = hoja_();
    var carpeta = DriveApp.getFolderById(CARPETA_ID);
    var nombre = 'FICHA_' + inv + '.pdf';
    var archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(d.pdf_base64), 'application/pdf', nombre));
    var fila = filaDe_(h, inv);
    if (fila) {
      var anterior = h.getRange(fila, 3).getValue();
      if (anterior) { try { DriveApp.getFileById(anterior).setTrashed(true); } catch (x) { /* ya no existía */ } }
    } else {
      fila = h.getLastRow() + 1;
    }
    h.getRange(fila, 1, 1, ENCABEZADOS.length).setValues([[inv, nombre, archivo.getId(), archivo.getUrl(), d.origen || '', new Date()]]);
    return { ok: true, no_inventario: inv, id: archivo.getId(), url: archivo.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

/** { fichas: [{ no_inventario, pdf_base64, origen }] } -> guarda un lote.
 *  Los PDF se crean SIN candado (varias subidas a la vez); solo la escritura en la hoja usa el candado, unos segundos. */
function guardarVarios_(d) {
  var carpeta = DriveApp.getFolderById(CARPETA_ID), ahora = new Date();
  var hechos = [], resultados = [];
  (d.fichas || []).forEach(function (f) {
    var inv = String(f.no_inventario || '').trim();
    try {
      if (!/^\d+$/.test(inv) || !f.pdf_base64) throw new Error('Datos incompletos');
      var nombre = 'FICHA_' + inv + '.pdf';
      var archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(f.pdf_base64), 'application/pdf', nombre));
      hechos.push({ inv: inv, fila: [inv, nombre, archivo.getId(), archivo.getUrl(), f.origen || '', ahora] });
      resultados.push({ no_inventario: inv, ok: true, id: archivo.getId() });
    } catch (err) {
      resultados.push({ no_inventario: inv, ok: false, error: String(err) });
    }
  });
  if (!hechos.length) return { ok: true, resultados: resultados };
  var anteriores = [], lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var h = hoja_(), n = h.getLastRow();
    var filas = n < 2 ? [] : h.getRange(2, 1, n - 1, ENCABEZADOS.length).getValues();
    var indice = {};
    for (var i = 0; i < filas.length; i++) indice[String(filas[i][0]).trim()] = i;
    hechos.forEach(function (x) {
      if (indice.hasOwnProperty(x.inv)) { anteriores.push(filas[indice[x.inv]][2]); filas[indice[x.inv]] = x.fila; }
      else { indice[x.inv] = filas.length; filas.push(x.fila); }
    });
    h.getRange(2, 1, filas.length, ENCABEZADOS.length).setValues(filas);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  anteriores.forEach(function (id) { if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (x) { } } });
  return { ok: true, version: 'fichas-paralelo', resultados: resultados };
}

/** { no_inventario } -> el PDF en base64, para que el sistema lo muestre sin hacer público el archivo. */
function obtener_(d) {
  var h = hoja_();
  var fila = filaDe_(h, String(d.no_inventario || '').trim());
  if (!fila) return { ok: false, error: 'Ese bien no tiene ficha guardada.' };
  var archivo = DriveApp.getFileById(h.getRange(fila, 3).getValue());
  return { ok: true, nombre: archivo.getName(), pdf_base64: Utilities.base64Encode(archivo.getBlob().getBytes()) };
}

/** Lista lo que hay en la hoja (para revisar qué falta subir). */
function listar_() {
  var h = hoja_();
  var n = h.getLastRow();
  var filas = n < 2 ? [] : h.getRange(2, 1, n - 1, 4).getDisplayValues();
  return { ok: true, fichas: filas.map(function (f) { return { no_inventario: f[0], id: f[2], url: f[3] }; }) };
}

/** { fotos: [{ nombre, jpg_base64 }] } -> guarda fotos en la subcarpeta "Fotos" (visibles con el enlace).
 *  Sin candado y sin buscar repetidos: así varias subidas corren al mismo tiempo. */
function guardarFotos_(d) {
  var p = props_(), id = p.getProperty('FOTOS_ID'), carpeta = null;
  if (id) { try { carpeta = DriveApp.getFolderById(id); } catch (x) { carpeta = null; } }
  if (!carpeta) {
    var raiz = DriveApp.getFolderById(CARPETA_ID), it = raiz.getFoldersByName('Fotos');
    carpeta = it.hasNext() ? it.next() : raiz.createFolder('Fotos');
    p.setProperty('FOTOS_ID', carpeta.getId());
  }
  return { ok: true, version: 'fotos-rapido', resultados: (d.fotos || []).map(function (f) {
    try {
      if (!/^[a-f0-9]{24}\.jpg$/.test(f.nombre || '') || !f.jpg_base64) throw new Error('Datos incompletos');
      var archivo = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(f.jpg_base64), 'image/jpeg', f.nombre));
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { nombre: f.nombre, ok: true, id: archivo.getId() };
    } catch (err) { return { nombre: f.nombre, ok: false, error: String(err) }; }
  }) };
}

/** Renombra todas las fichas ya guardadas a FICHA_<No. inventario>.pdf (archivo en Drive y columna "Archivo"). */
function renombrarFichas_() {
  var h = hoja_(), n = h.getLastRow();
  if (n < 2) return { ok: true, renombradas: 0 };
  var filas = h.getRange(2, 1, n - 1, 3).getValues(), hechas = 0, errores = 0, t0 = Date.now(), faltan = false;
  for (var i = 0; i < filas.length; i++) {
    if (Date.now() - t0 > 240000) { faltan = true; break; }   // corta antes del límite de 6 min; se vuelve a llamar
    var nombre = 'FICHA_' + String(filas[i][0]).trim() + '.pdf';
    if (filas[i][1] === nombre) continue;
    try { DriveApp.getFileById(filas[i][2]).setName(nombre); filas[i][1] = nombre; hechas++; } catch (x) { errores++; }
  }
  h.getRange(2, 1, filas.length, 3).setValues(filas);
  return { ok: true, renombradas: hechas, errores: errores, faltan: faltan };
}

/** { inventario, archivos: [{ nombre, mime, base64 }] } -> crea (o reemplaza) la carpeta <inventario>
 *  dentro de "Fichas por inventario" con sus imágenes y su ficha. */
function guardarCarpeta_(d) {
  var inv = String(d.inventario || '').trim();
  if (!/^\d+$/.test(inv)) return { ok: false, error: 'Número de inventario no válido.' };
  var p = props_(), id = p.getProperty('CARPETAS_ID'), raiz = null;
  if (id) { try { raiz = DriveApp.getFolderById(id); } catch (x) { raiz = null; } }
  if (!raiz) {
    var base = DriveApp.getFolderById(CARPETA_ID), it = base.getFoldersByName('Fichas por inventario');
    raiz = it.hasNext() ? it.next() : base.createFolder('Fichas por inventario');
    p.setProperty('CARPETAS_ID', raiz.getId());
  }
  var ya = raiz.getFoldersByName(inv);
  while (ya.hasNext()) ya.next().setTrashed(true);
  var carpeta = raiz.createFolder(inv);
  (d.archivos || []).forEach(function (a) {
    carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(a.base64), a.mime || 'application/octet-stream', a.nombre));
  });
  return { ok: true, carpeta_id: carpeta.getId(), version: 'carpetas-2026-11-05' };
}
