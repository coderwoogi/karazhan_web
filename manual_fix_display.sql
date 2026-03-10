-- Simple test: Check current display_number values
SELECT 
    board_id,
    id,
    title,
    display_number,
    created_at
FROM web_posts 
ORDER BY board_id, id;

-- If numbers are still shared, run this to fix:
-- Reset all to 0
UPDATE web_posts SET display_number = 0;

-- Fix notice board
UPDATE web_posts p1
SET display_number = (
    SELECT COUNT(*)
    FROM (SELECT * FROM web_posts) p2
    WHERE p2.board_id = 'notice'
    AND p2.id <= p1.id
)
WHERE board_id = 'notice';

-- Fix free board
UPDATE web_posts p1
SET display_number = (
    SELECT COUNT(*)
    FROM (SELECT * FROM web_posts) p2
    WHERE p2.board_id = 'free'
    AND p2.id <= p1.id
)
WHERE board_id = 'free';

-- Verify
SELECT board_id, id, display_number FROM web_posts ORDER BY board_id, id;
