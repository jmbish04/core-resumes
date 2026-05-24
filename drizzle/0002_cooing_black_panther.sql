CREATE TABLE IF NOT EXISTS  `resume_bullets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`impact_metric` text,
	`tags` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`replaced_by` integer,
	`time_revised` integer,
	`time_deleted` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `resume_bullets_active_idx` ON `resume_bullets` (`is_active`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `resume_bullets_category_idx` ON `resume_bullets` (`category`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `resume_bullets_replaced_by_idx` ON `resume_bullets` (`replaced_by`);