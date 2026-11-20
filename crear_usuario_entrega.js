// Crea (o regenera la contraseña de) el usuario "Entregas", rol "entrega": solo consulta bienes, ve su ficha y confirma su existencia.
// Uso: node crear_usuario_existencia.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { neon } = require("./servidor/node_modules/@neondatabase/serverless");
const bcrypt = require("./servidor/node_modules/bcryptjs");
const sql = neon(fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/DATABASE_URL=(.*)/)[1].trim());
const clave = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; return Array.from(crypto.randomBytes(10), b => a[b % a.length]).join(""); };

(async () => {
  const usuario = "Entregas", password = clave(), hash = bcrypt.hashSync(password, 10);
  await sql`INSERT INTO usuarios (usuario, password_hash, area, rol) VALUES (${usuario}, ${hash}, 'Bienes', 'entrega')
    ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash, area = 'Bienes', rol = 'entrega', unidad = NULL`;
  const arch = path.join(__dirname, "data", "usuarios.json"), datos = JSON.parse(fs.readFileSync(arch, "utf8"));
  const nuevo = { usuario, password_hash: hash, area: "Bienes", rol: "entrega" }, u = datos.usuarios.find(x => x.usuario === usuario);
  if (u) { Object.assign(u, nuevo); delete u.unidad; } else datos.usuarios.push(nuevo);
  fs.writeFileSync(arch, JSON.stringify(datos, null, 2));
  const texto = `\nEntrega de bienes (pistola y buscador)\n${usuario} / ${password}\n`;
  fs.appendFileSync(path.join(__dirname, "Contraseñas.txt"), texto);
  console.log(texto);
})().catch(e => { console.error(e); process.exit(1); });
