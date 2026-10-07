ALTER TABLE `users` ADD `phone` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);