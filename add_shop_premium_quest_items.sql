-- 선술집 프리미엄 퀘스트 기능 아이템 3종
-- 구매 시 대상(접속 중) 캐릭터에게 커스텀 명령 .karazhan reward 로
--   보상 스펠을 영구 학습(learnSpell, = 인게임 .learn 과 동일) / 칭호를 영구 부여(SetTitle) 한다.
-- function_code = reward:<spellId>:<titleId>  (없는 항목은 0)
--   프리미엄 퀘스트 : 모험가        -> reward:30164:78   (버프 30164 학습 + 칭호 탐험가 78)
--   프리미엄 퀘스트 : 현자 대사      -> reward:22818:125  (버프 22818 학습 + 칭호 현자 125)
--   프리미엄 퀘스트 : 숲 수호자들    -> reward:23769:0    (버프 23769 학습)
-- 보상 스펠은 모두 스탯 버프 스펠(30164 체력, 22818 체력%, 23769 마법저항)이며 스펠북에 영구 등록된다.
-- DB: 웹 전용 DB(update). 가격/아이콘은 관리자 화면에서 조정.
-- 실동작엔 mod-karazhan-commands(.karazhan reward) 월드서버 재빌드 + 캐릭터 접속 필요.

-- (신규 설치) 없으면 추가 — 과거 코드(questclear:* / reward:0:*)까지 중복 체크
INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 모험가', 'function', NULL, 'reward:30164:78', '', '구매 시 버프를 영구 학습하고 탐험가 칭호를 획득합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code IN ('reward:30164:78','reward:0:78','questclear:900014'));

INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 현자 대사', 'function', NULL, 'reward:22818:125', '', '구매 시 버프를 영구 학습하고 현자 칭호를 획득합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code IN ('reward:22818:125','reward:0:125','questclear:900015'));

INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 숲 수호자들', 'function', NULL, 'reward:23769:0', '', '구매 시 해당 버프 스펠을 영구 학습합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code IN ('reward:23769:0','questclear:900016'));

-- (마이그레이션) 이전 버전 코드가 등록돼 있으면 최신 reward 코드로 갱신
--   · questclear:*        : 최초 퀘스트강제완료 버전
--   · reward:0:78/125     : 칭호만 주던 중간 버전 -> 버프 학습 추가
UPDATE point_shop_items SET function_code='reward:30164:78'  WHERE function_code IN ('questclear:900014','reward:0:78');
UPDATE point_shop_items SET function_code='reward:22818:125' WHERE function_code IN ('questclear:900015','reward:0:125');
UPDATE point_shop_items SET function_code='reward:23769:0'   WHERE function_code='questclear:900016';
