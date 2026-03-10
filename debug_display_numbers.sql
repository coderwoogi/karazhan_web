-- Debug script: Check everything related to display_number

-- 1. Check sequence table
SELECT 'Sequence Table:' AS info;
SELECT * FROM web_board_sequences;

-- 2. Check actual posts
SELECT 'Posts Data:' AS info;
SELECT board_id, id, title, display_number, created_at 
FROM web_posts 
ORDER BY board_id, display_number;

-- 3. Check if there are posts with same display_number across different boards
SELECT 'Duplicate Numbers Check:' AS info;
SELECT display_number, GROUP_CONCAT(board_id) AS boards, COUNT(*) AS count
FROM web_posts
GROUP BY display_number
HAVING COUNT(*) > 1;

-- 4. Count posts per board
SELECT 'Posts Per Board:' AS info;
SELECT board_id, COUNT(*) AS total_posts, MAX(display_number) AS max_number
FROM web_posts
GROUP BY board_id;
