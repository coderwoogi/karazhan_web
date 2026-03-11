package stats

import (
	"database/sql"
	"encoding/json"
	"karazhan/pkg/config"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type chartData struct {
	Labels []string `json:"labels"`
	Values []int64  `json:"values"`
}

type statsDashboardResponse struct {
	Account struct {
		Total      int64     `json:"total"`
		Daily      chartData `json:"daily"`
		PostRank   chartData `json:"postRank"`
		LoginDaily chartData `json:"loginDaily"`
	} `json:"account"`
	Character struct {
		Total       int64     `json:"total"`
		ClassDist   chartData `json:"classDist"`
		LevelDist   chartData `json:"levelDist"`
		RaceDist    chartData `json:"raceDist"`
		FactionDist chartData `json:"factionDist"`
	} `json:"character"`
	Gold struct {
		Total       int64     `json:"total"`
		AvgPerChar  int64     `json:"avgPerChar"`
		Top10       chartData `json:"top10"`
		Bracket     chartData `json:"bracket"`
		RaceDist    chartData `json:"raceDist"`
		FactionDist chartData `json:"factionDist"`
	} `json:"gold"`
	Item struct {
		Top10 chartData `json:"top10"`
	} `json:"item"`
}

func ensureStatsPermissionSeeds() {
	db, err := openUpdateDBForPerm()
	if err != nil {
		return
	}
	defer db.Close()

	ensureMenuRegistryDefaults(db)
	_, _ = db.Exec(`INSERT IGNORE INTO web_menu_registry (id, type, name, order_index) VALUES ('stats', 'menu', '통계', 75)`)
	_, _ = db.Exec(`UPDATE web_menu_registry SET name='통계', order_index=75 WHERE id='stats'`)

	_, _ = db.Exec(`INSERT IGNORE INTO web_role_permissions (resource_type, resource_id, resource_name, rank_1, rank_2, rank_3, order_index) VALUES ('menu', 'stats', '통계', 0, 1, 1, 75)`)
	_, _ = db.Exec(`UPDATE web_role_permissions SET resource_name='통계', rank_1=0, rank_2=1, rank_3=1, order_index=75 WHERE resource_type='menu' AND resource_id='stats'`)
}

func handleStatsDashboard(w http.ResponseWriter, r *http.Request) {
	if !CheckMenuPermission(w, r, "stats") {
		return
	}

	resp := statsDashboardResponse{}
	fromTime, toTime, useDateFilter := parseDateRange(r)

	authDB, err := sql.Open("mysql", config.AuthDSN())
	if err == nil {
		defer authDB.Close()

		authWhere := ""
		authArgs := make([]interface{}, 0, 2)
		if useDateFilter {
			authWhere = " WHERE joindate >= ? AND joindate < ? "
			authArgs = append(authArgs, fromTime, toTime)
		}

		_ = authDB.QueryRow("SELECT COUNT(*) FROM account"+authWhere, authArgs...).Scan(&resp.Account.Total)

		rows, qErr := authDB.Query(`
            SELECT DATE(joindate) AS d, COUNT(*) AS c
            FROM account
            `+authWhere+`
            GROUP BY d
            ORDER BY d DESC
            LIMIT 30`, authArgs...)
		if qErr == nil {
			defer rows.Close()
			type rec struct {
				d string
				c int64
			}
			tmp := make([]rec, 0, 30)
			for rows.Next() {
				var d string
				var c int64
				if err := rows.Scan(&d, &c); err == nil {
					tmp = append(tmp, rec{d: d, c: c})
				}
			}
			sort.Slice(tmp, func(i, j int) bool { return tmp[i].d < tmp[j].d })
			for _, v := range tmp {
				resp.Account.Daily.Labels = append(resp.Account.Daily.Labels, v.d)
				resp.Account.Daily.Values = append(resp.Account.Daily.Values, v.c)
			}
		}
	}

	updateDB, err := sql.Open("mysql", updateDSN)
	if err == nil {
		defer updateDB.Close()

		postWhere := ""
		postArgs := make([]interface{}, 0, 2)
		if useDateFilter {
			postWhere = " WHERE created_at >= ? AND created_at < ? "
			postArgs = append(postArgs, fromTime, toTime)
		}

		rows, qErr := updateDB.Query(`
            SELECT IFNULL(author_name, ''), COUNT(*) AS c
            FROM web_posts
            `+postWhere+`
            GROUP BY account_id, author_name
            ORDER BY c DESC
            LIMIT 10`, postArgs...)
		if qErr == nil {
			defer rows.Close()
			for rows.Next() {
				var author string
				var cnt int64
				if err := rows.Scan(&author, &cnt); err == nil {
					author = strings.TrimSpace(author)
					if author == "" {
						author = "알 수 없음"
					}
					resp.Account.PostRank.Labels = append(resp.Account.PostRank.Labels, author)
					resp.Account.PostRank.Values = append(resp.Account.PostRank.Values, cnt)
				}
			}
		}

		loginWhere := " WHERE button = 'Login' "
		loginArgs := make([]interface{}, 0, 2)
		if useDateFilter {
			loginWhere += " AND date >= ? AND date < ? "
			loginArgs = append(loginArgs, fromTime, toTime)
		}

		rows, qErr = updateDB.Query(`
            SELECT DATE(date) AS d, COUNT(DISTINCT user) AS c
            FROM logs
            `+loginWhere+`
            GROUP BY d
            ORDER BY d DESC
            LIMIT 30`, loginArgs...)
		if qErr == nil {
			defer rows.Close()
			type rec struct {
				d string
				c int64
			}
			tmp := make([]rec, 0, 30)
			for rows.Next() {
				var d string
				var c int64
				if err := rows.Scan(&d, &c); err == nil {
					tmp = append(tmp, rec{d: d, c: c})
				}
			}
			sort.Slice(tmp, func(i, j int) bool { return tmp[i].d < tmp[j].d })
			for _, v := range tmp {
				resp.Account.LoginDaily.Labels = append(resp.Account.LoginDaily.Labels, v.d)
				resp.Account.LoginDaily.Values = append(resp.Account.LoginDaily.Values, v.c)
			}
		}
	}

	charDB, err := sql.Open("mysql", config.CharactersDSN())
	if err == nil {
		defer charDB.Close()

		charWhere := ""
		charArgs := make([]interface{}, 0, 2)
		if useDateFilter {
			charWhere = " WHERE creation_date >= ? AND creation_date < ? "
			charArgs = append(charArgs, fromTime, toTime)
		}

		_ = charDB.QueryRow("SELECT COUNT(*) FROM characters"+charWhere, charArgs...).Scan(&resp.Character.Total)
		_ = charDB.QueryRow("SELECT IFNULL(SUM(money),0) FROM characters"+charWhere, charArgs...).Scan(&resp.Gold.Total)
		if resp.Character.Total > 0 {
			resp.Gold.AvgPerChar = resp.Gold.Total / resp.Character.Total
		}

		rows, qErr := charDB.Query(`
            SELECT class, COUNT(*) AS c
            FROM characters
            `+charWhere+`
            GROUP BY class
            ORDER BY c DESC`, charArgs...)
		if qErr == nil {
			defer rows.Close()
			for rows.Next() {
				var cls int
				var cnt int64
				if err := rows.Scan(&cls, &cnt); err == nil {
					resp.Character.ClassDist.Labels = append(resp.Character.ClassDist.Labels, className(cls))
					resp.Character.ClassDist.Values = append(resp.Character.ClassDist.Values, cnt)
				}
			}
		}

		rows, qErr = charDB.Query(`
            SELECT bucket, COUNT(*) AS c
            FROM (
                SELECT
                    CASE
                        WHEN level BETWEEN 1 AND 20 THEN '1-20'
                        WHEN level BETWEEN 21 AND 40 THEN '21-40'
                        WHEN level BETWEEN 41 AND 60 THEN '41-60'
                        WHEN level BETWEEN 61 AND 70 THEN '61-70'
                        WHEN level BETWEEN 71 AND 79 THEN '71-79'
                        ELSE '80'
                    END AS bucket
                FROM characters
                `+charWhere+`
            ) t
            GROUP BY bucket`, charArgs...)
		if qErr == nil {
			defer rows.Close()
			levelMap := map[string]int64{}
			for rows.Next() {
				var bucket string
				var cnt int64
				if err := rows.Scan(&bucket, &cnt); err == nil {
					levelMap[bucket] = cnt
				}
			}
			order := []string{"1-20", "21-40", "41-60", "61-70", "71-79", "80"}
			for _, key := range order {
				resp.Character.LevelDist.Labels = append(resp.Character.LevelDist.Labels, key)
				resp.Character.LevelDist.Values = append(resp.Character.LevelDist.Values, levelMap[key])
			}
		}

		rows, qErr = charDB.Query(`
            SELECT race, COUNT(*) AS c
            FROM characters
            `+charWhere+`
            GROUP BY race
            ORDER BY c DESC`, charArgs...)
		if qErr == nil {
			defer rows.Close()
			alliance, horde := int64(0), int64(0)
			for rows.Next() {
				var race int
				var cnt int64
				if err := rows.Scan(&race, &cnt); err == nil {
					resp.Character.RaceDist.Labels = append(resp.Character.RaceDist.Labels, raceName(race))
					resp.Character.RaceDist.Values = append(resp.Character.RaceDist.Values, cnt)
					if isAllianceRace(race) {
						alliance += cnt
					} else {
						horde += cnt
					}
				}
			}
			resp.Character.FactionDist.Labels = []string{"얼라이언스", "호드"}
			resp.Character.FactionDist.Values = []int64{alliance, horde}
		}

		rows, qErr = charDB.Query(`
            SELECT name, money
            FROM characters
            `+charWhere+`
            ORDER BY money DESC
            LIMIT 10`, charArgs...)
		if qErr == nil {
			defer rows.Close()
			for rows.Next() {
				var name string
				var money int64
				if err := rows.Scan(&name, &money); err == nil {
					resp.Gold.Top10.Labels = append(resp.Gold.Top10.Labels, name)
					resp.Gold.Top10.Values = append(resp.Gold.Top10.Values, money)
				}
			}
		}

		rows, qErr = charDB.Query(`
            SELECT bucket, COUNT(*) AS c
            FROM (
                SELECT
                    CASE
                        WHEN money < 100000 THEN '0~9골드'
                        WHEN money < 1000000 THEN '10~99골드'
                        WHEN money < 10000000 THEN '100~999골드'
                        ELSE '1000골드+'
                    END AS bucket
                FROM characters
                `+charWhere+`
            ) t
            GROUP BY bucket`, charArgs...)
		if qErr == nil {
			defer rows.Close()
			gmap := map[string]int64{}
			for rows.Next() {
				var b string
				var c int64
				if err := rows.Scan(&b, &c); err == nil {
					gmap[b] = c
				}
			}
			order := []string{"0~9골드", "10~99골드", "100~999골드", "1000골드+"}
			for _, key := range order {
				resp.Gold.Bracket.Labels = append(resp.Gold.Bracket.Labels, key)
				resp.Gold.Bracket.Values = append(resp.Gold.Bracket.Values, gmap[key])
			}
		}

		rows, qErr = charDB.Query(`
            SELECT race, IFNULL(SUM(money), 0) AS total_money
            FROM characters
            `+charWhere+`
            GROUP BY race
            ORDER BY total_money DESC`, charArgs...)
		if qErr == nil {
			defer rows.Close()
			allianceMoney, hordeMoney := int64(0), int64(0)
			for rows.Next() {
				var race int
				var totalMoney int64
				if err := rows.Scan(&race, &totalMoney); err == nil {
					resp.Gold.RaceDist.Labels = append(resp.Gold.RaceDist.Labels, raceName(race))
					resp.Gold.RaceDist.Values = append(resp.Gold.RaceDist.Values, totalMoney)
					if isAllianceRace(race) {
						allianceMoney += totalMoney
					} else {
						hordeMoney += totalMoney
					}
				}
			}
			resp.Gold.FactionDist.Labels = []string{"얼라이언스", "호드"}
			resp.Gold.FactionDist.Values = []int64{allianceMoney, hordeMoney}
		}

		type topItem struct {
			entry int
			qty   int64
		}
		items := make([]topItem, 0, 10)

		itemJoin := ""
		itemArgs := make([]interface{}, 0, 2)
		if useDateFilter {
			itemJoin = " INNER JOIN characters c ON c.guid = item_instance.owner_guid WHERE c.creation_date >= ? AND c.creation_date < ? "
			itemArgs = append(itemArgs, fromTime, toTime)
		}

		rows, qErr = charDB.Query(`
            SELECT itemEntry, IFNULL(SUM(count),0) AS qty
            FROM item_instance
            `+itemJoin+`
            GROUP BY itemEntry
            ORDER BY qty DESC
            LIMIT 10`, itemArgs...)
		if qErr == nil {
			defer rows.Close()
			for rows.Next() {
				var entry int
				var qty int64
				if err := rows.Scan(&entry, &qty); err == nil {
					items = append(items, topItem{entry: entry, qty: qty})
				}
			}
		} else {
			log.Printf("[stats/dashboard] item_instance query failed: %v", qErr)
		}

		nameMap := map[int]string{}
		worldDB, wErr := sql.Open("mysql", config.WorldDSN())
		if wErr == nil {
			defer worldDB.Close()
			for _, it := range items {
				var name string
				if err := worldDB.QueryRow("SELECT IFNULL(name, '') FROM item_template WHERE entry = ?", it.entry).Scan(&name); err == nil {
					nameMap[it.entry] = name
				}
			}
		}

		for _, it := range items {
			label := nameMap[it.entry]
			if label == "" {
				label = "아이템 " + itoa(it.entry)
			}
			resp.Item.Top10.Labels = append(resp.Item.Top10.Labels, label)
			resp.Item.Top10.Values = append(resp.Item.Top10.Values, it.qty)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func className(v int) string {
	switch v {
	case 1:
		return "전사"
	case 2:
		return "성기사"
	case 3:
		return "사냥꾼"
	case 4:
		return "도적"
	case 5:
		return "사제"
	case 6:
		return "죽음의 기사"
	case 7:
		return "주술사"
	case 8:
		return "마법사"
	case 9:
		return "흑마법사"
	case 11:
		return "드루이드"
	default:
		return "기타(" + itoa(v) + ")"
	}
}

func raceName(v int) string {
	switch v {
	case 1:
		return "인간"
	case 2:
		return "오크"
	case 3:
		return "드워프"
	case 4:
		return "나이트엘프"
	case 5:
		return "언데드"
	case 6:
		return "타우렌"
	case 7:
		return "노움"
	case 8:
		return "트롤"
	case 10:
		return "블러드엘프"
	case 11:
		return "드레나이"
	default:
		return "기타(" + itoa(v) + ")"
	}
}

func isAllianceRace(v int) bool {
	switch v {
	case 1, 3, 4, 7, 11:
		return true
	default:
		return false
	}
}

func parseDateRange(r *http.Request) (time.Time, time.Time, bool) {
	fromStr := strings.TrimSpace(r.URL.Query().Get("from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("to"))
	if fromStr == "" || toStr == "" {
		return time.Time{}, time.Time{}, false
	}
	fromTime, err1 := time.Parse("2006-01-02", fromStr)
	toDay, err2 := time.Parse("2006-01-02", toStr)
	if err1 != nil || err2 != nil {
		return time.Time{}, time.Time{}, false
	}
	if toDay.Before(fromTime) {
		fromTime, toDay = toDay, fromTime
	}
	return fromTime, toDay.AddDate(0, 0, 1), true
}

func itoa(v int) string {
	return strconv.Itoa(v)
}
