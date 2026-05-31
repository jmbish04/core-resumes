CREATE TABLE IF NOT EXISTS `pipeline_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`pipeline` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer,
	`attempted` integer DEFAULT 0 NOT NULL,
	`succeeded` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`error_summary` text,
	`source_breakdown` text,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pipeline_runs_pipeline_idx` ON `pipeline_runs` (`pipeline`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pipeline_runs_status_idx` ON `pipeline_runs` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `pipeline_runs_started_at_idx` ON `pipeline_runs` (`started_at`);