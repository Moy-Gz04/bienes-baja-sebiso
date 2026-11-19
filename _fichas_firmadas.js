// Registra en Neon las fichas escaneadas con firma (de _escaneadas_avance.json) para que el Monitor las marque como firmadas.
const fs=require("fs");const {neon}=require("./servidor/node_modules/@neondatabase/serverless");
const sql=neon(fs.readFileSync(".env","utf8").match(/DATABASE_URL=(.*)/)[1].trim());
const esc=Object.entries(JSON.parse(fs.readFileSync("_escaneadas_avance.json")));
(async()=>{await sql`CREATE TABLE IF NOT EXISTS fichas_firmadas (no_inventario TEXT PRIMARY KEY, drive_id TEXT NOT NULL)`;
for(let i=0;i<esc.length;i+=200){const l=esc.slice(i,i+200);
 await sql`INSERT INTO fichas_firmadas SELECT * FROM unnest(${l.map(x=>x[0])}::text[], ${l.map(x=>x[1])}::text[]) ON CONFLICT (no_inventario) DO UPDATE SET drive_id=EXCLUDED.drive_id`;}
const [c]=await sql`SELECT count(*)::int n, count(*) FILTER (WHERE b.pdf_drive_id=f.drive_id)::int vigentes FROM fichas_firmadas f JOIN bienes b USING(no_inventario)`;console.log("firmadas",esc.length,c);})();
