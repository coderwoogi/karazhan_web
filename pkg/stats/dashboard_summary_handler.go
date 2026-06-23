package stats

// 관리자 홈(운영 대시보드)용 요약 엔드포인트.
// KPI + 처리 대기 큐 + 추세/분포 차트 데이터를 한 번의 호출로 반환한다.
// 홈 탭은 일반 유저와 공유되므로 webRank>=2 관리자 전용으로 가드한다.
// 그래프 데이터는 기존 통계 핸들러(retention/economy/revenue/content/security)와 동일한 쿼리를 사용한다.

import (
	"database/sql"
	"fmt"
	"net/http"

	"karazhan/pkg/config"
)

func handleAdminDashboardSummary(w http.ResponseWriter, r *http.Request) {
	if !checkAdminAuth(w, r, 2) {
		return
	}

	kpi := map[string]interface{}{}
	queue := map[string]interface{}{}
	charts := map[string]interface{}{}
	ingame := map[string]interface{}{}
	goldSurges := []map[string]interface{}{}
	goldRanking := []map[string]interface{}{}
	var goldDist chartData
	var goldDailyTotal chartData
	retention := map[string]interface{}{"d1": int64(0), "d7": int64(0), "d30": int64(0)}

	// ── update DB: 매출/구독/주문/게시판 큐 + 매출·뽑기·암시장 추세 ──
	if updateDB, err := sql.Open("mysql", updateDSN); err == nil {
		defer updateDB.Close()

		kpi["revenueToday"] = statScalar(updateDB,
			"SELECT IFNULL(SUM(total_price),0) FROM point_shop_orders WHERE status='completed' AND created_at >= CURDATE()")
		kpi["revenue30"] = statScalar(updateDB,
			"SELECT IFNULL(SUM(total_price),0) FROM point_shop_orders WHERE status='completed' AND created_at >= NOW() - INTERVAL 30 DAY")
		kpi["activeSubs"] = statScalar(updateDB,
			"SELECT COUNT(*) FROM web_feature_subscriptions WHERE expires_at > NOW()")

		queue["orders"] = statScalar(updateDB,
			"SELECT COUNT(*) FROM point_shop_orders WHERE status='pending'")
		queue["inquiries"] = statScalar(updateDB,
			"SELECT COUNT(*) FROM web_posts WHERE board_id='inquiry' AND IFNULL(inquiry_status,'') NOT IN ('done','point_paid')")
		queue["bugs"] = statScalar(updateDB,
			"SELECT COUNT(*) FROM web_posts WHERE board_id='bugreport' AND IFNULL(inquiry_status,'') NOT IN ('done','point_paid')")
		queue["promoReview"] = statScalar(updateDB,
			"SELECT COUNT(*) FROM web_posts WHERE board_id='promotion' AND IFNULL(promo_review_status,'pending')='pending'")
		queue["promoReward"] = statScalar(updateDB,
			"SELECT COUNT(*) FROM web_posts WHERE board_id='promotion' AND IFNULL(promo_review_status,'pending')='approved' AND id NOT IN (SELECT post_id FROM web_promotion_reward_log)")

		charts["revenueDaily"] = statDailyChart(updateDB,
			"SELECT DATE(created_at), IFNULL(SUM(total_price),0) FROM point_shop_orders WHERE status='completed' AND created_at >= NOW() - INTERVAL 13 DAY GROUP BY DATE(created_at)")
		charts["drawDaily"] = statDailyChart(updateDB,
			"SELECT DATE(created_at), COUNT(*) FROM carddraw_draw_logs WHERE created_at >= NOW() - INTERVAL 13 DAY GROUP BY DATE(created_at)")
		charts["drawRarity"] = statSimpleChart(updateDB,
			"SELECT reward_rarity, COUNT(*) FROM carddraw_draw_logs GROUP BY reward_rarity ORDER BY COUNT(*) DESC")
		charts["topProducts"] = statSimpleChart(updateDB,
			"SELECT item_name, IFNULL(SUM(qty),0) q FROM point_shop_orders WHERE status='completed' GROUP BY item_name ORDER BY q DESC LIMIT 5")
		charts["coinMarketDaily"] = statDailyChart(updateDB,
			"SELECT DATE(created_at), IFNULL(SUM(gold_copper),0) FROM point_coin_market_listings WHERE buyer_user_id > 0 AND created_at >= NOW() - INTERVAL 13 DAY GROUP BY DATE(created_at)")
	}

	// ── auth DB: 가입/계정/제재/리텐션/가입·로그인 추세 ──
	if authDB, err := sql.Open("mysql", config.AuthDSN()); err == nil {
		defer authDB.Close()

		kpi["signupToday"] = statScalar(authDB, "SELECT COUNT(*) FROM account WHERE joindate >= CURDATE()")
		kpi["accountsTotal"] = statScalar(authDB, "SELECT COUNT(*) FROM account")

		// 제재(활성 밴 + 뮤트 + IP 밴) — security 핸들러와 동일 기준
		bans := statScalar(authDB, "SELECT COUNT(*) FROM account_banned WHERE active=1")
		mutes := statScalar(authDB, "SELECT COUNT(*) FROM account WHERE mutetime > UNIX_TIMESTAMP()")
		ipbans := statScalar(authDB, "SELECT COUNT(*) FROM ip_banned WHERE unbandate = 0 OR unbandate > UNIX_TIMESTAMP()")
		kpi["sanctionsActive"] = bans + mutes + ipbans
		charts["sanctions"] = chartData{Labels: []string{"계정 밴", "뮤트", "IP 밴"}, Values: []int64{bans, mutes, ipbans}}

		// D1/D7/D30 잔존율(%) — retention 핸들러와 동일 쿼리
		var d1, d7, d30 int64
		_ = authDB.QueryRow(`
			SELECT
				IFNULL(ROUND(100*SUM(last_login >= joindate + INTERVAL 1 DAY)/COUNT(*)),0),
				IFNULL(ROUND(100*SUM(last_login >= joindate + INTERVAL 7 DAY)/COUNT(*)),0),
				IFNULL(ROUND(100*SUM(last_login >= joindate + INTERVAL 30 DAY)/COUNT(*)),0)
			FROM account WHERE joindate IS NOT NULL AND last_login IS NOT NULL`).Scan(&d1, &d7, &d30)
		retention["d1"], retention["d7"], retention["d30"] = d1, d7, d30
		kpi["retentionD7"] = d7

		charts["signupDaily"] = statDailyChart(authDB,
			"SELECT DATE(joindate), COUNT(*) FROM account WHERE joindate >= NOW() - INTERVAL 13 DAY GROUP BY DATE(joindate)")
		charts["loginDaily"] = statDailyChart(authDB,
			"SELECT DATE(last_login), COUNT(*) FROM account WHERE last_login >= NOW() - INTERVAL 13 DAY GROUP BY DATE(last_login)")
	}

	// ── characters DB: 현재 접속 + 골드 추세 + 시간대별 접속 분포 ──
	if charDB, err := sql.Open("mysql", config.CharactersDSN()); err == nil {
		defer charDB.Close()

		kpi["online"] = statScalar(charDB, "SELECT COUNT(*) FROM characters WHERE online=1")
		charts["goldDaily"] = statDailyChart(charDB,
			"SELECT DATE(date), IFNULL(SUM(money),0) FROM log_money WHERE date >= NOW() - INTERVAL 13 DAY GROUP BY DATE(date)")

		// 시간대(0~23시)별 마지막 접속 분포 — retention.hourly 와 동일
		hourly := chartData{Labels: make([]string, 0, 24), Values: make([]int64, 24)}
		for h := 0; h < 24; h++ {
			hourly.Labels = append(hourly.Labels, fmt.Sprintf("%d시", h))
		}
		if rows, qerr := charDB.Query("SELECT HOUR(FROM_UNIXTIME(logout_time)) h, COUNT(*) FROM characters WHERE logout_time > 0 GROUP BY h"); qerr == nil {
			defer rows.Close()
			for rows.Next() {
				var h, cnt int64
				if rows.Scan(&h, &cnt) == nil && h >= 0 && h < 24 {
					hourly.Values[h] = cnt
				}
			}
		}
		charts["hourly"] = hourly

		// ── 인게임 운영 지표 (월드 현황: 접속/캐릭터/진영/길드) ──
		// 진영: 얼라이언스 race(1,3,4,7,11) / 호드 race(2,5,6,8,10) — 게임 종족 매핑 기준
		ingame["online"] = statScalar(charDB, "SELECT COUNT(*) FROM characters WHERE online=1")
		ingame["total"] = statScalar(charDB, "SELECT COUNT(*) FROM characters")
		ingame["alliance"] = statScalar(charDB, "SELECT COUNT(*) FROM characters WHERE race IN (1,3,4,7,11)")
		ingame["horde"] = statScalar(charDB, "SELECT COUNT(*) FROM characters WHERE race IN (2,5,6,8,10)")
		maxLv := statScalar(charDB, "SELECT IFNULL(MAX(level),0) FROM characters")
		ingame["maxLevel"] = maxLv
		ingame["maxLevelChars"] = statScalar(charDB, "SELECT COUNT(*) FROM characters WHERE level >= ?", maxLv)
		ingame["active7d"] = statScalar(charDB, "SELECT COUNT(*) FROM characters WHERE logout_time >= UNIX_TIMESTAMP(NOW() - INTERVAL 7 DAY)")
		ingame["guilds"] = statScalar(charDB, "SELECT COUNT(*) FROM guild")
		var avgLv float64
		_ = charDB.QueryRow("SELECT IFNULL(AVG(level),0) FROM characters").Scan(&avgLv)
		ingame["avgLevel"] = avgLv

		// 골드 급증 감지 — 최근 7일, 최대 12건
		goldSurges = recentGoldSurges(charDB, 7, 12)
		// 골드 순위(GM 제외 TOP) + 유저 골드 소지량 분포(GM 제외)
		goldRanking = goldRankingTop(charDB, 7)
		goldDist = goldDistribution(charDB)
		// 유저 전체 골드 소지량 일별 추이(최근 30일, GM 제외)
		goldDailyTotal = dailyGoldTotals(charDB, 30)
	}

	writeStatsJSON(w, map[string]interface{}{
		"status":    "success",
		"kpi":        kpi,
		"queue":      queue,
		"charts":     charts,
		"ingame":      ingame,
		"goldSurges":  goldSurges,
		"goldRanking": goldRanking,
		"goldDist":    goldDist,
		"goldDaily":   goldDailyTotal,
		"retention":   retention,
	})
}
