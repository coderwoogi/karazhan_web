package stats

// 골드 급증 감지 (방법 A: 잔액 스냅샷 비교)
//   - 주기적으로 characters.money 를 web_gold_balance 에 스냅샷한다.
//   - 직전 스냅샷 대비 임계값(기본 1,000골드) 이상 증가한 캐릭터를 web_gold_surge_log 에 기록한다.
//   - 대시보드는 web_gold_surge_log 의 최근 항목을 표시한다.
// 주의: 스냅샷 비교 방식이라 서버 기동(배포) 시점부터 누적되며, 과거 소급은 불가하다.

import (
	"database/sql"
	"karazhan/pkg/config"
	"log"
	"time"
)

const (
	// 골드 급증 임계값: 1,000골드 = 10,000,000 copper (1골드 = 10,000 copper)
	goldSurgeThresholdCopper int64 = 10_000_000
	// 스냅샷 샘플링 간격
	goldSurgeInterval = 30 * time.Minute
)

// 스냅샷/급증 로그 테이블을 characters DB 에 생성(없으면).
func ensureGoldSurgeSchema() {
	db, err := sql.Open("mysql", config.CharactersDSN())
	if err != nil {
		return
	}
	defer db.Close()

	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_gold_balance (
			guid INT UNSIGNED NOT NULL,
			name VARCHAR(24) NOT NULL DEFAULT '',
			money BIGINT UNSIGNED NOT NULL DEFAULT 0,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (guid)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_gold_surge_log (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			guid INT UNSIGNED NOT NULL,
			name VARCHAR(24) NOT NULL DEFAULT '',
			account_id INT UNSIGNED NOT NULL DEFAULT 0,
			prev_money BIGINT UNSIGNED NOT NULL DEFAULT 0,
			new_money BIGINT UNSIGNED NOT NULL DEFAULT 0,
			delta BIGINT NOT NULL DEFAULT 0,
			detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			INDEX idx_gold_surge_detected (detected_at),
			INDEX idx_gold_surge_guid (guid)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	// 유저(비-GM) 전체 골드 소지량 일별 스냅샷. 날짜를 PK로 두고 매 샘플마다 upsert →
	// 그날 마지막 실행(23:59 직전) 값이 사실상 일자별 종가가 된다.
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS web_gold_daily_total (
			snapshot_date DATE NOT NULL,
			total_money BIGINT UNSIGNED NOT NULL DEFAULT 0,
			char_count INT UNSIGNED NOT NULL DEFAULT 0,
			recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (snapshot_date)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
}

// 백그라운드 샘플러 시작. 기동 직후 1회(베이스라인 시드) 후 주기 실행.
func startGoldSurgeSampler() {
	go func() {
		db, err := sql.Open("mysql", config.CharactersDSN())
		if err != nil {
			log.Printf("[GoldSurge] DB open error: %v", err)
			return
		}
		db.SetMaxOpenConns(2)
		db.SetConnMaxIdleTime(5 * time.Minute)

		// 기동 직후 부하/초기화 타이밍 회피용 지연. 첫 스캔은 베이스라인만 채우고 급증 0건.
		time.Sleep(20 * time.Second)
		runGoldSurgeScan(db)

		ticker := time.NewTicker(goldSurgeInterval)
		defer ticker.Stop()
		for range ticker.C {
			runGoldSurgeScan(db)
		}
	}()
}

// 1) 직전 스냅샷 대비 임계값 이상 증가분을 surge 로그에 적재
// 2) 현재 잔액으로 스냅샷 갱신
func runGoldSurgeScan(db *sql.DB) {
	// 1) 급증 감지 — 베이스라인(b)이 있는 캐릭터만. unsigned 언더플로 방지 위해 SIGNED 캐스팅.
	res, err := db.Exec(`
		INSERT INTO web_gold_surge_log (guid, name, account_id, prev_money, new_money, delta)
		SELECT c.guid, c.name, c.account, b.money, c.money,
		       (CAST(c.money AS SIGNED) - CAST(b.money AS SIGNED))
		FROM characters c
		JOIN web_gold_balance b ON b.guid = c.guid
		WHERE (CAST(c.money AS SIGNED) - CAST(b.money AS SIGNED)) >= ?`,
		goldSurgeThresholdCopper)
	if err != nil {
		log.Printf("[GoldSurge] detect error: %v", err)
	} else if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("[GoldSurge] %d surge(s) detected (>= %d copper)", n, goldSurgeThresholdCopper)
	}

	// 2) 스냅샷 갱신 — 현재 모든 캐릭터 잔액.
	if _, err := db.Exec(`
		INSERT INTO web_gold_balance (guid, name, money, updated_at)
		SELECT guid, name, money, NOW() FROM characters
		ON DUPLICATE KEY UPDATE money = VALUES(money), name = VALUES(name), updated_at = NOW()`); err != nil {
		log.Printf("[GoldSurge] snapshot upsert error: %v", err)
	}

	// 3) 유저(비-GM) 전체 골드 소지량 일별 스냅샷 — 오늘 날짜 행 upsert.
	if _, err := db.Exec(`
		INSERT INTO web_gold_daily_total (snapshot_date, total_money, char_count, recorded_at)
		SELECT CURDATE(), IFNULL(SUM(c.money),0), COUNT(*), NOW()
		FROM characters c
		LEFT JOIN acore_auth.account_access aa ON aa.id = c.account
		WHERE aa.id IS NULL
		ON DUPLICATE KEY UPDATE total_money = VALUES(total_money), char_count = VALUES(char_count), recorded_at = NOW()`); err != nil {
		log.Printf("[GoldSurge] daily total upsert error: %v", err)
	}
}

// 유저 전체 골드 소지량 일별 추이 — 최근 days일, 골드 단위(copper/10000)로 반환.
func dailyGoldTotals(db *sql.DB, days int) chartData {
	cd := chartData{Labels: make([]string, 0), Values: make([]int64, 0)}
	if db == nil {
		return cd
	}
	rows, err := db.Query(`
		SELECT DATE_FORMAT(snapshot_date, '%Y-%m-%d'), FLOOR(total_money/10000)
		FROM web_gold_daily_total
		WHERE snapshot_date >= CURDATE() - INTERVAL ? DAY
		ORDER BY snapshot_date ASC`, days)
	if err != nil {
		return cd
	}
	defer rows.Close()
	for rows.Next() {
		var d string
		var goldTotal int64
		if rows.Scan(&d, &goldTotal) != nil {
			continue
		}
		cd.Labels = append(cd.Labels, d)
		cd.Values = append(cd.Values, goldTotal)
	}
	return cd
}

// 대시보드용 최근 급증 목록(최근 days일, 최대 limit건).
func recentGoldSurges(db *sql.DB, days, limit int) []map[string]interface{} {
	out := make([]map[string]interface{}, 0)
	if db == nil {
		return out
	}
	rows, err := db.Query(`
		SELECT name, prev_money, new_money, delta, detected_at
		FROM web_gold_surge_log
		WHERE detected_at >= NOW() - INTERVAL ? DAY
		ORDER BY detected_at DESC, delta DESC
		LIMIT ?`, days, limit)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var name, detectedAt string
		var prev, newMoney, delta int64
		if rows.Scan(&name, &prev, &newMoney, &delta, &detectedAt) != nil {
			continue
		}
		out = append(out, map[string]interface{}{
			"name": name, "prev": prev, "new": newMoney, "delta": delta, "detected_at": detectedAt,
		})
	}
	return out
}

// 골드 순위 — GM 계정(account_access 보유) 제외, 보유 골드 상위 limit명.
func goldRankingTop(db *sql.DB, limit int) []map[string]interface{} {
	out := make([]map[string]interface{}, 0)
	if db == nil {
		return out
	}
	rows, err := db.Query(`
		SELECT c.name, c.money
		FROM characters c
		LEFT JOIN acore_auth.account_access aa ON aa.id = c.account
		WHERE aa.id IS NULL
		ORDER BY c.money DESC
		LIMIT ?`, limit)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		var money int64
		if rows.Scan(&name, &money) != nil {
			continue
		}
		out = append(out, map[string]interface{}{"name": name, "money": money})
	}
	return out
}

// 유저 골드 소지량 분포 — GM 제외, copper 기준 구간별 캐릭터 수.
func goldDistribution(db *sql.DB) chartData {
	labels := []string{"0골드", "~100골드", "100~1천골드", "1천~1만골드", "1만~5만골드", "5만골드+"}
	cd := chartData{Labels: labels, Values: make([]int64, len(labels))}
	if db == nil {
		return cd
	}
	rows, err := db.Query(`
		SELECT b, COUNT(*) FROM (
			SELECT CASE
				WHEN c.money = 0 THEN 0
				WHEN c.money < 1000000 THEN 1
				WHEN c.money < 10000000 THEN 2
				WHEN c.money < 100000000 THEN 3
				WHEN c.money < 500000000 THEN 4
				ELSE 5
			END AS b
			FROM characters c
			LEFT JOIN acore_auth.account_access aa ON aa.id = c.account
			WHERE aa.id IS NULL
		) t GROUP BY b`)
	if err != nil {
		return cd
	}
	defer rows.Close()
	for rows.Next() {
		var b, cnt int64
		if rows.Scan(&b, &cnt) == nil && b >= 0 && int(b) < len(labels) {
			cd.Values[b] = cnt
		}
	}
	return cd
}
