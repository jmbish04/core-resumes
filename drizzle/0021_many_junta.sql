CREATE TABLE IF NOT EXISTS `google_maps_usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`api_type` text NOT NULL,
	`api_request` text NOT NULL,
	`api_response` text NOT NULL
);
