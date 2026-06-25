-- ============================================================================
-- 웹 ↔ 인게임 채팅 브리지 (양방향)
--   web_ingame_chat   : 인게임 → 웹 (모듈이 OnPlayerChat 훅에서 INSERT, 웹이 폴링)
--   web_outgoing_chat : 웹 → 인게임 (웹이 INSERT, 모듈이 타이머로 폴링 후 채널 주입)
--
-- 대상 DB: acore_characters  (웹 CharactersDSN, 월드서버 캐릭터 DB 공유)
-- 적용:  mysql -u root -p acore_characters < create_web_chat_bridge.sql
--
-- chat_type 값: say | yell | whisper | guild | officer | party | raid
--               | channel | world | system
--   - channel 일 때 channel_name 사용(예: 'World', 'General - Stormwind')
--   - whisper 일 때 target_name(상대) 사용
-- ============================================================================

USE acore_characters;

-- 인게임 → 웹 (수신 적재)
CREATE TABLE IF NOT EXISTS `web_ingame_chat` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `chat_type`    VARCHAR(16)  NOT NULL DEFAULT 'say',
  `channel_name` VARCHAR(64)  NOT NULL DEFAULT '',
  `sender_guid`  INT UNSIGNED NOT NULL DEFAULT 0,
  `sender_name`  VARCHAR(24)  NOT NULL DEFAULT '',
  `sender_acc`   INT UNSIGNED NOT NULL DEFAULT 0,
  `sender_gm`    TINYINT      NOT NULL DEFAULT 0,    -- 발신자 GM 여부
  `target_name`  VARCHAR(24)  NOT NULL DEFAULT '',   -- 귓속말 수신자
  `language`     INT          NOT NULL DEFAULT 0,
  `message`      VARCHAR(512) NOT NULL DEFAULT '',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chat_created` (`created_at`),
  KEY `idx_chat_type` (`chat_type`),
  KEY `idx_chat_target` (`target_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 웹 → 인게임 (송신 큐)
CREATE TABLE IF NOT EXISTS `web_outgoing_chat` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `chat_type`    VARCHAR(16)  NOT NULL DEFAULT 'world',
  `channel_name` VARCHAR(64)  NOT NULL DEFAULT '',
  `target_name`  VARCHAR(24)  NOT NULL DEFAULT '',   -- 귓속말 수신자
  `sender_acc`   INT UNSIGNED NOT NULL DEFAULT 0,    -- 발신 관리자 계정(모듈이 대표 캐릭 해석)
  `sender_name`  VARCHAR(24)  NOT NULL DEFAULT '',   -- 웹에서 미리 해석한 대표 캐릭명(보조)
  `gm_mark`      TINYINT      NOT NULL DEFAULT 1,    -- GM 마크 표기 여부
  `message`      VARCHAR(512) NOT NULL DEFAULT '',
  `status`       ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `error`        VARCHAR(255) NOT NULL DEFAULT '',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at`      DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_out_status` (`status`, `id`),
  KEY `idx_out_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
