CREATE TABLE IF NOT EXISTS  `role_bullets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_bullets_role_id_idx` ON `role_bullets` (`role_id`);--> statement-breakpoint
CREATE INDEX `role_bullets_type_idx` ON `role_bullets` (`type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `role_bullet_analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bullet_id` integer NOT NULL,
	`revision_number` integer DEFAULT 1 NOT NULL,
	`ai_score` integer NOT NULL,
	`ai_rationale` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bullet_id`) REFERENCES `role_bullets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_bullet_analyses_bullet_id_idx` ON `role_bullet_analyses` (`bullet_id`);--> statement-breakpoint
CREATE INDEX `role_bullet_analyses_revision_idx` ON `role_bullet_analyses` (`bullet_id`,`revision_number`);--> statement-breakpoint
ALTER TABLE `role_alignment_scores` ADD `holistic_rationale` text;