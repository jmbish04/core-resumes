CREATE TABLE IF NOT EXISTS `market_company_salaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`company_name` text NOT NULL,
	`job_title` text NOT NULL,
	`seniority` text NOT NULL,
	`p25` integer NOT NULL,
	`median` integer NOT NULL,
	`p75` integer NOT NULL,
	`sample_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `market_salary_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_company_salaries_snapshot_idx` ON `market_company_salaries` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_company_salaries_company_idx` ON `market_company_salaries` (`company_name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_company_salaries_title_idx` ON `market_company_salaries` (`job_title`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_salary_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_timestamp` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_salary_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`role_type` text NOT NULL,
	`metric_key` text NOT NULL,
	`metric_label` text NOT NULL,
	`p25` integer NOT NULL,
	`median` integer NOT NULL,
	`p75` integer NOT NULL,
	`sample_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `market_salary_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_salary_stats_snapshot_idx` ON `market_salary_stats` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_salary_stats_role_idx` ON `market_salary_stats` (`role_type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `market_salary_stats_metric_idx` ON `market_salary_stats` (`metric_key`);