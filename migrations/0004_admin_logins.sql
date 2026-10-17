CREATE TABLE `admin_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`telegram_id` integer,
	`approved_at` integer,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL
);
