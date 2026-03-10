-- Board System Tables for Karazhan CMS

CREATE TABLE IF NOT EXISTS `web_boards` (
    `id` VARCHAR(50) PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `min_gm_read` INT DEFAULT 0,
    `min_gm_write` INT DEFAULT 3,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `web_posts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `board_id` VARCHAR(50) NOT NULL,
    `account_id` INT NOT NULL,
    `author_name` VARCHAR(100) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `views` INT DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (`board_id`),
    FOREIGN KEY (`board_id`) REFERENCES `web_boards`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `web_comments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `post_id` INT NOT NULL,
    `account_id` INT NOT NULL,
    `author_name` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (`post_id`),
    FOREIGN KEY (`post_id`) REFERENCES `web_posts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert initial board: Notice
INSERT IGNORE INTO `web_boards` (`id`, `name`, `min_gm_read`, `min_gm_write`) 
VALUES ('notice', '공지사항', 0, 3);
