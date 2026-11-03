// Usuarios del sistema en data/usuarios.json (no se sube). Agregar o cambiar usuario:
//   node build.js Usuario Contraseña   y luego   node cargar_db.js   (los sube a Neon)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const d = (...p) => path.join(__dirname, ...p);
const RUTA_USUARIOS = d("data", "usuarios.json");
let cfg = fs.existsSync(RUTA_USUARIOS) ? JSON.parse(fs.readFileSync(RUTA_USUARIOS, "utf8")) : null;
if (!cfg) {
  const ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const password = Array.from({ length: 12 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join("");
  cfg = { secreto: crypto.randomBytes(32).toString("hex"), usuarios: [{ id: 1, usuario: "bienes", password_hash: bcrypt.hashSync(password, 10), area: "Bienes" }] };
  fs.writeFileSync(d("Contraseñas.txt"), `Sistema de Bienes en propuesta de baja\nUsuario: bienes\nContraseña: ${password}\n`);
}
const [usuario, password] = process.argv.slice(2);
if (usuario && password) {
  cfg.usuarios = cfg.usuarios.filter(u => u.usuario !== usuario);
  cfg.usuarios.push({ id: Math.max(0, ...cfg.usuarios.map(u => u.id)) + 1, usuario, password_hash: bcrypt.hashSync(password, 10), area: "Bienes" });
}
fs.writeFileSync(RUTA_USUARIOS, JSON.stringify(cfg, null, 1));
console.log(`${cfg.usuarios.length} usuarios en data/usuarios.json`);
