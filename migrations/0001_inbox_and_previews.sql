CREATE TABLE `admin_state` (
	`telegram_id` integer PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`hackathon_id` text NOT NULL,
	`field` text,
	`prompt_message_id` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `inbox_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` integer NOT NULL,
	`chat_id` integer NOT NULL,
	`status` text DEFAULT 'collecting' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`photo_file_id` text,
	`ack_message_id` integer,
	`force` integer DEFAULT false NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`hackathon_id` text,
	`first_message_at` integer NOT NULL,
	`last_message_at` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inbox_batches_status` ON `inbox_batches` (`status`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `inbox_batches_admin` ON `inbox_batches` (`admin_id`);--> statement-breakpoint
ALTER TABLE `hackathons` ADD `poster_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `hackathons` ADD `preview_chat_id` integer;--> statement-breakpoint
ALTER TABLE `hackathons` ADD `preview_text_message_id` integer;--> statement-breakpoint
ALTER TABLE `hackathons` ADD `preview_photo_message_id` integer;--> statement-breakpoint
ALTER TABLE `hackathons` ADD `extracted_by` text;