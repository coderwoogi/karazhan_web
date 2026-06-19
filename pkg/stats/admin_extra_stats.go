package stats

// 추가 운영 통계 핸들러 모음. 기존 handleStatsDashboard(계정/캐릭터/골드/아이템)에 더해
// 리텐션·경제·수익·콘텐츠·보안 5개 카테고리를 서브탭별 엔드포인트로 제공한다.
// 모든 추세(daily) 차트는 최근 30일 고정 윈도우 기준이며, 분포/스냅샷 차트는 현재 시점 기준이다.

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"karazhan/pkg/config"
	"net/http"
	"sort"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

// statDailyChart: (날짜문자열, 값) 행을 날짜 오름차순으로 정렬해 chartData로 만든다.
func statDailyChart(db *sql.DB, query string, args ...interface{}) chartData {
	cd := chartData{Labels: []string{}, Values: []int64{}}
	if db == nil {
		return cd
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return cd
	}
	defer rows.Close()
	type rec struct {
		d string
		v int64
	}
	tmp := make([]rec, 0, 32)
	for rows.Next() {
		var d sql.NullString
		var v int64
		if err := rows.Scan(&d, &v); err == nil {
			tmp = append(tmp, rec{d: d.String, v: v})
		}
	}
	sort.Slice(tmp, func(i, j int) bool { return tmp[i].d < tmp[j].d })
	for _, r := range tmp {
		cd.Labels = append(cd.Labels, r.d)
		cd.Values = append(cd.Values, r.v)
	}
	return cd
}

// statSimpleChart: (라벨, 값) 행을 그대로 chartData로. 라벨 NULL/공백은 (미지정).
func statSimpleChart(db *sql.DB, query string, args ...interface{}) chartData {
	cd := chartData{Labels: []string{}, Values: []int64{}}
	if db == nil {
		return cd
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return cd
	}
	defer rows.Close()
	for rows.Next() {
		var label sql.NullString
		var val int64
		if err := rows.Scan(&label, &val); err == nil {
			l := strings.TrimSpace(label.String)
			if l == "" {
				l = "(미지정)"
			}
			cd.Labels = append(cd.Labels, l)
			cd.Values = append(cd.Values, val)
		}
	}
	return cd
}

// statBucketChart: 정해진 순서의 버킷 라벨로 결과를 채운다(없는 버킷은 0).
func statBucketChart(db *sql.DB, order []string, query string, args ...interface{}) chartData {
	cd := chartData{Labels: []string{}, Values: []int64{}}
	m := map[string]int64{}
	if db != nil {
		if rows, err := db.Query(query, args...); err == nil {
			defer rows.Close()
			for rows.Next() {
				var b sql.NullString
				var v int64
				if rows.Scan(&b, &v) == nil {
					m[b.String] = v
				}
			}
		}
	}
	for _, k := range order {
		cd.Labels = append(cd.Labels, k)
		cd.Values = append(cd.Values, m[k])
	}
	return cd
}

func statScalar(db *sql.DB, query string, args ...interface{}) int64 {
	if db == nil {
		return 0
	}
	var v int64
	_ = db.QueryRow(query, args...).Scan(&v)
	return v
}

func statGold(copper int64) string {
	return fmt.Sprintf("%s골드", addThousands(copper/10000))
}

func addThousands(n int64) string {
	s := fmt.Sprintf("%d", n)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	if neg {
		return "-" + string(out)
	}
	return string(out)
}

func writeStatsJSON(w http.ResponseWriter, payload map[string]interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

// ===== A. 리텐션 / 활동 =====
func handleStatsRetention(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "stats") {
		return
	}
	out := map[string]interface{}{}

	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err == nil {
		defer authDB.Close()

		total := statScalar(authDB, "SELECT COUNT(*) FROM account")
		active7 := statScalar(authDB, "SELECT COUNT(*) FROM account WHERE last_login >= NOW() - INTERVAL 7 DAY")
		dormant30 := statScalar(authDB, "SELECT COUNT(*) FROM account WHERE last_login IS NOT NULL AND last_login < NOW() - INTERVAL 30 DAY")

		// D1/D7/D30 잔존율(%)
		rate := chartData{Labels: []string{"D1", "D7", "D30"}, Values: []int64{0, 0, 0}}
		var d1, d7, d30 int64
		_ = authDB.QueryRow(`
			SELECT
				IFNULL(ROUND(100*SUM(last_login >= joindate + INTERVAL 1 DAY)/COUNT(*)),0),
				IFNULL(ROUND(100*SUM(last_login >= joindate + INTERVAL 7 DAY)/COUNT(*)),0),
				IFNULL(ROUND(100*SUM(last_login >= joindate + INTERVAL 30 DAY)/COUNT(*)),0)
			FROM account WHERE joindate IS NOT NULL AND last_login IS NOT NULL`).Scan(&d1, &d7, &d30)
		rate.Values = []int64{d1, d7, d30}
		out["retentionRate"] = rate

		out["dormancy"] = statBucketChart(authDB,
			[]string{"활성(7일내)", "7-30일", "30-90일", "90일+"},
			`SELECT bucket, COUNT(*) FROM (
				SELECT CASE
					WHEN last_login >= NOW()-INTERVAL 7 DAY THEN '활성(7일내)'
					WHEN last_login >= NOW()-INTERVAL 30 DAY THEN '7-30일'
					WHEN last_login >= NOW()-INTERVAL 90 DAY THEN '30-90일'
					ELSE '90일+' END AS bucket
				FROM account WHERE last_login IS NOT NULL) t GROUP BY bucket`)

		out["summary"] = fmt.Sprintf("총 계정 %s · 활성(7일) %s · 휴면(30일+) %s · (최근 30일 기준 추세)",
			addThousands(total), addThousands(active7), addThousands(dormant30))
	}

	charDB, err := sql.Open("mysql", config.CharactersDSN())
	if err == nil {
		defer charDB.Close()

		out["altCount"] = statBucketChart(charDB,
			[]string{"1개", "2개", "3개", "4개", "5개+"},
			`SELECT bucket, COUNT(*) FROM (
				SELECT CASE WHEN c>=5 THEN '5개+' ELSE CONCAT(c,'개') END AS bucket
				FROM (SELECT account, COUNT(*) c FROM characters GROUP BY account) a) t GROUP BY bucket`)

		out["playtime"] = statBucketChart(charDB,
			[]string{"<1시간", "1-10시간", "10-50시간", "50-100시간", "100시간+"},
			`SELECT bucket, COUNT(*) FROM (
				SELECT CASE
					WHEN totaltime < 3600 THEN '<1시간'
					WHEN totaltime < 36000 THEN '1-10시간'
					WHEN totaltime < 180000 THEN '10-50시간'
					WHEN totaltime < 360000 THEN '50-100시간'
					ELSE '100시간+' END AS bucket
				FROM characters) t GROUP BY bucket`)

		// 시간대(0~23시)별 마지막 접속 분포
		hourly := chartData{Labels: make([]string, 0, 24), Values: make([]int64, 24)}
		for h := 0; h < 24; h++ {
			hourly.Labels = append(hourly.Labels, fmt.Sprintf("%d시", h))
		}
		if rows, qerr := charDB.Query("SELECT HOUR(FROM_UNIXTIME(logout_time)) h, COUNT(*) FROM characters WHERE logout_time > 0 GROUP BY h"); qerr == nil {
			defer rows.Close()
			for rows.Next() {
				var h, c int64
				if rows.Scan(&h, &c) == nil && h >= 0 && h < 24 {
					hourly.Values[h] = c
				}
			}
		}
		out["hourly"] = hourly
	}

	writeStatsJSON(w, out)
}

// ===== B. 경제 동향 =====
func handleStatsEconomy(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "stats") {
		return
	}
	out := map[string]interface{}{}

	charDB, err := sql.Open("mysql", config.CharactersDSN())
	if err == nil {
		defer charDB.Close()

		totalGold := statScalar(charDB, "SELECT IFNULL(SUM(money),0) FROM characters")
		moved30 := statScalar(charDB, "SELECT IFNULL(SUM(money),0) FROM log_money WHERE date >= NOW() - INTERVAL 30 DAY")

		out["goldDaily"] = statDailyChart(charDB,
			`SELECT DATE(date), IFNULL(SUM(money),0) FROM log_money WHERE date >= NOW() - INTERVAL 30 DAY GROUP BY DATE(date)`)
		out["goldReceivers"] = statSimpleChart(charDB,
			`SELECT receiver_name, IFNULL(SUM(money),0) m FROM log_money WHERE date >= NOW() - INTERVAL 30 DAY AND receiver_name <> '' GROUP BY receiver_name ORDER BY m DESC LIMIT 10`)
		out["mailDaily"] = statDailyChart(charDB,
			`SELECT DATE(FROM_UNIXTIME(deliver_time)), COUNT(*) FROM mail WHERE deliver_time >= UNIX_TIMESTAMP(NOW() - INTERVAL 30 DAY) GROUP BY DATE(FROM_UNIXTIME(deliver_time))`)

		out["summary"] = fmt.Sprintf("총 보유 골드 %s · 최근 30일 골드 이동 %s", statGold(totalGold), statGold(moved30))
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		out["coinMarketDaily"] = statDailyChart(updateDB,
			`SELECT DATE(created_at), IFNULL(SUM(gold_copper),0) FROM point_coin_market_listings WHERE buyer_user_id > 0 AND created_at >= NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at)`)
	}

	writeStatsJSON(w, out)
}

// ===== C. 수익 / 구독 =====
func handleStatsRevenue(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "stats") {
		return
	}
	out := map[string]interface{}{}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		ensurePointShopTables(updateDB)

		out["pointSpentDaily"] = statDailyChart(updateDB,
			`SELECT DATE(created_at), IFNULL(SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END),0) FROM user_point_logs WHERE created_at >= NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at)`)
		out["shopRevenueDaily"] = statDailyChart(updateDB,
			`SELECT DATE(created_at), IFNULL(SUM(total_price),0) FROM point_shop_orders WHERE status='completed' AND created_at >= NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at)`)
		out["topProducts"] = statSimpleChart(updateDB,
			`SELECT item_name, IFNULL(SUM(qty),0) q FROM point_shop_orders WHERE status='completed' GROUP BY item_name ORDER BY q DESC LIMIT 10`)
		out["orderStatus"] = statSimpleChart(updateDB,
			`SELECT status, COUNT(*) FROM point_shop_orders GROUP BY status ORDER BY COUNT(*) DESC`)
		out["activeSubs"] = statSimpleChart(updateDB,
			`SELECT feature_code, COUNT(*) FROM web_feature_subscriptions WHERE expires_at > NOW() GROUP BY feature_code ORDER BY COUNT(*) DESC`)

		spentTotal := statScalar(updateDB, "SELECT IFNULL(SUM(CASE WHEN amount<0 THEN -amount ELSE 0 END),0) FROM user_point_logs")
		revenue30 := statScalar(updateDB, "SELECT IFNULL(SUM(total_price),0) FROM point_shop_orders WHERE status='completed' AND created_at >= NOW() - INTERVAL 30 DAY")
		activeSub := statScalar(updateDB, "SELECT COUNT(*) FROM web_feature_subscriptions WHERE expires_at > NOW()")
		refunds := statScalar(updateDB, "SELECT COUNT(*) FROM point_shop_orders WHERE is_refunded=1 OR status='refunded'")
		out["summary"] = fmt.Sprintf("누적 포인트 소비 %s · 최근 30일 매출 %s pt · 활성 구독 %s · 환불 %s건",
			addThousands(spentTotal), addThousands(revenue30), addThousands(activeSub), addThousands(refunds))
	}

	writeStatsJSON(w, out)
}

// ===== D. 콘텐츠 참여 =====
func handleStatsContent(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "stats") {
		return
	}
	out := map[string]interface{}{}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		out["drawDaily"] = statDailyChart(updateDB,
			`SELECT DATE(created_at), COUNT(*) FROM carddraw_draw_logs WHERE created_at >= NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at)`)
		out["drawRarity"] = statSimpleChart(updateDB,
			`SELECT reward_rarity, COUNT(*) FROM carddraw_draw_logs GROUP BY reward_rarity ORDER BY COUNT(*) DESC`)
		out["boardDaily"] = statDailyChart(updateDB,
			`SELECT DATE(created_at), COUNT(*) FROM web_posts WHERE created_at >= NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at)`)
		draws30 := statScalar(updateDB, "SELECT COUNT(*) FROM carddraw_draw_logs WHERE created_at >= NOW() - INTERVAL 30 DAY")
		posts30 := statScalar(updateDB, "SELECT COUNT(*) FROM web_posts WHERE created_at >= NOW() - INTERVAL 30 DAY")
		out["summaryDraws"] = draws30
		out["summaryPosts"] = posts30
	}

	charDB, err := sql.Open("mysql", config.CharactersDSN())
	if err == nil {
		defer charDB.Close()
		out["encounterDaily"] = statDailyChart(charDB,
			`SELECT DATE(time), COUNT(*) FROM log_encounter WHERE time >= NOW() - INTERVAL 30 DAY GROUP BY DATE(time)`)
		out["pvpDaily"] = statDailyChart(charDB,
			`SELECT DATE(date), COUNT(*) FROM pvpstats_battlegrounds WHERE date >= NOW() - INTERVAL 30 DAY GROUP BY DATE(date)`)
		out["guildTop"] = statSimpleChart(charDB,
			`SELECT g.name, COUNT(*) c FROM guild_member gm JOIN guild g ON g.guildid = gm.guildid GROUP BY gm.guildid, g.name ORDER BY c DESC LIMIT 10`)
		guilds := statScalar(charDB, "SELECT COUNT(*) FROM guild")
		enc30 := statScalar(charDB, "SELECT COUNT(*) FROM log_encounter WHERE time >= NOW() - INTERVAL 30 DAY")
		draws, _ := out["summaryDraws"].(int64)
		posts, _ := out["summaryPosts"].(int64)
		out["summary"] = fmt.Sprintf("최근 30일 뽑기 %s · 던전 클리어 %s · 길드 %s · 게시글 %s",
			addThousands(draws), addThousands(enc30), addThousands(guilds), addThousands(posts))
	}
	delete(out, "summaryDraws")
	delete(out, "summaryPosts")

	writeStatsJSON(w, out)
}

// ===== E. 보안 / 운영 =====
func handleStatsSecurity(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "stats") {
		return
	}
	out := map[string]interface{}{}

	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err == nil {
		defer authDB.Close()

		out["sharedIp"] = statSimpleChart(authDB,
			`SELECT last_ip, COUNT(*) c FROM account WHERE last_ip NOT IN ('','0.0.0.0','127.0.0.1') GROUP BY last_ip HAVING c > 1 ORDER BY c DESC LIMIT 10`)
		out["failedLogins"] = statSimpleChart(authDB,
			`SELECT username, failed_logins FROM account WHERE failed_logins > 0 ORDER BY failed_logins DESC LIMIT 10`)
		out["banDaily"] = statDailyChart(authDB,
			`SELECT DATE(FROM_UNIXTIME(bandate)), COUNT(*) FROM account_banned WHERE bandate >= UNIX_TIMESTAMP(NOW() - INTERVAL 30 DAY) GROUP BY DATE(FROM_UNIXTIME(bandate))`)

		bans := statScalar(authDB, "SELECT COUNT(*) FROM account_banned WHERE active=1")
		mutes := statScalar(authDB, "SELECT COUNT(*) FROM account WHERE mutetime > UNIX_TIMESTAMP()")
		ipbans := statScalar(authDB, "SELECT COUNT(*) FROM ip_banned WHERE unbandate = 0 OR unbandate > UNIX_TIMESTAMP()")
		out["sanctions"] = chartData{Labels: []string{"계정 밴", "뮤트", "IP 밴"}, Values: []int64{bans, mutes, ipbans}}

		sharedGroups := statScalar(authDB, `SELECT COUNT(*) FROM (SELECT last_ip FROM account WHERE last_ip NOT IN ('','0.0.0.0','127.0.0.1') GROUP BY last_ip HAVING COUNT(*) > 1) t`)
		out["summary"] = fmt.Sprintf("활성 밴 %s · 뮤트 %s · IP밴 %s · 공유 IP 계정군 %s",
			addThousands(bans), addThousands(mutes), addThousands(ipbans), addThousands(sharedGroups))
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()
		out["recoveryDaily"] = statDailyChart(updateDB,
			`SELECT DATE(created_at), COUNT(*) FROM web_account_recovery_requests WHERE created_at >= NOW() - INTERVAL 30 DAY GROUP BY DATE(created_at)`)
		out["downtime"] = statSimpleChart(updateDB,
			`SELECT shutdown_type, COUNT(*) FROM world_server_shutdown_log GROUP BY shutdown_type ORDER BY COUNT(*) DESC`)
	}

	writeStatsJSON(w, out)
}
