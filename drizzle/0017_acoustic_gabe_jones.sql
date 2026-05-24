CREATE TABLE IF NOT EXISTS  `role_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`type` text NOT NULL,
	`input_hash` text NOT NULL,
	`score` integer NOT NULL,
	`rationale` text NOT NULL,
	`raw_api_response` text,
	`analysis_payload` text,
	`config_snapshot` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `role_insights_role_type_idx` ON `role_insights` (`role_id`,`type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `role_insights_hash_idx` ON `role_insights` (`input_hash`);