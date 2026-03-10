-- Add feature flag columns to web_boards table
ALTER TABLE web_boards 
ADD COLUMN IF NOT EXISTS allow_attachments BOOLEAN DEFAULT TRUE COMMENT '첨부파일 허용',
ADD COLUMN IF NOT EXISTS allow_rich_editor BOOLEAN DEFAULT TRUE COMMENT '리치 에디터 허용',
ADD COLUMN IF NOT EXISTS allow_emoji BOOLEAN DEFAULT TRUE COMMENT '이모지 허용',
ADD COLUMN IF NOT EXISTS allow_nested_comments BOOLEAN DEFAULT TRUE COMMENT '대댓글 허용';

-- Add parent_id and depth columns to web_comments if not exists
ALTER TABLE web_comments
ADD COLUMN IF NOT EXISTS parent_id INT DEFAULT NULL COMMENT '부모 댓글 ID',
ADD COLUMN IF NOT EXISTS depth INT DEFAULT 0 COMMENT '댓글 깊이 (0=댓글, 1=대댓글)',
ADD INDEX IF NOT EXISTS idx_parent_id (parent_id);

-- Update existing notice board with all features enabled
UPDATE web_boards 
SET allow_attachments = TRUE,
    allow_rich_editor = TRUE,
    allow_emoji = TRUE,
    allow_nested_comments = TRUE
WHERE id = 'notice';
