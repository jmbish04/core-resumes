CREATE TABLE IF NOT EXISTS  `role_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`hire_score` integer NOT NULL,
	`hire_rationale` text NOT NULL,
	`compensation_score` integer NOT NULL,
	`compensation_rationale` text NOT NULL,
	`analyzed_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_analyses_role_id_idx` ON `role_analyses` (`role_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `role_alignment_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`role_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`score` integer NOT NULL,
	`rationale` text NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `role_analyses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alignment_scores_analysis_id_idx` ON `role_alignment_scores` (`analysis_id`);--> statement-breakpoint
CREATE INDEX `alignment_scores_role_id_idx` ON `role_alignment_scores` (`role_id`);--> statement-breakpoint
CREATE INDEX `alignment_scores_type_idx` ON `role_alignment_scores` (`type`);--> statement-breakpoint
ALTER TABLE `messages` ADD `parts` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `format` text;