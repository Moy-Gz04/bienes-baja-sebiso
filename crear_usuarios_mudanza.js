// Crea (o regenera la contraseña de) un usuario de rol "mudanza" por unidad presupuestal.
// Cada uno solo entra a Inventario - Mudanza y solo ve los registros de su unidad.
// Uso: node crear_usuarios_mudanza.js   → imprime usuario/contraseña y los anota en Contraseñas.txt y data/usuarios.json
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("./servidor/node_modules/bcryptjs");
const sql = neon(fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/DATABASE_URL=(.*)/)[1].trim());

const UP = { "01": "Secretaría de Bienestar e Inclusión Social", "04": "Dirección General de Fomento Artesanal", "05": "Subsecretaría de Inclusión y Desarrollo",
  "06": "Dirección General de Operación y Logística de Programas", "07": "Dirección General de Atención al Migrante", "08": "Dirección General de Asistencia, Atención y Protección",
  "12": "Dirección General de Prospectiva Planeación y Evaluación de los Programas Sociales", "13": "Subsecretaría de Participación Social y Fomento Artesanal",
  "14": "Dirección General de Inclusión para las Personas con Discapacidad", "15": "Subsecretaría de Desarrollo Social y Humano", "16": "Dirección General de Servidores del Pueblo" };
const clave = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; return Array.from(crypto.randomBytes(8), b => a[b % a.length]).join(""); };

(async () => {
  await sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS unidad TEXT`;
  const arch = path.join(__dirname, "data", "usuarios.json"), datos = JSON.parse(fs.readFileSync(arch, "utf8"));
  let texto = "\nInventario - Mudanza (un usuario por unidad presupuestal; solo ven su unidad)\n";
  for (const [up, nombre] of Object.entries(UP)) {
    const usuario = `mudanza_up${up}`, password = clave(), hash = bcrypt.hashSync(password, 10);
    await sql`INSERT INTO usuarios (usuario, password_hash, area, rol, unidad) VALUES (${usuario}, ${hash}, 'Bienes', 'mudanza', ${up})
      ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash, area = 'Bienes', rol = 'mudanza', unidad = EXCLUDED.unidad`;
    const u = datos.usuarios.find(x => x.usuario === usuario), nuevo = { usuario, password_hash: hash, area: "Bienes", rol: "mudanza", unidad: up };
    if (u) Object.assign(u, nuevo); else datos.usuarios.push(nuevo);
    texto += `${usuario} / ${password}  (UP ${up} · ${nombre})\n`;
  }
  fs.writeFileSync(arch, JSON.stringify(datos, null, 2));
  fs.appendFileSync(path.join(__dirname, "Contraseñas.txt"), texto);
  console.log(texto);
})().catch(e => { console.error(e); process.exit(1); });
