-- Step 1: Add display_number column only if it doesn't exist
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'update' 
AND TABLE_NAME = 'web_posts' 
AND COLUMN_NAME = 'display_number';

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE web_posts ADD COLUMN display_number INT NOT NULL DEFAULT 0',
    'SELECT "Column already exists" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add index if it doesn't exist
SET @idx_exists = 0;
SELECT COUNT(*) INTO @idx_exists 
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = 'update' 
AND TABLE_NAME = 'web_posts' 
AND INDEX_NAME = 'idx_board_display';

SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE web_posts ADD INDEX idx_board_display (board_id, display_number DESC)',
    'SELECT "Index already exists" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Update existing posts with display numbers using derived table
UPDATE web_posts p1
INNER JOIN (
    SELECT 
        p2.id,
        (SELECT COUNT(*) 
         FROM web_posts p3 
         WHERE p3.board_id = p2.board_id 
         AND p3.id <= p2.id) AS new_display_number
    FROM web_posts p2
    WHERE p2.display_number = 0
) AS derived ON p1.id = derived.id
SET p1.display_number = derived.new_display_number;
