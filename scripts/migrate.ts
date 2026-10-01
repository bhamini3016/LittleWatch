import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL before running migrations.");
  const db = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const migration = await readFile(resolve(process.cwd(), "migrations/001_initial.sql"), "utf8");
    const statements = migration.split(";").map(statement => statement.trim()).filter(Boolean);
    for (const statement of statements) await db.unsafe(statement);
    console.log("Database schema is ready.");
  } finally { await db.end(); }
}
main().catch(error => { console.error("Migration failed:", error); process.exitCode = 1; });
