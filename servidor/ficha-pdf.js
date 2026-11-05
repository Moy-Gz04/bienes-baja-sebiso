// Genera la ficha técnica de un bien en PDF (carta horizontal) replicando el formato oficial
// "1. Formato Ficha Técnica de Bien Mueble" (ver generar_fichas.py): dos tablas guinda, memoria fotográfica y firmas.
const PDFDocument = require("pdfkit");

const GUINDA = "#691C32";
const X0 = 50.5, X1 = 790.7;
// columnas de la primera tabla (en puntos, medidas del PDF oficial)
const C1 = [50.5, 130.6, 198.1, 227.6, 295.5, 370.3, 421.7, 478.2, 526.7, 599.4, 687.5, 738, 790.7];
const T1 = ["NUMERO DE INVENTARIO", "DESCRIPCION", "MARCA", "MODELO", "SERIE", "MATERIAL", "COLOR", "AGRUPADOS",
  "ORGANO SUPERIOR RESGUARDANTE ACTUAL", "UNIDAD PRESUPUESTAL RESGUARDANTE ACTUAL", "ADSCRIPCION", "UBICACIÓN"];
const T2 = ["FECHA ADQUISICION", "MONTO ORIGINAL", "COG", "CVE ARMONIZADA", "RESGUARDO", "ESTATUS CONTABLE"];
const FIRMAS = [
  ["ELABORÓ", "C. Victor Hugo Perez Guati Rojo", "DIRECTOR DE RECURSOS MATERIALES DE LA COORDINACIÓN ADMINISTRATIVA DE LA SECRETARÍA DE BIENESTAR E INCLUSIÓN SOCIAL"],
  ["VALIDÓ", "Mtra. Rosa Leticia Muñoz Chávez", "COORDINADORA ADMINISTRATIVA DE LA COORDINACIÓN ADMINISTRATIVA DE LA SECRETARÍA DE BIENESTAR E INCLUSIÓN SOCIAL"],
  ["V.O. B.O.", "Mtro. Ricardo Gomez Moreno", "SECRETARIO DE BIENESTAR E INCLUSIÓN SOCIAL"],
];

const txt = (v) => (v === null || v === undefined || !String(v).trim()) ? "-" : String(v).trim();
const fechaMx = (f) => f ? String(f).slice(0, 10).split("-").reverse().join("/") : "";
const pesos = (n) => Number(n) ? "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

// texto centrado (horizontal y vertical) en una celda; achica la letra si no cabe
function celda(doc, texto, x, y, w, h, { fuente = "Helvetica", tam = 7.2, color = "#000" } = {}) {
  let t = tam;
  doc.font(fuente);
  const ancha = (tt) => Math.max(...texto.split(/\s+/).map(p => doc.fontSize(tt).widthOfString(p)));
  while (t > 4 && (ancha(t) > w - 4 || doc.fontSize(t).heightOfString(texto, { width: w - 4, align: "center" }) > h - 2)) t -= 0.3;
  const alto = doc.fontSize(t).heightOfString(texto, { width: w - 4, align: "center" });
  doc.fillColor(color).text(texto, x + 2, y + (h - alto) / 2, { width: w - 4, align: "center", lineGap: 0 });
}

function tabla(doc, cols, titulos, valores, yT, hT, hV) {
  const x0 = cols[0], x1 = cols[cols.length - 1];
  doc.rect(x0, yT, x1 - x0, hT).fill(GUINDA);
  doc.lineWidth(0.6).strokeColor("#000");
  doc.rect(x0, yT, x1 - x0, hT + hV).stroke();
  doc.moveTo(x0, yT + hT).lineTo(x1, yT + hT).stroke();
  for (let i = 0; i < titulos.length; i++) {
    const x = cols[i], w = cols[i + 1] - x;
    if (i) doc.moveTo(x, yT).lineTo(x, yT + hT + hV).stroke();
    celda(doc, titulos[i], x, yT, w, hT, { fuente: "Helvetica-Bold", tam: 5.3, color: "#fff" });
    celda(doc, valores[i], x, yT + hT, w, hV);
  }
}

// bien: fila de bienes con los datos ya combinados; fotos: hasta 3 Buffers JPEG/PNG
function fichaPdf(bien, fotos) {
  return new Promise((ok, mal) => {
    const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 0, info: { Title: `Ficha técnica ${bien.no_inventario}` } });
    const partes = [];
    doc.on("data", (p) => partes.push(p)); doc.on("end", () => ok(Buffer.concat(partes))); doc.on("error", mal);

    // encabezado
    doc.lineWidth(0.6).strokeColor("#000").rect(X0, 54.4, X1 - X0, 26.4).stroke();
    celda(doc, "FICHA TÉCNICA DE BIEN MUEBLE", X0, 54.4, X1 - X0, 26.4, { fuente: "Helvetica-Bold", tam: 7.2 });

    const b = bien;
    tabla(doc, C1, T1, [b.no_inventario, b.descripcion, b.marca, b.modelo, b.serie, b.material, b.color, b.agrupados,
      b.organo_superior, b.unidad_presupuestal, b.adscripcion, b.ubicacion || b.edificio].map(txt), 80.8, 23.9, 47.7);
    tabla(doc, C1.slice(0, 7), T2, [fechaMx(b.fecha_adquisicion), pesos(b.moi), String(b.cog || "").slice(0, 3),
      b.clave_armonizada, b.resguardo, b.estatus_contable].map(txt), 162.4, 15.9, 84.5);

    // memoria fotográfica
    doc.rect(X0, 273, X1 - X0, 11.2).stroke();
    celda(doc, "MEMORIA FOTOGRÁFICA", X0, 273, X1 - X0, 11.2, { fuente: "Helvetica-Bold", tam: 7.2 });
    // cada foto se recorta a un cuadro fijo igual para las tres
    const anchoCaja = (X1 - X0) / 3, yF = 294, hF = 152, wF = Math.min(anchoCaja - 16, 200);
    fotos.slice(0, 3).forEach((f, i) => {
      if (!f) return;
      const xF = X0 + i * anchoCaja + (anchoCaja - wF) / 2;
      try {
        doc.save().rect(xF, yF, wF, hF).clip();
        doc.image(f, xF, yF, { cover: [wF, hF], align: "center", valign: "center" });
        doc.restore();
      } catch (e) { doc.restore(); /* formato no soportado: se deja el hueco */ }
    });

    // firmas
    const yB = 459.5, hB = 77, cortes = [X0, 295.5, 527, X1];
    doc.lineWidth(0.6).strokeColor("#BFBFBF").rect(X0, yB, X1 - X0, hB).stroke();
    FIRMAS.forEach(([titulo, nombre, cargo], k) => {
      const x = cortes[k], w = cortes[k + 1] - x;
      if (k) doc.strokeColor("#BFBFBF").moveTo(x, yB).lineTo(x, yB + hB).stroke();
      doc.font("Helvetica-Bold").fontSize(6).fillColor("#000").text(titulo, x, yB + 3, { width: w, align: "center" });
      doc.strokeColor("#404040").lineWidth(0.6).moveTo(x + w * 0.22, yB + 50).lineTo(x + w * 0.78, yB + 50).stroke();
      doc.font("Helvetica-Bold").fontSize(5.6).text(nombre, x, yB + 52, { width: w, align: "center" });
      doc.font("Helvetica").fontSize(4.6).text(cargo, x + 6, yB + 61, { width: w - 12, align: "center" });
    });
    doc.end();
  });
}

module.exports = { fichaPdf };
