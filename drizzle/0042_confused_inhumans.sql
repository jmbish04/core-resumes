CREATE TABLE IF NOT EXISTS `geo_locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`country` text,
	`region` text,
	`city` text,
	`metro` text,
	`lat` real,
	`lng` real,
	`parent_id` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `geo_locations_type_idx` ON `geo_locations` (`type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `geo_locations_country_idx` ON `geo_locations` (`country`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `geo_locations_metro_uniq_idx` ON `geo_locations` (`metro`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `geo_locations_parent_id_idx` ON `geo_locations` (`parent_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `geo_locations_name_type_idx` ON `geo_locations` (`name`,`type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `geo_location_meta_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`value_type` text DEFAULT 'number' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `geo_meta_defs_key_uniq_idx` ON `geo_location_meta_definitions` (`key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `geo_location_mappings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`geo_id` integer NOT NULL,
	`meta_id` integer NOT NULL,
	`value` text NOT NULL,
	`source` text,
	`as_of` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `geo_mappings_geo_meta_uniq_idx` ON `geo_location_mappings` (`geo_id`,`meta_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `geo_mappings_geo_id_idx` ON `geo_location_mappings` (`geo_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `geo_mappings_meta_id_idx` ON `geo_location_mappings` (`meta_id`);--> statement-breakpoint
ALTER TABLE `roles` ADD `geo_id` integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `roles_geo_id_idx` ON `roles` (`geo_id`);