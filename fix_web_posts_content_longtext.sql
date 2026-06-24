-- ============================================================================
-- 게시판 글 본문 길이 초과 오류 수정
--   증상: 업데이트 게시판 등 글 작성 시
--         Error 1406 (22001): Data too long for column 'content' at row 1
--   원인: web_posts.content 가 TEXT(최대 65,535바이트)라, 본문에 이미지(base64)가
--         인라인으로 포함되면 64KB 한도를 초과함.
--   조치: content 를 LONGTEXT(최대 4GB)로 확장(데이터 보존, 서버 재시작 불필요).
--
-- 대상 DB: update  (웹 게시판 web_posts 가 위치한 DB)
-- 적용:  mysql -u root -p update < fix_web_posts_content_longtext.sql
-- ============================================================================

ALTER TABLE `update`.`web_posts` MODIFY COLUMN `content` LONGTEXT;

-- 참고: 이미지를 본문에 base64 로 직접 넣으면 DB가 비대해지고 조회가 느려집니다.
--       장기적으로는 이미지를 파일로 업로드하고 본문에는 URL만 저장하는 방식을 권장합니다.
