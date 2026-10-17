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
    // A smaller size of the same Telegram photo (~320px wide), for website thumbnails.
    posterThumbFileId: text("poster_thumb_file_id"),

    posterStatus: text("poster_status", { enum: ["pending", "ready", "failed"] })
      .notNull()
      .default("pending"),

    // Where the bot last showed this listing's preview, so edits can update it in place.
    previewChatId: integer("preview_chat_id"),
    previewTextMessageId: integer("preview_text_message_id"),
    previewPhotoMessageId: integer("preview_photo_message_id"),

    extractedBy: text("extracted_by", { enum: ["openai", "workers-ai", "rules", "manual"] }),
    sourceText: text("source_text"), // original message, cleaned (no phone numbers), kept for re-processing
    createdBy: integer("created_by"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
    publishedAt: integer("published_at"),
  },
  (t) => [index("hackathons_status_deadline").on(t.status, t.deadlineAt)],
);

/**
 * Messages an admin sends in quick succession are merged into one batch (e.g. a link, then its description),
 * which becomes one draft listing.
 */
export const inboxBatches = sqliteTable(
  "inbox_batches",
  {
    id: text("id").primaryKey(),
    adminId: integer("admin_id").notNull(),
    chatId: integer("chat_id").notNull(),
    status: text("status", { enum: ["collecting", "processing", "done", "rejected", "failed"] })
      .notNull()
      .default("collecting"),
    text: text("text").notNull().default(""),
    photoFileId: text("photo_file_id"),
    photoThumbFileId: text("photo_thumb_file_id"),
    ackMessageId: integer("ack_message_id"),
    force: integer("force", { mode: "boolean" }).notNull().default(false), // "make it a listing anyway"
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    hackathonId: text("hackathon_id"),
    firstMessageAt: integer("first_message_at").notNull(),
    lastMessageAt: integer("last_message_at").notNull(),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    index("inbox_batches_status").on(t.status, t.lastMessageAt),
    index("inbox_batches_admin").on(t.adminId),
  ],
);

/** What the bot is waiting for from an admin, e.g. the new value of a field they chose to edit. */
export const adminState = sqliteTable("admin_state", {
  telegramId: integer("telegram_id").primaryKey(),
  action: text("action", { enum: ["edit_field", "await_image"] }).notNull(),
  hackathonId: text("hackathon_id").notNull(),
  field: text("field"),
  promptMessageId: integer("prompt_message_id"),
  updatedAt: integer("updated_at").notNull().default(now),
});

/** Every OpenAI call, for rate limits (SPEC §4) and the /usage command. */
export const aiCalls = sqliteTable(
  "ai_calls",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminId: integer("admin_id").notNull(),
    model: text("model").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("ai_calls_created").on(t.createdAt), index("ai_calls_admin").on(t.adminId, t.createdAt)],
);

export type AdminRow = typeof admins.$inferSelect;
export type InboxBatchRow = typeof inboxBatches.$inferSelect;
export type AdminStateRow = typeof adminState.$inferSelect;
export type HackathonRow = typeof hackathons.$inferSelect;
export type NewHackathonRow = typeof hackathons.$inferInsert;
