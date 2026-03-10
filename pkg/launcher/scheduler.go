package launcher

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

func StartScheduler() {
	go func() {
		ticker := time.NewTicker(20 * time.Second) // Check every 20 seconds
		defer ticker.Stop()

		for range ticker.C {
			checkSchedule()
		}
	}()
}

func checkSchedule() {
	// Connect to DB (Create new connection or use shared)
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true", dbUser, dbPassword, dbHost, dbPort, dbName)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Printf("[Scheduler] DB Connection Error: %v", err)
		return
	}
	defer db.Close()

	// Select pending schedules
	// 'no' is reserved keyword in some SQL, better use backticks if needed.
	// Field is 'no' (int).
	rows, err := db.Query("SELECT `no`, `date`, `action`, `target` FROM schedule WHERE `date` <= NOW() AND `processed` = 0")
	if err != nil {
		log.Printf("[Scheduler] Query Error: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var no int
		var dateStr string // Scan as string or time
		var action, target string

		// date is datetime. Scan into string usually works or []byte.
		if err := rows.Scan(&no, &dateStr, &action, &target); err != nil {
			log.Printf("[Scheduler] Scan Error: %v", err)
			continue
		}

		log.Printf("[Scheduler] Executing Job #%d: %s %s at %s", no, action, target, dateStr)

		executeJob(action, target)

		// Mark as processed
		_, err = db.Exec("UPDATE schedule SET processed = 1 WHERE `no` = ?", no)
		if err != nil {
			log.Printf("[Scheduler] Failed to update processed status for #%d: %v", no, err)
		}
	}
}

func executeJob(action, target string) {
	var err error
	switch action {
	case "start":
		err = StartProcess(target)
	case "stop":
		err = StopProcess(target)
	case "restart":
		// Stop then Start
		StopProcess(target)
		// Give it a second to shutdown
		time.Sleep(2 * time.Second)
		err = StartProcess(target)
	default:
		log.Printf("[Scheduler] Unknown action: %s", action)
		return
	}

	if err != nil {
		log.Printf("[Scheduler] Action failed: %v", err)
	} else {
		log.Printf("[Scheduler] Action success")
	}
}
