CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`system_prompt` text,
	`model` text,
	`temperature` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `topics` ADD `agent_id` text REFERENCES agents(id) ON DELETE SET NULL;