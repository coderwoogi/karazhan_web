-- 카드뽑기 직업별 랜덤 장비 보상 설정
-- 대상 DB: 웹 운영 DB (UpdateDSN — user_profiles / web_carddraw_items 와 동일 DB)
--
-- 참고: 웹 백엔드가 기동/관리자 진입 시 자동 생성한다(ensureCarddrawEquipSchema).
--       이 파일은 수동 배포/검토용.

CREATE TABLE IF NOT EXISTS web_carddraw_settings (
    id             INT          NOT NULL PRIMARY KEY,           -- 단일 행(=1)
    equip_enabled  TINYINT(1)   NOT NULL DEFAULT 0,             -- 장비 랜덤 보상 활성
    equip_chance   DECIMAL(6,3) NOT NULL DEFAULT 0.000,         -- 카드 1장당 장비 출현 확률(%)
    equip_min_ilvl INT          NOT NULL DEFAULT 0,             -- 아이템 레벨 하한
    equip_max_ilvl INT          NOT NULL DEFAULT 200,           -- 아이템 레벨 상한
    grade_q2       DECIMAL(6,3) NOT NULL DEFAULT 70.000,        -- 고급(초록) 가중치(%)
    grade_q3       DECIMAL(6,3) NOT NULL DEFAULT 22.000,        -- 희귀(파랑)
    grade_q4       DECIMAL(6,3) NOT NULL DEFAULT 7.000,         -- 영웅(보라)
    grade_q5       DECIMAL(6,3) NOT NULL DEFAULT 1.000,         -- 전설(주황)
    cat_weapon     TINYINT(1)   NOT NULL DEFAULT 1,             -- 무기 포함
    cat_armor      TINYINT(1)   NOT NULL DEFAULT 1,             -- 방어구(직업 주력 타입) 포함
    cat_accessory  TINYINT(1)   NOT NULL DEFAULT 1,             -- 장신구(목·반지·장신구·망토) 포함
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO web_carddraw_settings (id) VALUES (1);
