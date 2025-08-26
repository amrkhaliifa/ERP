import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../..", "powdercoat.db");

export const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

autoMigrate();

function autoMigrate() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  db.exec(sql);
}
