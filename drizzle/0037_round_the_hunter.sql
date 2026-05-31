CREATE TABLE IF NOT EXISTS `sync_run_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_stats_id` integer,
	`event_type` text NOT NULL,
	`step_number` integer,
	`status` text NOT NULL,
	`message` text,
	`current` integer,
	`total` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sync_stats_id`) REFERENCES `api_company_sync_stats`(`id`) ON UPDATE no action ON DELETE no action
);
