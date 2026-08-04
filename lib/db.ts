import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!client) client = postgres(process.env.DATABASE_URL, { max: 5 });
  return client;
}
