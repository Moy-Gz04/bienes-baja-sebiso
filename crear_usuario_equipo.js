// Crea (o regenera la contraseña de) el usuario "Equipo", rol "resguardos": solo entra al apartado Resguardos.
// Uso: node crear_usuario_equipo.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { neon } = require("./servidor/node_modules/@neondatabase/serverless");
const bcrypt = require("./servidor/node_modules/bcryptjs");
const sql = neon(fs.readFileSync(path.join(__dirname, ".env"), "utf8").match(/DATABASE_URL=(.*)/)[1].trim());
const clave = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; return Array.from(crypto.randomBytes(10), b => a[b % a.length]).join(""); };

(async () => {
  const usuario = "Equipo", password = clave(), hash = bcrypt.hashSync(password, 10);
  await sql`INSERT INTO usuarios (usuario, password_hash, area, rol) VALUES (${usuario}, ${hash}, 'Bienes', 'resguardos')
    ON CONFLICT (usuario) DO UPDATE SET password_hash = EXCLUDED.password_hash, area = 'Bienes', rol = 'resguardos', unidad = NULL`;
  const arch = path.join(__dirname, "data", "usuarios.json"), datos = JSON.parse(fs.readFileSync(arch, "utf8"));
  const nuevo = { usuario, password_hash: hash, area: "Bienes", rol: "resguardos" }, u = datos.usuarios.find(x => x.usuario === usuario);
  if (u) { Object.assign(u, nuevo); delete u.unidad; } else datos.usuarios.push(nuevo);
  fs.writeFileSync(arch, JSON.stringify(datos, null, 2));
  const texto = `\nResguardos (solo ve el apartado Resguardos)\n${usuario} / ${password}\n`;
  fs.appendFileSync(path.join(__dirname, "Contraseñas.txt"), texto);
  console.log(texto);
})().catch(e => { console.error(e); process.exit(1); });
