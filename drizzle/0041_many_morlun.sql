CREATE TABLE IF NOT EXISTS `company_segments` (
	`company_name` text PRIMARY KEY NOT NULL,
	`segment` text NOT NULL,
	`classified_at` text NOT NULL,
	`classifier_version` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `company_segments_segment_idx` ON `company_segments` (`segment`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cost_of_living_index` (
	`metro` text PRIMARY KEY NOT NULL,
	`col_index` real NOT NULL,
	`source` text NOT NULL,
	`as_of` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `role_family_taxonomy` (
	`raw_title` text PRIMARY KEY NOT NULL,
	`family` text NOT NULL,
	`level` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `salary_findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` text,
	`mode` text NOT NULL,
	`finding` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `salary_findings_role_id_idx` ON `salary_findings` (`role_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `salary_findings_mode_idx` ON `salary_findings` (`mode`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `salary_agent_queries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` text,
	`mode` text NOT NULL,
	`sql` text NOT NULL,
	`rows_returned` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `career_model_assumptions` (
	`key` text PRIMARY KEY NOT NULL,
	`value` real NOT NULL,
	`rationale` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `roles` ADD `metro` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `roles_metro_idx` ON `roles` (`metro`);