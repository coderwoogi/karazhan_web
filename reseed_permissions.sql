-- Reseed web_role_permissions to align with sidebar order and names
SET @order := 0;

-- Delete existing menu/submenu entries to re-align
DELETE FROM update.web_role_permissions WHERE resource_type IN ('menu', 'submenu');

-- INSERT Menus and Submenus in Order
-- 1. 홈 (home)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'home', '홈', 1, 1, 1, 100);

-- 2. GM 업무 관리 (gm)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'gm', 'GM 업무 관리', 0, 1, 1, 200);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'gm-todos', '업무 관리', 0, 1, 1, 201);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'gm-events', '서버 일정', 0, 1, 1, 202);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'gm-modules', '모듈 분석', 0, 1, 1, 203);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'gm-memos', '전체 메모', 0, 1, 1, 204);

-- 3. 서버 제어 (remote)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'remote', '서버 제어', 0, 1, 1, 300);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'remote-control', '서버 제어', 0, 1, 1, 301);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'remote-schedule', '서버 점검 예약', 0, 1, 1, 302);

-- 4. 업데이트 (update)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'update', '업데이트', 0, 1, 1, 400);

-- 5. 계정 관리 (account)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'account', '계정 관리', 0, 1, 1, 500);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'account-list', '계정 목록', 0, 1, 1, 501);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'account-statistics', '통계', 0, 1, 1, 502);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'account-permissions', '사용자 권한', 0, 1, 1, 503);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'account-menu', '메뉴 접근 권한', 0, 1, 1, 504);

-- 6. 캐릭터/제재 (ban)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'ban', '캐릭터/제재', 0, 1, 1, 600);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'ban-characters', '캐릭터 목록', 0, 1, 1, 601);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'ban-sendmail', '우편 발송', 0, 1, 1, 602);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'ban-accountban', '계정 차단', 0, 1, 1, 603);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'ban-ipban', 'IP 차단', 0, 1, 1, 604);

-- 7. 로그 센터 (log)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'log', '로그 센터', 0, 1, 1, 700);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'log-action', '웹 관리자 활동', 0, 1, 1, 701);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'log-blackmarket', '암시장 거래', 0, 1, 1, 702);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'log-karazhan', '강화 로그', 0, 1, 1, 703);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'log-playtime', '접속 보상', 0, 1, 1, 704);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'log-mail', '우편 발송 기록', 0, 1, 1, 705);

-- 8. 콘텐츠 데이터 관리 (content)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'content', '콘텐츠 데이터 관리', 0, 1, 1, 800);
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('submenu', 'content-blackmarket', '암시장 품목 설정', 0, 1, 1, 801);

-- 9. 게시판 (board)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'board', '게시판', 1, 1, 1, 900);

-- 10. 마이페이지 (mypage)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'mypage', '마이페이지', 1, 1, 1, 1000);

-- 11. 게시판 관리 (CMS) (board-admin)
INSERT INTO update.web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index)
VALUES ('menu', 'board-admin', '게시판 관리 (CMS)', 0, 1, 1, 1100);

-- Update existing board permissions to be at the end
UPDATE update.web_role_permissions SET order_index = 5000 + id WHERE resource_type LIKE 'board_%';
