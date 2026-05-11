ALTER TABLE `role_analyses` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `role_analyses` ADD `config_notebooklm_prompt` text;--> statement-breakpoint
ALTER TABLE `role_analyses` ADD `config_compensation_baseline` text;--> statement-breakpoint
ALTER TABLE `role_analyses` ADD `config_career_stories` text;--> statement-breakpoint
ALTER TABLE `role_analyses` ADD `used_defaults` integer DEFAULT false;