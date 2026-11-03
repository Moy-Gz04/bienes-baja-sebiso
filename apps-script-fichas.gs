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
  return responder_({ ok: true, mensaje: 'Apps Script de fichas activo.', version: 'fichas-2026-11-03' });
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d.clave || d.clave !== props_().getProperty('CLAVE')) return responder_({ ok: false, error: 'Clave incorrecta.' });
    if (d.accion === 'guardar') return responder_(guardar_(d));
    if (d.accion === 'obtener') return responder_(obtener_(d));
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
    var nombre = 'Ficha técnica ' + inv + '.pdf';
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
