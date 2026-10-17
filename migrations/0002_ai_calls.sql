CREATE TABLE `ai_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_id` integer NOT NULL,
	`model` text NOT NULL,
	`ok` integer NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_calls_created` ON `ai_calls` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_calls_admin` ON `ai_calls` (`admin_id`,`created_at`);