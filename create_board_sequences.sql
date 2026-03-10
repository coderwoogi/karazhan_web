-- Create a sequence table for board-specific post numbering
CREATE TABLE IF NOT EXISTS web_board_sequences (
    board_id VARCHAR(50) PRIMARY KEY,
    last_number INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Initialize sequences for existing boards
INSERT INTO web_board_sequences (board_id, last_number) 
VALUES ('notice', 0), ('free', 0)
ON DUPLICATE KEY UPDATE last_number = last_number;

-- Update last_number based on existing posts
UPDATE web_board_sequences bs
SET last_number = (
    SELECT IFNULL(MAX(display_number), 0)
    FROM web_posts
    WHERE board_id = bs.board_id
);

-- Verify
SELECT * FROM web_board_sequences;
