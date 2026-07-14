export type MemberId = "chicken" | "poopy";

export const members = {
  chicken: {
    id: "chicken" as const,
    name: "鸡包蛋",
    shortName: "鸡包蛋",
    color: "#7457ff",
    pale: "#eee9ff",
    avatar: "/avatar-chicken-egg.webp",
  },
  poopy: {
    id: "poopy" as const,
    name: "拉粑臭",
    shortName: "拉粑臭",
    color: "#ef5b8f",
    pale: "#fff0f6",
    avatar: "/avatar-poopy.webp",
  },
};

type TrackerEnv = {
  DB?: D1Database;
  CHICKEN_TOKEN?: string;
  POOPY_TOKEN?: string;
};

async function getRuntimeEnv() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as TrackerEnv;
}

export async function getRawDatabase() {
  const database = (await getRuntimeEnv()).DB;
  if (!database) {
    throw new Error("数据库暂时没有连接成功，请稍后再试。");
  }
  return database;
}

let schemaPromise: Promise<void> | undefined;

export function ensureTrackerSchema() {
  if (!schemaPromise) {
    schemaPromise = getRawDatabase()
      .then((database) => database.batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS weight_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          member TEXT NOT NULL,
          weight_kg REAL NOT NULL,
          recorded_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS weight_member_time_idx ON weight_entries (member, recorded_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS poop_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          member TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS poop_member_time_idx ON poop_entries (member, occurred_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_member TEXT NOT NULL,
          to_member TEXT NOT NULL,
          kind TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS reaction_to_time_idx ON reactions (to_member, created_at)",
        ),
      ]))
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaPromise = undefined;
        throw error;
      });
  }
  return schemaPromise;
}

export async function authorizeRequest(request: Request): Promise<MemberId | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) return null;

  const runtime = await getRuntimeEnv();
  if (runtime.CHICKEN_TOKEN && token === runtime.CHICKEN_TOKEN) return "chicken";
  if (runtime.POOPY_TOKEN && token === runtime.POOPY_TOKEN) return "poopy";
  return null;
}

export function otherMember(member: MemberId): MemberId {
  return member === "chicken" ? "poopy" : "chicken";
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function isMember(value: string): value is MemberId {
  return value === "chicken" || value === "poopy";
}
