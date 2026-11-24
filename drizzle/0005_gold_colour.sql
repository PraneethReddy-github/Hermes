-- Visual refresh: the old orange-ish gold swatch #E3A93B becomes #D4AF37 (case-insensitive match).
UPDATE `projects` SET `color` = '#D4AF37' WHERE upper(`color`) = '#E3A93B';--> statement-breakpoint
UPDATE `labels` SET `color` = '#D4AF37' WHERE upper(`color`) = '#E3A93B';--> statement-breakpoint
UPDATE `events` SET `color` = '#D4AF37' WHERE upper(`color`) = '#E3A93B';
