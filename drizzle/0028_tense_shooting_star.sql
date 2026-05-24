CREATE TABLE IF NOT EXISTS `board_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `board_tokens_token_unique` ON `board_tokens` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `board_template_analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text NOT NULL,
	`css_selectors` text,
	`salary_markers` text,
	`structural_notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `jobs_postings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_site_id` text NOT NULL,
	`job_title` text NOT NULL,
	`company` text NOT NULL,
	`date_first_seen` integer NOT NULL,
	`triage_passed` integer DEFAULT false,
	`triage_reason` text,
	`analysis_executed` integer DEFAULT false,
	`is_favorite` integer DEFAULT false
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `jobs_postings_job_site_id_unique` ON `jobs_postings` (`job_site_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `jobs_postings_company_idx` ON `jobs_postings` (`company`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `jobs_postings_triage_passed_idx` ON `jobs_postings` (`triage_passed`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `jobs_postings_is_favorite_idx` ON `jobs_postings` (`is_favorite`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`snapshot_timestamp` integer NOT NULL,
	`vectorize_id` text,
	`session_uuid` text,
	`raw_assessment_json` text,
	`match_score` integer,
	`match_rationale` text,
	`verdict` text,
	`verdict_rationale` text,
	`builder_alignment` integer,
	`jd_trap_detected` integer DEFAULT false,
	`job_summary` text,
	`extracted_salary_raw` text,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text,
	`extracted_benefits_raw` text,
	`benefits_medical` text,
	`benefits_equity` text,
	`benefits_retirement` text,
	`benefits_pto` text,
	`benefits_bonus` text,
	`benefits_other_json` text,
	`historic_comparison` text,
	`historic_salary_analysis` text,
	`historic_benefits_analysis` text,
	`negotiation_strategy` text,
	`extracted_location` text,
	`experience_level` text,
	`is_manual_reprocess` integer DEFAULT false,
	`reprocess_rationale` text,
	`archive_md_key` text,
	`archive_pdf_key` text,
	`archive_html_key` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs_postings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_snapshots_job_id_idx` ON `job_snapshots` (`job_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_snapshots_session_uuid_idx` ON `job_snapshots` (`session_uuid`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_snapshots_verdict_idx` ON `job_snapshots` (`verdict`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_snapshots_match_score_idx` ON `job_snapshots` (`match_score`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_req_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`requirement` text NOT NULL,
	`match_score` integer,
	`match_rationale` text,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_skill_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`skill` text NOT NULL,
	`match_score` integer,
	`match_rationale` text,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_responsibility_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`responsibility` text NOT NULL,
	`match_score` integer,
	`match_rationale` text,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_notebook_consultations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`references_json` text,
	`turn_number` integer DEFAULT 1 NOT NULL,
	`conversation_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notebook_consultations_snapshot_id_idx` ON `job_notebook_consultations` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_log_workers_ai` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`model` text NOT NULL,
	`direction` text NOT NULL,
	`job_title` text,
	`schema_target` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`response_preview` text,
	`duration_seconds` real,
	`error` text,
	`http_status` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `job_categories_name_unique` ON `job_categories` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_category_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_category_id` integer NOT NULL,
	`job_snapshot_id` integer NOT NULL,
	`ai_rationale` text,
	FOREIGN KEY (`job_category_id`) REFERENCES `job_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_snapshot_id`) REFERENCES `job_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_category_hitl_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_mapping_id` integer NOT NULL,
	`signal` text NOT NULL,
	`user_rationale` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_mapping_id`) REFERENCES `job_category_mappings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `job_tags_name_unique` ON `job_tags` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_tag_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_tag_id` integer NOT NULL,
	`job_snapshot_id` integer NOT NULL,
	`ai_rationale` text,
	FOREIGN KEY (`job_tag_id`) REFERENCES `job_tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_snapshot_id`) REFERENCES `job_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_tag_hitl_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag_mapping_id` integer NOT NULL,
	`signal` text NOT NULL,
	`user_rationale` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tag_mapping_id`) REFERENCES `job_tag_mappings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hitl_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`snapshot_id` integer NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`rationale` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hitl_reviews_snapshot_id_idx` ON `hitl_reviews` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_uuid` text NOT NULL,
	`timestamp` integer NOT NULL,
	`total_scraped` integer DEFAULT 0 NOT NULL,
	`total_triaged` integer DEFAULT 0 NOT NULL,
	`total_analyzed` integer DEFAULT 0 NOT NULL,
	`total_failed` integer DEFAULT 0 NOT NULL,
	`total_cost` text DEFAULT '0.0',
	`taxonomy_categories` integer DEFAULT 0,
	`taxonomy_tags` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `session_runs_session_uuid_unique` ON `session_runs` (`session_uuid`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_saved_list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`snapshot_id` integer NOT NULL,
	`position` integer DEFAULT 0,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `job_saved_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `job_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `saved_list_items_list_id_idx` ON `job_saved_list_items` (`list_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `saved_list_items_snapshot_id_idx` ON `job_saved_list_items` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_saved_lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `job_saved_lists_name_unique` ON `job_saved_lists` (`name`);--> statement-breakpoint
ALTER TABLE `roles` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `roles` ADD `source_snapshot_id` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `roles_source_idx` ON `roles` (`source`);