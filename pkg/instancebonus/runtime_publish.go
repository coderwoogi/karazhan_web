package instancebonus

// 관리 테이블(instance_bonus_mission / instance_bonus_theme / instance_bonus_theme_mission_link)의
// 발행 내용을 게임 워드서버가 실제로 읽는 런타임 풀 테이블로 즉시 반영한다.
//   - instance_bonus_mission        -> instance_bonus_mission_pool
//   - instance_bonus_theme          -> instance_bonus_theme_pool
//   - instance_bonus_theme_mission_link -> instance_bonus_theme_mission
// 보상(reward_profile/tier)·맵(map_config)은 런타임과 동일 테이블을 공유하므로 별도 브리지가 필요 없다.
//
// 저장/수정/삭제 시 해당 항목만 비파괴적으로 upsert(REPLACE) 하므로 관리되지 않는 기존 풀 행을
// 임의로 삭제하지 않는다. 관리자가 "서버 반영(전체 동기화)"를 호출하면 발행+활성 상태로 풀을 재구성한다.
//
// 주의: 워드서버가 풀 테이블을 인스턴스 시작마다 실시간 조회하면 이 DB 반영만으로 즉시 적용된다.
// 시작 시 캐싱하는 모듈이라면 별도의 reload 명령이 추가로 필요하다(서버 모듈 동작 방식에 따라 결정).

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
)

// instance_bonus_mission -> instance_bonus_mission_pool 매핑 INSERT 본문.
// reward_item/reward_count는 미션의 reward_profile 첫 아이템에서 유도(없으면 0).
const missionPoolSelectSQL = `INTO instance_bonus_mission_pool
		(map_id, mission_id, mission_type, difficulty_mask, target_entry, target_count, time_limit_sec, title, target_label, fallback_announcement, reward_item, reward_count, enabled)
		SELECT m.map_id, m.mission_id, m.mission_type, m.difficulty_mask, m.target_entry, m.target_count, m.time_limit_sec,
			m.name, IFNULL(m.target_label, ''), IFNULL(m.briefing_text, ''),
			IFNULL((SELECT i.item_entry FROM instance_bonus_reward_profile_item i WHERE i.reward_profile_id = m.reward_profile_id ORDER BY i.sort_order ASC, i.item_id ASC LIMIT 1), 0),
			IFNULL((SELECT i.item_count FROM instance_bonus_reward_profile_item i WHERE i.reward_profile_id = m.reward_profile_id ORDER BY i.sort_order ASC, i.item_id ASC LIMIT 1), 0),
			m.enabled
		FROM instance_bonus_mission m`

const themePoolSelectSQL = `INTO instance_bonus_theme_pool
		(map_id, theme_id, theme_key, name, description, difficulty_mask, min_party_size, max_party_size, min_avg_item_level, max_avg_item_level, required_tank, required_healer, weight, enabled)
		SELECT t.map_id, t.theme_id, t.theme_key, t.name, IFNULL(t.description, ''), t.difficulty_mask, t.min_party_size, t.max_party_size, t.min_avg_item_level, t.max_avg_item_level, t.required_tank, t.required_healer, t.weight, t.enabled
		FROM instance_bonus_theme t`

// syncMissionToRuntime: 미션 한 건을 mission_pool에 upsert. 발행이 아니거나 행이 없으면 풀에서 제거한다.
func syncMissionToRuntime(missionID int64) {
	if worldDB == nil || missionID <= 0 {
		return
	}
	var mapID int64
	var publish string
	err := worldDB.QueryRow(
		fmt.Sprintf("SELECT map_id, %s FROM instance_bonus_mission WHERE mission_id=?", missionPublishExpr("")),
		missionID,
	).Scan(&mapID, &publish)
	if err == sql.ErrNoRows {
		_, _ = worldDB.Exec("DELETE FROM instance_bonus_mission_pool WHERE mission_id=?", missionID)
		return
	}
	if err != nil {
		log.Printf("[instancebonus] syncMissionToRuntime lookup mission_id=%d err=%v", missionID, err)
		return
	}
	if publish != "published" {
		_, _ = worldDB.Exec("DELETE FROM instance_bonus_mission_pool WHERE map_id=? AND mission_id=?", mapID, missionID)
		return
	}
	if _, err := worldDB.Exec("REPLACE "+missionPoolSelectSQL+" WHERE m.mission_id=?", missionID); err != nil {
		log.Printf("[instancebonus] syncMissionToRuntime upsert mission_id=%d err=%v", missionID, err)
	}
}

// syncThemeToRuntime: 테마 한 건을 theme_pool에 upsert하고 해당 테마의 미션 링크도 재구성한다.
func syncThemeToRuntime(themeID int64) {
	if worldDB == nil || themeID <= 0 {
		return
	}
	if _, err := worldDB.Exec("REPLACE "+themePoolSelectSQL+" WHERE t.theme_id=?", themeID); err != nil {
		log.Printf("[instancebonus] syncThemeToRuntime theme_id=%d err=%v", themeID, err)
	}
	syncThemeLinksToRuntime(themeID)
}

// syncThemeLinksToRuntime: 한 테마의 런타임 미션 링크(instance_bonus_theme_mission)를 재구성한다.
// 활성 링크 중 미션이 풀에 존재하는 것만 반영한다.
func syncThemeLinksToRuntime(themeID int64) {
	if worldDB == nil || themeID <= 0 {
		return
	}
	var mapID int64
	if err := worldDB.QueryRow("SELECT map_id FROM instance_bonus_theme WHERE theme_id=?", themeID).Scan(&mapID); err != nil {
		return
	}
	if _, err := worldDB.Exec("DELETE FROM instance_bonus_theme_mission WHERE theme_id=?", themeID); err != nil {
		log.Printf("[instancebonus] syncThemeLinks clear theme_id=%d err=%v", themeID, err)
		return
	}
	if _, err := worldDB.Exec(`
		INSERT INTO instance_bonus_theme_mission (map_id, theme_id, mission_id, slot, required)
		SELECT t.map_id, l.theme_id, l.mission_id, l.slot, l.required
		FROM instance_bonus_theme_mission_link l
		JOIN instance_bonus_theme t ON t.theme_id = l.theme_id
		WHERE l.theme_id = ? AND l.enabled = 1
		  AND EXISTS (SELECT 1 FROM instance_bonus_mission_pool p WHERE p.map_id = t.map_id AND p.mission_id = l.mission_id)`,
		themeID); err != nil {
		log.Printf("[instancebonus] syncThemeLinks rebuild theme_id=%d err=%v", themeID, err)
	}
}

type runtimePublishSummary struct {
	Missions int64 `json:"missions"`
	Themes   int64 `json:"themes"`
	Links    int64 `json:"links"`
}

// republishAllToRuntime: 발행+활성 상태 기준으로 풀 테이블 전체를 트랜잭션 내에서 재구성한다.
// (InnoDB MVCC로 커밋 전까지 워드서버는 기존 스냅샷을 보므로 빈 구간이 노출되지 않는다.)
func republishAllToRuntime() (runtimePublishSummary, error) {
	var sum runtimePublishSummary
	if worldDB == nil {
		return sum, fmt.Errorf("world db unavailable")
	}
	tx, err := worldDB.Begin()
	if err != nil {
		return sum, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM instance_bonus_theme_mission"); err != nil {
		return sum, err
	}
	if _, err := tx.Exec("DELETE FROM instance_bonus_mission_pool"); err != nil {
		return sum, err
	}
	if _, err := tx.Exec("DELETE FROM instance_bonus_theme_pool"); err != nil {
		return sum, err
	}

	mres, err := tx.Exec("INSERT " + missionPoolSelectSQL + fmt.Sprintf(" WHERE %s = 'published'", missionPublishExpr("m")))
	if err != nil {
		return sum, err
	}
	sum.Missions, _ = mres.RowsAffected()

	tres, err := tx.Exec("INSERT " + themePoolSelectSQL)
	if err != nil {
		return sum, err
	}
	sum.Themes, _ = tres.RowsAffected()

	lres, err := tx.Exec(`
		INSERT INTO instance_bonus_theme_mission (map_id, theme_id, mission_id, slot, required)
		SELECT t.map_id, l.theme_id, l.mission_id, l.slot, l.required
		FROM instance_bonus_theme_mission_link l
		JOIN instance_bonus_theme t ON t.theme_id = l.theme_id
		WHERE l.enabled = 1
		  AND EXISTS (SELECT 1 FROM instance_bonus_mission_pool p WHERE p.map_id = t.map_id AND p.mission_id = l.mission_id)`)
	if err != nil {
		return sum, err
	}
	sum.Links, _ = lres.RowsAffected()

	if err := tx.Commit(); err != nil {
		return sum, err
	}
	return sum, nil
}

// handleRuntimePublish: 관리자 "서버 반영(전체 동기화)" 엔드포인트.
func handleRuntimePublish(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) || worldDB == nil {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "지원하지 않는 요청 방식입니다", http.StatusMethodNotAllowed)
		return
	}
	sum, err := republishAllToRuntime()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "summary": sum})
}
