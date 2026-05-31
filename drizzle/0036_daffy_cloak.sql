CREATE TABLE IF NOT EXISTS `freelance_opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`platform_job_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`skills_json` text,
	`budget_type` text,
	`budget_min` real,
	`budget_max` real,
	`budget_currency` text DEFAULT 'USD',
	`experience_level` text,
	`project_length` text,
	`hours_per_week` text,
	`client_location` text,
	`client_country_code` text,
	`client_spent` text,
	`client_score` real,
	`client_hires` integer,
	`client_feedback_count` integer,
	`client_member_since` text,
	`client_verified` integer DEFAULT false,
	`proposals_count` text,
	`is_premium` integer DEFAULT false,
	`is_urgent` integer DEFAULT false,
	`is_nda` integer DEFAULT false,
	`category_name` text,
	`bid_avg` real,
	`bid_deadline` integer,
	`published_at` integer NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`is_active` integer DEFAULT true,
	`content_hash` text,
	`raw_api_response` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `freelance_opportunities_platform_job_id_unique` ON `freelance_opportunities` (`platform_job_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_opportunities_platform_active_idx` ON `freelance_opportunities` (`platform`,`is_active`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_opportunities_published_at_idx` ON `freelance_opportunities` (`published_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_opportunities_content_hash_idx` ON `freelance_opportunities` (`content_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_opportunities_is_active_idx` ON `freelance_opportunities` (`is_active`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `freelance_triage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opportunity_id` integer NOT NULL,
	`decision` text NOT NULL,
	`confidence` real NOT NULL,
	`rationale` text NOT NULL,
	`skills_matched` text,
	`skills_missing` text,
	`budget_match` text,
	`competition_assessment` text,
	`win_probability` real,
	`recommended_bid` real,
	`recommended_bid_currency` text DEFAULT 'USD',
	`bid_strategy` text,
	`model_used` text NOT NULL,
	`decided_at` integer NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `freelance_opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_triage_opportunity_id_idx` ON `freelance_triage` (`opportunity_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_triage_decision_idx` ON `freelance_triage` (`decision`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_triage_decided_at_idx` ON `freelance_triage` (`decided_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `freelance_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` integer NOT NULL,
	`role_id` text,
	`bid_amount` real NOT NULL,
	`bid_currency` text DEFAULT 'USD',
	`cover_letter` text NOT NULL,
	`cover_letter_version` integer DEFAULT 1,
	`key_selling_points` text,
	`estimated_timeline` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`generation_tier` text NOT NULL,
	`ai_model` text,
	`generation_context` text,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `freelance_opportunities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_proposals_opportunity_id_idx` ON `freelance_proposals` (`opportunity_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_proposals_role_id_idx` ON `freelance_proposals` (`role_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_proposals_status_idx` ON `freelance_proposals` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_proposals_created_at_idx` ON `freelance_proposals` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `freelance_scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`search_query` text,
	`search_filters` text,
	`status` text NOT NULL,
	`listings_found` integer DEFAULT 0,
	`listings_new` integer DEFAULT 0,
	`listings_updated` integer DEFAULT 0,
	`error_message` text,
	`duration_ms` integer,
	`triggered_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_scan_runs_platform_idx` ON `freelance_scan_runs` (`platform`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_scan_runs_status_idx` ON `freelance_scan_runs` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `freelance_scan_runs_created_at_idx` ON `freelance_scan_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `freelance_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `freelance_profile_key_unique` ON `freelance_profile` (`key`);