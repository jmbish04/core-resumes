CREATE TABLE IF NOT EXISTS  `interview_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`title` text DEFAULT 'New Note' NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `interview_notes_role_id_idx` ON `interview_notes` (`role_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS  `interview_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`duration_seconds` integer,
	`transcription` text,
	`transcription_status` text DEFAULT 'pending' NOT NULL,
	`note_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `interview_notes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `interview_recordings_role_id_idx` ON `interview_recordings` (`role_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `interview_recordings_status_idx` ON `interview_recordings` (`transcription_status`);