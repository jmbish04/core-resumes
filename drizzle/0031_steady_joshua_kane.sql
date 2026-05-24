PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__new_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`company_name` text NOT NULL,
	`job_title` text NOT NULL,
	`job_url` text,
	`job_posting_pdf_url` text,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text DEFAULT 'USD',
	`years_experience_min` integer,
	`years_experience_max` integer,
	`about_company` text,
	`about_role_narrative` text,
	`other_content` text,
	`status` text DEFAULT 'preparing' NOT NULL,
	`drive_folder_id` text,
	`metadata` text,
	`role_instructions` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_snapshot_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_roles`("id", "company_id", "company_name", "job_title", "job_url", "job_posting_pdf_url", "salary_min", "salary_max", "salary_currency", "years_experience_min", "years_experience_max", "about_company", "about_role_narrative", "other_content", "status", "drive_folder_id", "metadata", "role_instructions", "source", "source_snapshot_id", "created_at", "updated_at") SELECT "id", "company_id", "company_name", "job_title", "job_url", "job_posting_pdf_url", "salary_min", "salary_max", "salary_currency", "years_experience_min", "years_experience_max", "about_company", "about_role_narrative", "other_content", "status", "drive_folder_id", "metadata", "role_instructions", "source", "source_snapshot_id", "created_at", "updated_at" FROM `roles`;--> statement-breakpoint
DROP TABLE `roles`;--> statement-breakpoint
ALTER TABLE `__new_roles` RENAME TO `roles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `roles_status_idx` ON `roles` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `roles_source_idx` ON `roles` (`source`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_category_mappings_category_id_idx` ON `job_category_mappings` (`job_category_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_category_mappings_snapshot_id_idx` ON `job_category_mappings` (`job_snapshot_id`);