-- 선술집(포인트 상점) 상품 "지급 수량" 컬럼 추가
-- grant_qty: 이 상품을 1개 구매(또는 선물)할 때 지급되는 아이템 개수 (게임 아이템 전용, 기본 1)
-- 총 지급 개수 = 구매 수량(qty) x grant_qty
--
-- 참고: 웹 서버 기동 시 ensurePointShopTables()가 동일한 ALTER를 자동 실행하므로
--       보통은 이 스크립트를 수동 적용할 필요가 없습니다. 운영 DB에 선반영하고 싶을 때만 사용하세요.
-- DB: acore 계열이 아니라 웹 전용 DB(update). 실행 전 대상 DB 확인.

ALTER TABLE point_shop_items
    ADD COLUMN grant_qty INT NOT NULL DEFAULT 1 AFTER stock_qty;

-- 이미 컬럼이 있으면 위 문장은 "Duplicate column name" 오류를 냅니다. 그 경우 무시하세요.
