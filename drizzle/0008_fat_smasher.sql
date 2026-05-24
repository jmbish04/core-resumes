CREATE TABLE IF NOT EXISTS  `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`description` text,
	`greenhouse_token` text,
	`color_primary` text,
	`color_accent` text,
	`attributes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `companies_name_idx` ON `companies` (`name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `companies_greenhouse_token_idx` ON `companies` (`greenhouse_token`);