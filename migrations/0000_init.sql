CREATE TABLE `admins` (
	`telegram_id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`username` text,
	`added_by` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hackathons` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`organiser` text,
	`summary` text,
	`how_it_works` text DEFAULT '[]' NOT NULL,
	`mode` text DEFAULT 'offline' NOT NULL,
	`city` text,
	`venue` text,
	`deadline_at` integer,
	`deadline_date_only` integer DEFAULT false NOT NULL,
	`start_at` integer,
	`start_date_only` integer DEFAULT false NOT NULL,
	`end_at` integer,
	`end_date_only` integer DEFAULT false NOT NULL,
	`team_min` integer,
	`team_max` integer,
	`eligibility` text,
	`fee_text` text,
	`is_free` integer DEFAULT false NOT NULL,
	`prize_text` text,
	`prize_short` text,
	`themes` text DEFAULT '[]' NOT NULL,
	`register_url` text,
	`more_info_url` text,
	`brochure_url` text,
	`poster_kind` text DEFAULT 'generated' NOT NULL,
	`poster_style` integer DEFAULT 0 NOT NULL,
	`poster_file_id` text,
	`source_text` text,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hackathons_slug_unique` ON `hackathons` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `hackathons_register_url_unique` ON `hackathons` (`register_url`);--> statement-breakpoint
CREATE INDEX `hackathons_status_deadline` ON `hackathons` (`status`,`deadline_at`);