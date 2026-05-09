CREATE TABLE `role_bullet_pattern_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pattern_id` integer NOT NULL,
	`role_bullet_id` integer NOT NULL,
	FOREIGN KEY (`pattern_id`) REFERENCES `role_bullet_patterns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_bullet_id`) REFERENCES `role_bullets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `role_bullet_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` text NOT NULL,
	`observation` text NOT NULL,
	`recommendation` text NOT NULL,
	`insight` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `role_resume_bullets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` text NOT NULL,
	`potential_resume_bullet` text NOT NULL,
	`source` text NOT NULL,
	`ai_rationale` text NOT NULL,
	`interview_tip` text,
	`category` text NOT NULL,
	`impact` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `role_resume_bullets_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resume_bullet_id` integer NOT NULL,
	`role_bullet_id` integer NOT NULL,
	FOREIGN KEY (`resume_bullet_id`) REFERENCES `role_resume_bullets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_bullet_id`) REFERENCES `role_bullets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_resume_bullets_map_resume_bullet_id_role_bullet_id_unique` ON `role_resume_bullets_map` (`resume_bullet_id`,`role_bullet_id`);--> statement-breakpoint
ALTER TABLE `role_analyses` ADD `future_promotion_path` integer;