import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const weightEntries = sqliteTable(
  "weight_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    member: text("member").notNull(),
    weightKg: real("weight_kg").notNull(),
    recordedAt: integer("recorded_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("weight_member_time_idx").on(table.member, table.recordedAt)],
);

export const poopEntries = sqliteTable(
  "poop_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    member: text("member").notNull(),
    occurredAt: integer("occurred_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("poop_member_time_idx").on(table.member, table.occurredAt)],
);

export const reactions = sqliteTable(
  "reactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromMember: text("from_member").notNull(),
    toMember: text("to_member").notNull(),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("reaction_to_time_idx").on(table.toMember, table.createdAt)],
);
