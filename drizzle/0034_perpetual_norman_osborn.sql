CREATE TABLE IF NOT EXISTS `market_salary_insights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`insight_text` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `market_salary_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
