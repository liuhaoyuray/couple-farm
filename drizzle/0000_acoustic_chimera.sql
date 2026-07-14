CREATE TABLE `poop_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `poop_member_time_idx` ON `poop_entries` (`member`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_member` text NOT NULL,
	`to_member` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reaction_to_time_idx` ON `reactions` (`to_member`,`created_at`);--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member` text NOT NULL,
	`weight_kg` real NOT NULL,
	`recorded_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `weight_member_time_idx` ON `weight_entries` (`member`,`recorded_at`);