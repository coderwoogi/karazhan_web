-- 선술집 프리미엄 퀘스트 기능 아이템 3종
-- 구매 시 대상(접속 중) 캐릭터에게 커스텀 명령 .karazhan reward 로
--   보상 스펠을 영구 학습(learnSpell) / 칭호를 영구 부여(SetTitle) 한다.
-- function_code = reward:<spellId>:<titleId>  (없는 항목은 0)
--   프리미엄 퀘스트 : 모험가        -> reward:0:78     (칭호 탐험가 78)
--   프리미엄 퀘스트 : 현자 대사      -> reward:0:125    (칭호 현자 125)
--   프리미엄 퀘스트 : 숲 수호자들    -> reward:23769:0  (스펠 23769 학습)
-- DB: 웹 전용 DB(update). 가격/아이콘은 관리자 화면에서 조정.
-- 실동작엔 mod-karazhan-commands(.karazhan reward) 월드서버 재빌드 + 캐릭터 접속 필요.

-- (신규 설치) 없으면 추가
INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 모험가', 'function', NULL, 'reward:0:78', '', '구매 시 탐험가 칭호를 획득합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code IN ('reward:0:78','questclear:900014'));

INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 현자 대사', 'function', NULL, 'reward:0:125', '', '구매 시 현자 칭호를 획득합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code IN ('reward:0:125','questclear:900015'));

INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 숲 수호자들', 'function', NULL, 'reward:23769:0', '', '구매 시 해당 스펠을 영구 학습합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code IN ('reward:23769:0','questclear:900016'));

-- (기존 questclear 버전 마이그레이션) 이미 questclear 코드로 등록돼 있으면 reward 코드로 갱신
UPDATE point_shop_items SET function_code='reward:0:78'    WHERE function_code='questclear:900014';
UPDATE point_shop_items SET function_code='reward:0:125'   WHERE function_code='questclear:900015';
UPDATE point_shop_items SET function_code='reward:23769:0' WHERE function_code='questclear:900016';
