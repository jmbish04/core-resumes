CREATE TABLE IF NOT EXISTS `api_companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`job_board_token` text NOT NULL,
	`system` text NOT NULL,
	`source` text NOT NULL,
	`timestamp_added` integer NOT NULL,
	`timestamp_inactive` integer,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_companies_token_system_idx` ON `api_companies` (`job_board_token`,`system`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_companies_active_idx` ON `api_companies` (`is_active`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_company_sync_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_timestamp` integer NOT NULL,
	`files_processed` integer DEFAULT 0 NOT NULL,
	`companies_added` integer DEFAULT 0 NOT NULL,
	`companies_deactivated` integer DEFAULT 0 NOT NULL,
	`companies_reactivated` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`error` text
);
