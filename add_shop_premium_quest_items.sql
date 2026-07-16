-- 선술집 프리미엄 퀘스트 기능 아이템 3종
-- 구매 시 대상(접속 중) 캐릭터의 퀘스트를 완료 처리(.karazhan questclear).
--   미수락 상태면 강제로 퀘스트를 추가한 뒤 완료. 캐릭터가 오프라인이면 구매 실패(포인트 환불).
-- function_code = questclear:<questId>
--   프리미엄 퀘스트 : 모험가        -> 퀘스트 900014
--   프리미엄 퀘스트 : 현자 대사      -> 퀘스트 900015
--   프리미엄 퀘스트 : 숲 수호자들    -> 퀘스트 900016 (전설의 정령야수 사냥)
-- DB: 웹 전용 DB(update). 대상 DB 확인 후 실행.
-- 가격(price_points)/아이콘은 필요에 맞게 관리자 화면에서 조정하세요. (기본 1000, 노출 ON)
-- 멱등 실행: 이미 있으면 다시 넣지 않음.

INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 모험가', 'function', NULL, 'questclear:900014', '', '구매 시 「모험가」 퀘스트를 완료 처리합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code='questclear:900014');

INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 현자 대사', 'function', NULL, 'questclear:900015', '', '구매 시 「현자 대사」 퀘스트를 완료 처리합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code='questclear:900015');

INSERT INTO point_shop_items (name, item_type, item_entry, function_code, icon_path, description, price_points, stock_qty, is_visible, is_deleted)
SELECT '프리미엄 퀘스트 : 숲 수호자들', 'function', NULL, 'questclear:900016', '', '구매 시 「전설의 정령야수 사냥」 퀘스트를 완료 처리합니다. (캐릭터 접속 필요)', 1000, -1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM point_shop_items WHERE function_code='questclear:900016');
