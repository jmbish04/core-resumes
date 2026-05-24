CREATE TABLE IF NOT EXISTS  `scoring_rubrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`criteria` text NOT NULL,
	`score_range_min` integer NOT NULL,
	`score_range_max` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scoring_rubrics_type_idx` ON `scoring_rubrics` (`type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scoring_rubrics_active_idx` ON `scoring_rubrics` (`is_active`);