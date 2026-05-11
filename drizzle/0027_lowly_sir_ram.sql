CREATE TABLE `statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`group` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`requires_notes_prompt` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_status_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` text NOT NULL,
	`previous_status` text,
	`new_status` text NOT NULL,
	`trigger` text DEFAULT 'user' NOT NULL,
	`notes` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_status_log_role_idx` ON `role_status_log` (`role_id`);--> statement-breakpoint
CREATE INDEX `role_status_log_status_idx` ON `role_status_log` (`new_status`);--> statement-breakpoint
CREATE INDEX `role_status_log_created_idx` ON `role_status_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `role_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text,
	`category` text NOT NULL,
	`action` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_logs_role_idx` ON `role_logs` (`role_id`);--> statement-breakpoint
CREATE INDEX `role_logs_category_idx` ON `role_logs` (`category`);--> statement-breakpoint
CREATE INDEX `role_logs_created_idx` ON `role_logs` (`created_at`);