CREATE TABLE IF NOT EXISTS `mock_interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`analysis_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`qa_pairs` text NOT NULL,
	`generated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mock_interviews_role_id_idx` ON `mock_interviews` (`role_id`);--> statement-breakpoint
ALTER TABLE `role_analyses` ADD `the_hook` text;--> statement-breakpoint
ALTER TABLE `role_analyses` ADD `strategic_recommendation` text;--> statement-breakpoint
ALTER TABLE `role_analyses` ADD `counter_positioning` text;