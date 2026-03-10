SET NAMES utf8mb4;
INSERT IGNORE INTO web_menu_permissions (menu_id, min_web_rank, description) VALUES
  ('home',        0, 'Home'),
  ('mypage',      0, 'My Page'),
  ('board',       0, 'Board'),
  ('update',      0, 'Update'),
  ('account',     2, 'Account Management'),
  ('ban',         1, 'Character/Ban Management'),
  ('logs',        1, 'Logs'),
  ('content',     2, 'Content Management'),
  ('gm',          1, 'GM Tools'),
  ('board-admin', 2, 'Board Admin'),
  ('remote',      3, 'Remote Control');
SELECT menu_id, min_web_rank, description FROM web_menu_permissions ORDER BY min_web_rank, menu_id;
