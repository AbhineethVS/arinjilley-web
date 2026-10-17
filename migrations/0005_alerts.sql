CREATE TABLE `alerts` (
	`key` text PRIMARY KEY NOT NULL,
	`last_sent_at` integer NOT NULL,
	`suppressed` integer DEFAULT 0 NOT NULL
);
