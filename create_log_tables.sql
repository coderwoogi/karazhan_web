-- ============================================================================
-- 관리자 "로그 목록" 화면 — 접속 보상 지급 / 우편 발송 기록 테이블
-- 대상 DB: acore_characters  (웹 백엔드 CharactersDSN 이 읽는 DB)
--
-- 실행 전 점검 결과 (2026-06-23):
--   * playtime_reward_log : acore_characters 에 없음        → 아래 CREATE 필요
--   * web_mail_log        : 존재하나 컬럼이 created_at 임   → sent_at 으로 변경 필요
--                           (코드는 sent_at 을 SELECT → "Unknown column 'sent_at'" 로 조회 실패)
--
-- 사용:  mysql -u root -p acore_characters < create_log_tables.sql
-- ============================================================================

USE acore_characters;

-- ----------------------------------------------------------------------------
-- 1) 접속 보상 지급 로그 (playtime_reward_log)
--    인게임(worldserver) 접속 보상 모듈이 INSERT 하고, 웹 관리자 화면이 읽는다.
--    웹 reader 는 id / character_name / reward_items / reward_level / claimed_at 만
--    사용하지만, 인게임 모듈 INSERT 와 호환되도록 전체 스키마로 생성한다.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `playtime_reward_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT 'Log entry ID',
  `player_guid` int unsigned NOT NULL COMMENT 'Player GUID',
  `character_name` varchar(12) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT 'Character name',
  `account_id` int unsigned NOT NULL COMMENT 'Account ID',
  `player_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '' COMMENT 'Player IP address',
  `reward_level` tinyint unsigned NOT NULL COMMENT 'Reward tier/level',
  `total_playtime_minutes` int unsigned NOT NULL COMMENT 'Total playtime in minutes',
  `required_playtime_minutes` int unsigned NOT NULL COMMENT 'Required playtime for this tier',
  `reward_items` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT 'JSON array of rewarded items [{entry, count}]',
  `reward_gold` int unsigned NOT NULL DEFAULT '0' COMMENT 'Gold reward (in copper)',
  `reward_experience` int unsigned NOT NULL DEFAULT '0' COMMENT 'Experience points rewarded',
  `reward_reputation` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT 'JSON array of reputation rewards [{faction, amount}]',
  `map_id` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'Map ID where claimed',
  `zone_id` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'Zone ID where claimed',
  `position_x` float NOT NULL DEFAULT '0' COMMENT 'X coordinate',
  `position_y` float NOT NULL DEFAULT '0' COMMENT 'Y coordinate',
  `position_z` float NOT NULL DEFAULT '0' COMMENT 'Z coordinate',
  `claimed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Claim timestamp',
  `result` enum('SUCCESS','FAILED') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'SUCCESS' COMMENT 'Claim result',
  `error_message` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'Error message if failed',
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_player` (`player_guid`) USING BTREE,
  KEY `idx_account` (`account_id`) USING BTREE,
  KEY `idx_reward_level` (`reward_level`) USING BTREE,
  KEY `idx_claimed_at` (`claimed_at`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci ROW_FORMAT=DYNAMIC COMMENT='Playtime reward claim log';

-- ----------------------------------------------------------------------------
-- 2) 우편 발송 기록 (web_mail_log)
--    웹에서 우편 발송 시 INSERT, 관리자 화면이 읽는다.
--    이미 테이블이 있으면 컬럼명만 코드(sent_at)에 맞춘다(데이터 보존).
--    신규 설치(테이블 없음)면 아래 CREATE 가 올바른 스키마로 만든다.
-- ----------------------------------------------------------------------------

-- (신규 설치용) 코드와 일치하는 스키마. 기존 테이블이 있으면 건너뜀.
CREATE TABLE IF NOT EXISTS `web_mail_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sender_username` varchar(64) NOT NULL,
  `receiver_name` varchar(32) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `body` text,
  `item_entry` int NOT NULL DEFAULT 0,
  `item_count` int NOT NULL DEFAULT 0,
  `gold` int NOT NULL DEFAULT 0,
  `ip_address` varchar(128) NOT NULL DEFAULT '',
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sender` (`sender_username`),
  KEY `idx_receiver` (`receiver_name`),
  KEY `idx_sent_at` (`sent_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='웹 우편 발송 기록';

-- (기존 테이블 보정) created_at → sent_at 로 컬럼명 변경. 데이터 보존.
--   이미 sent_at 으로 되어 있으면 이 줄은 "Unknown column 'created_at'" 오류가 나므로
--   그 경우 무시하면 된다(이미 정상).
ALTER TABLE `web_mail_log` CHANGE `created_at` `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
