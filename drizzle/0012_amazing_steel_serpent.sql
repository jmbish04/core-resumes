CREATE TABLE IF NOT EXISTS  `career_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`answer` text NOT NULL,
	`source` text NOT NULL,
	`agent` text NOT NULL,
	`category` text NOT NULL,
	`role_id` text,
	`references` text,
	`metadata` text,
	`is_active` integer DEFAULT true NOT NULL,
	`replaced_by_id` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `career_memory_role_id_idx` ON `career_memory` (`role_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `career_memory_category_idx` ON `career_memory` (`category`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `career_memory_active_idx` ON `career_memory` (`is_active`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `career_memory_source_idx` ON `career_memory` (`source`);