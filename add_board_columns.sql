ALTER TABLE web_boards ADD COLUMN allow_attachments BOOLEAN DEFAULT TRUE;
ALTER TABLE web_boards ADD COLUMN allow_rich_editor BOOLEAN DEFAULT TRUE;
ALTER TABLE web_boards ADD COLUMN allow_emoji BOOLEAN DEFAULT TRUE;
ALTER TABLE web_boards ADD COLUMN allow_nested_comments BOOLEAN DEFAULT TRUE;

ALTER TABLE web_comments ADD COLUMN parent_id INT DEFAULT NULL;
ALTER TABLE web_comments ADD COLUMN depth INT DEFAULT 0;
ALTER TABLE web_comments ADD INDEX idx_parent_id (parent_id);

UPDATE web_boards SET allow_attachments = TRUE, allow_rich_editor = TRUE, allow_emoji = TRUE, allow_nested_comments = TRUE WHERE id = 'notice';
