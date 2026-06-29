-- 홍보 이벤트: 회차 + 회차당 최대 참여 횟수
-- 대상 DB: 웹 운영 DB (UpdateDSN — web_posts / web_promotion_* 와 동일 DB)
--
-- 참고: 웹 백엔드가 기동 시 자동으로 아래 컬럼을 추가한다(board.go 스키마 init).
--       이 파일은 수동 배포/검토용. (MariaDB: ADD COLUMN IF NOT EXISTS 사용)

-- 검사설정 테이블에 현재 회차 + 회차당 최대 참여 횟수(0=무제한)
ALTER TABLE web_promotion_verify_config
    ADD COLUMN IF NOT EXISTS current_round INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS max_per_round INT NOT NULL DEFAULT 0;

-- 각 홍보글이 속한 회차
ALTER TABLE web_posts
    ADD COLUMN IF NOT EXISTS promo_round INT NOT NULL DEFAULT 0;

-- [MySQL 8] IF NOT EXISTS(컬럼) 미지원 시 아래를 1회만 실행:
--   ALTER TABLE web_promotion_verify_config ADD COLUMN current_round INT NOT NULL DEFAULT 1;
--   ALTER TABLE web_promotion_verify_config ADD COLUMN max_per_round INT NOT NULL DEFAULT 0;
--   ALTER TABLE web_posts ADD COLUMN promo_round INT NOT NULL DEFAULT 0;
