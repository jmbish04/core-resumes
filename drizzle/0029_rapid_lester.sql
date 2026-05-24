ALTER TABLE `board_tokens` ADD `company_name` text;--> statement-breakpoint
ALTER TABLE `board_tokens` ADD `company_url` text;--> statement-breakpoint
ALTER TABLE `board_tokens` ADD `email_domain` text;--> statement-breakpoint
ALTER TABLE `board_tokens` ADD `updated_at` integer NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_tokens_is_active_idx` ON `board_tokens` (`is_active`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `board_tokens_email_domain_idx` ON `board_tokens` (`email_domain`);