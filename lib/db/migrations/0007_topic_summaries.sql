CREATE TABLE `topic_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`content` text NOT NULL,
	`through_message_id` text NOT NULL,
	`compressed_count` integer DEFAULT 0 NOT NULL,
	`token_count` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `topic_summaries_topic_created_at_idx` ON `topic_summaries` (`topic_id`,`created_at`);