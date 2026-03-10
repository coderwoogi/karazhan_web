-- 게시글 조회 기록 테이블 (계정별 중복 방지)
CREATE TABLE IF NOT EXISTS web_post_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    account_id INT NOT NULL,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_view (post_id, account_id),
    FOREIGN KEY (post_id) REFERENCES web_posts(id) ON DELETE CASCADE,
    INDEX idx_post_id (post_id),
    INDEX idx_account_id (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
