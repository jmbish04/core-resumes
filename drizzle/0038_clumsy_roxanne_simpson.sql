CREATE TABLE IF NOT EXISTS `salary_dashboard_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`filters` text NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `salary_pinned_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` text NOT NULL,
	`role_title` text NOT NULL,
	`company_name` text NOT NULL,
	`salary_min` integer,
	`salary_max` integer,
	`pinned_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `salary_pinned_roles_role_idx` ON `salary_pinned_roles` (`role_id`);