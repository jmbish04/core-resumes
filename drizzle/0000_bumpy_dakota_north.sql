CREATE TABLE IF NOT EXISTS  `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`job_title` text NOT NULL,
	`job_url` text,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text DEFAULT 'USD',
	`status` text DEFAULT 'preparing' NOT NULL,
	`drive_folder_id` text,
	`metadata` text,
	`role_instructions` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`gdoc_id` text NOT NULL,
	`role_id` text NOT NULL,
	`type` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`role_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role_id` text,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`sender` text NOT NULL,
	`raw_content` text NOT NULL,
	`processed_status` text DEFAULT 'pending' NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `global_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `roles_status_idx` ON `roles` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `documents_role_id_idx` ON `documents` (`role_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `messages_thread_id_idx` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `emails_processed_status_idx` ON `emails` (`processed_status`);