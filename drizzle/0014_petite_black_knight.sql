CREATE TABLE IF NOT EXISTS  `role_podcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`notebooklm_source_id` text,
	`notebooklm_source_filename` text NOT NULL,
	`notebooklm_chat_conversation_id` text,
	`notebooklm_chat_response` text,
	`notebooklm_artifact_id_baseline` text DEFAULT '[]',
	`notebooklm_artifact_id` text,
	`r2_audio_key` text,
	`drive_audio_file_id` text,
	`drive_asset_file_ids` text DEFAULT '{}',
	`drive_transcript_doc_id` text,
	`transcription_job_id` text,
	`transcript_text` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`step_errors` text DEFAULT '[]',
	`check_count` integer DEFAULT 0 NOT NULL,
	`last_checked_at` integer,
	`workflow_instance_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_podcasts_role_id_idx` ON `role_podcasts` (`role_id`);--> statement-breakpoint
CREATE INDEX `role_podcasts_status_idx` ON `role_podcasts` (`status`);--> statement-breakpoint
CREATE INDEX `role_podcasts_notebooklm_artifact_id_idx` ON `role_podcasts` (`notebooklm_artifact_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `__new_transcription_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text,
	`podcast_id` text,
	`role_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`phase` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`total_chunks` integer,
	`completed_chunks` integer DEFAULT 0 NOT NULL,
	`full_text` text,
	`error` text,
	`r2_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`recording_id`) REFERENCES `interview_recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`podcast_id`) REFERENCES `role_podcasts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_transcription_jobs`("id", "recording_id", "podcast_id", "role_id", "status", "phase", "progress", "total_chunks", "completed_chunks", "full_text", "error", "r2_key", "created_at", "updated_at", "completed_at") SELECT "id", "recording_id", "podcast_id", "role_id", "status", "phase", "progress", "total_chunks", "completed_chunks", "full_text", "error", "r2_key", "created_at", "updated_at", "completed_at" FROM `transcription_jobs`;--> statement-breakpoint
DROP TABLE `transcription_jobs`;--> statement-breakpoint
ALTER TABLE `__new_transcription_jobs` RENAME TO `transcription_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transcription_jobs_recording_id_idx` ON `transcription_jobs` (`recording_id`);--> statement-breakpoint
CREATE INDEX `transcription_jobs_podcast_id_idx` ON `transcription_jobs` (`podcast_id`);--> statement-breakpoint
CREATE INDEX `transcription_jobs_role_id_idx` ON `transcription_jobs` (`role_id`);--> statement-breakpoint
CREATE INDEX `transcription_jobs_status_idx` ON `transcription_jobs` (`status`);