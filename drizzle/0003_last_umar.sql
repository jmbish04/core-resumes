CREATE TABLE IF NOT EXISTS  `health_screenings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`results_json` text NOT NULL,
	`drive_doc_ids_json` text,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
