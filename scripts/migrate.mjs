import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const directory = path.resolve("db/migrations");

try {
  await sql`create table if not exists schema_migrations(
    version text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`;
  const files = (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const file of files) {
    const source = await readFile(path.join(directory, file), "utf8");
    const checksum = createHash("sha256").update(source).digest("hex");
    const applied =
      await sql`select checksum from schema_migrations where version=${file}`;
    if (applied.length) {
      if (applied[0].checksum !== checksum)
        throw new Error(`Migration ${file} changed after it was applied`);
      continue;
    }
    await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(18420260804)`;
      const afterLock =
        await transaction`select checksum from schema_migrations where version=${file}`;
      if (afterLock.length) {
        if (afterLock[0].checksum !== checksum)
          throw new Error(`Migration ${file} changed after it was applied`);
        return;
      }
      const statements = source
        .split(/;\s*(?:\n|$)/)
        .map((value) => value.trim())
        .filter(Boolean);
      for (const statement of statements) await transaction.unsafe(statement);
      await transaction`insert into schema_migrations(version,checksum) values(${file},${checksum})`;
    });
    console.log(`Applied migration ${file}`);
  }
  console.log("Database migrations are up to date");
} finally {
  await sql.end();
}
