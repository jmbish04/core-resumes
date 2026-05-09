CREATE TABLE IF NOT EXISTS  `job_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`job_url` text NOT NULL,
	`error_message` text NOT NULL,
	`created_at` integer NOT NULL
);
