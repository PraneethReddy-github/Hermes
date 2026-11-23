ALTER TABLE `events` ADD `ics_uid` text;--> statement-breakpoint
CREATE UNIQUE INDEX `events_ics_uid_uq` ON `events` (`ics_uid`);