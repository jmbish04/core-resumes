ALTER TABLE `jobs_postings` ADD `location` text;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `is_recommended` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `recommendation_score` integer;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `recommendation_reason` text;--> statement-breakpoint
ALTER TABLE `jobs_postings` ADD `source_api_company_id` integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `jobs_postings_is_recommended_idx` ON `jobs_postings` (`is_recommended`);