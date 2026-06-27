-- 웹 채팅 모더레이션(제재) 스키마
-- 대상 DB: acore_characters (브리지 테이블과 동일)
--
-- 참고: 웹 백엔드 ensureWebChatSchema() 가 기동 시 아래를 자동 생성/보강한다.
--       이 파일은 수동 배포/검토용. (MariaDB / MySQL 8 모두 호환되도록 작성)

USE acore_characters;

-- 1) 채팅 제재 기록 (뮤트 / 웹밴) — 웹 차단 + 피제재자 사유 표기의 단일 소스.
--    mute 는 추가로 acore_auth.account.mutetime 에도 반영되어 인게임에도 적용된다(백엔드가 처리).
CREATE TABLE IF NOT EXISTS web_chat_penalties (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    target_acc      INT UNSIGNED    NOT NULL DEFAULT 0,   -- 피제재 계정 id
    target_name     VARCHAR(24)     NOT NULL DEFAULT '',  -- 표시용 캐릭터명
    kind            VARCHAR(16)     NOT NULL DEFAULT 'mute', -- 'mute' | 'webban'
    reason          VARCHAR(255)    NOT NULL DEFAULT '',
    minutes         INT             NOT NULL DEFAULT 0,    -- mute 지속(분), 0=영구(webban)
    created_by_acc  INT UNSIGNED    NOT NULL DEFAULT 0,    -- 제재자 계정 id
    created_by_name VARCHAR(32)     NOT NULL DEFAULT '',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME        NULL DEFAULT NULL,     -- NULL=영구, 그 외=해제 예정
    active          TINYINT         NOT NULL DEFAULT 1,    -- 0=해제됨
    PRIMARY KEY (id),
    KEY idx_pen_acc (target_acc, active),
    KEY idx_pen_expire (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) web_ingame_chat 삭제(숨김) 컬럼 — 모더레이터가 삭제한 메시지는 피드에서 제외.
--    [MariaDB] 아래 IF NOT EXISTS 구문 그대로 실행.
ALTER TABLE web_ingame_chat
    ADD COLUMN IF NOT EXISTS deleted    TINYINT      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS del_by     VARCHAR(32)  NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS del_reason VARCHAR(255) NOT NULL DEFAULT '';

-- [MySQL 8] IF NOT EXISTS(컬럼) 미지원. 위 구문이 에러나면 아래를 1회만 실행:
--   ALTER TABLE web_ingame_chat
--     ADD COLUMN deleted    TINYINT      NOT NULL DEFAULT 0,
--     ADD COLUMN del_by     VARCHAR(32)  NOT NULL DEFAULT '',
--     ADD COLUMN del_reason VARCHAR(255) NOT NULL DEFAULT '';

-- 3) 골드 변경 작업 큐 — 접속 중 캐릭터는 mod-web-chat 모듈이 폴링해 실시간 적용(SetMoney),
--    오프라인은 웹이 즉시 DB 갱신(모듈도 안전망으로 처리). 단위: copper(1골드=10000).
CREATE TABLE IF NOT EXISTS web_gold_ops (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    char_guid     INT UNSIGNED    NOT NULL DEFAULT 0,
    char_name     VARCHAR(24)     NOT NULL DEFAULT '',
    mode          VARCHAR(8)      NOT NULL DEFAULT 'add',   -- set | add | sub
    amount_copper BIGINT          NOT NULL DEFAULT 0,       -- 변경 크기(copper)
    reason        VARCHAR(255)    NOT NULL DEFAULT '',
    created_by    VARCHAR(32)     NOT NULL DEFAULT '',
    status        ENUM('pending','done','failed') NOT NULL DEFAULT 'pending',
    error         VARCHAR(255)    NOT NULL DEFAULT '',
    result_money  BIGINT          NOT NULL DEFAULT 0,       -- 적용 후 잔액(copper)
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at  DATETIME        NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_gold_status (status, id),
    KEY idx_gold_guid (char_guid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
