CREATE TABLE IF NOT EXISTS `notebooklm_blobs` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`notebooklm_id` text NOT NULL,
	`notebooklm_msg_id` text,
	`notebooklm_source_uuid` text,
	`notebooklm_remote_id` text,
	`filename` text NOT NULL,
	`md5` text,
	`pipeline_doc_type` text NOT NULL,
	`notebooklm_type` text NOT NULL,
	`artifact_status` text,
	`r2_key` text,
	`drive_file_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notebooklm_blobs_role_id_idx` ON `notebooklm_blobs` (`role_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notebooklm_blobs_type_idx` ON `notebooklm_blobs` (`notebooklm_type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notebooklm_blobs_source_uuid_idx` ON `notebooklm_blobs` (`notebooklm_source_uuid`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notebooklm_blobs_md5_idx` ON `notebooklm_blobs` (`md5`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notebooklm_blobs_active_idx` ON `notebooklm_blobs` (`is_active`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notebooklm_blobs_doc_type_idx` ON `notebooklm_blobs` (`pipeline_doc_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notebooklm_podcast_transcript` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` text NOT NULL,
	`notebooklm_msg_id` text,
	`podcast_id` text,
	`line_order` integer NOT NULL,
	`speaker_name` text NOT NULL,
	`speaker_usec_start` integer,
	`speaker_usec_stop` integer,
	`speaker_message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `nlm_podcast_transcript_role_id_idx` ON `notebooklm_podcast_transcript` (`role_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `nlm_podcast_transcript_podcast_id_idx` ON `notebooklm_podcast_transcript` (`podcast_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `nlm_podcast_transcript_order_idx` ON `notebooklm_podcast_transcript` (`podcast_id`,`line_order`);