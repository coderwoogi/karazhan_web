-- Universal fix for display_number - works for all boards dynamically
-- Fixed collation issue

-- Step 1: Reset all display numbers
UPDATE web_posts SET display_number = 0;

-- Step 2: Assign correct sequential numbers per board
-- Using ROW_NUMBER() equivalent with variables and explicit collation
SET @current_board = '';
SET @row_num = 0;

UPDATE web_posts
JOIN (
    SELECT 
        id,
        board_id,
        @row_num := IF(@current_board COLLATE utf8mb4_general_ci = board_id COLLATE utf8mb4_general_ci, @row_num + 1, 1) AS new_display_number,
        @current_board := board_id AS dummy
    FROM web_posts
    ORDER BY board_id, id
) AS numbered USING (id)
SET web_posts.display_number = numbered.new_display_number;

-- Verify the results
SELECT board_id, id, title, display_number 
FROM web_posts 
ORDER BY board_id, display_number 
LIMIT 20;
