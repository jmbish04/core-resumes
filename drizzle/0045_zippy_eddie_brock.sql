CREATE TABLE IF NOT EXISTS `company_job_board_defs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_api` integer DEFAULT false,
	`is_rss` integer DEFAULT false,
	`is_active` integer DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `company_job_board_mapping` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`board_id` text NOT NULL,
	`board_identifier` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`board_id`) REFERENCES `company_job_board_defs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `company_job_board_mapping_company_idx` ON `company_job_board_mapping` (`company_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `company_job_board_mapping_board_idx` ON `company_job_board_mapping` (`board_id`);--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `is_rejected` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `reject_reason` text;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `is_watching` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `is_detected_change` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `pipeline_source` text;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `company_id` text REFERENCES companies(id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `jobs_postings_pipeline_source_idx` ON `jobs_postings` (`pipeline_source`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `jobs_postings_company_id_idx` ON `jobs_postings` (`company_id`);