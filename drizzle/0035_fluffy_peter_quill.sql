CREATE TABLE IF NOT EXISTS `market_sandbox_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer,
	`role_id` text,
	`script_type` text NOT NULL,
	`python_script` text NOT NULL,
	`raw_output` text,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `market_salary_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
