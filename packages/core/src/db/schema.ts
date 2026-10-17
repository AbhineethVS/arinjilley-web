import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

/** People allowed to use the bot and the admin page. The owner comes from OWNER_TELEGRAM_ID, not this table. */
export const admins = sqliteTable("admins", {
  telegramId: integer("telegram_id").primaryKey(),
  name: text("name"),
  username: text("username"),
  addedBy: integer("added_by"),
  createdAt: integer("created_at").notNull().default(now),
});

/** Hackathon listings. Dates are epoch ms; *_date_only = 1 means only the day is known. */
export const hackathons = sqliteTable(
  "hackathons",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    status: text("status", { enum: ["draft", "live", "discarded"] })
      .notNull()
      .default("draft"),

    title: text("title").notNull(),
    organiser: text("organiser"),
    summary: text("summary"),
    howItWorks: text("how_it_works", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),

    mode: text("mode", { enum: ["online", "offline", "hybrid"] })
      .notNull()
      .default("offline"),
    city: text("city"),
    venue: text("venue"),

    deadlineAt: integer("deadline_at"),
    deadlineDateOnly: integer("deadline_date_only", { mode: "boolean" }).notNull().default(false),
    startAt: integer("start_at"),
    startDateOnly: integer("start_date_only", { mode: "boolean" }).notNull().default(false),
    endAt: integer("end_at"),
    endDateOnly: integer("end_date_only", { mode: "boolean" }).notNull().default(false),

    teamMin: integer("team_min"),
    teamMax: integer("team_max"),
    eligibility: text("eligibility"),
    feeText: text("fee_text"),
    isFree: integer("is_free", { mode: "boolean" }).notNull().default(false),
    prizeText: text("prize_text"),
    prizeShort: text("prize_short"),
    themes: text("themes", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),

    // Unique so the same hackathon (same registration link) is never listed twice. NULLs are allowed for drafts.
    registerUrl: text("register_url").unique(),
    moreInfoUrl: text("more_info_url"),
    brochureUrl: text("brochure_url"),

    posterKind: text("poster_kind", { enum: ["generated", "custom", "organiser"] })
      .notNull()
      .default("generated"),
    posterStyle: integer("poster_style").notNull().default(0),
    posterFileId: text("poster_file_id"),

    sourceText: text("source_text"), // original message, cleaned (no phone numbers), kept for re-processing
    createdBy: integer("created_by"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
    publishedAt: integer("published_at"),
  },
  (t) => [index("hackathons_status_deadline").on(t.status, t.deadlineAt)],
);

export type AdminRow = typeof admins.$inferSelect;
export type HackathonRow = typeof hackathons.$inferSelect;
export type NewHackathonRow = typeof hackathons.$inferInsert;
