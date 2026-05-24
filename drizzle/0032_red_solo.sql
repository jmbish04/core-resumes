ALTER TABLE `api_companies` ADD `is_recommended` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `api_companies` ADD `recommendation_reason` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_companies_recommended_idx` ON `api_companies` (`is_recommended`);