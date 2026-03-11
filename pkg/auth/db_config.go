package auth

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	dbConfigOnce sync.Once
	dbConfigMap  map[string]string
)

func authDSN() string {
	return getDSN("KARAZHAN_AUTH_DSN", "AUTH_DSN", defaultAuthDSN())
}

func charsDSN() string {
	return getDSN("KARAZHAN_CHARACTERS_DSN", "CHARACTERS_DSN", defaultCharactersDSN())
}

func updateDSN() string {
	return getDSN("KARAZHAN_UPDATE_DSN", "UPDATE_DSN", "cpo5704:584579@tcp(121.148.127.135:3306)/update")
}

func worldDSN() string {
	return getDSN("KARAZHAN_WORLD_DSN", "WORLD_DSN", "cpo5704:584579@tcp(121.148.127.135:3306)/acore_world")
}

func defaultAuthDSN() string {
	if isProductionEnv() {
		return "root:z584579!@tcp(localhost:3306)/acore_auth"
	}
	return "root:4618@tcp(localhost:3306)/acore_auth"
}

func defaultCharactersDSN() string {
	if isProductionEnv() {
		return "root:z584579!@tcp(localhost:3306)/acore_characters"
	}
	return "root:4618@tcp(localhost:3306)/acore_characters"
}

func isProductionEnv() bool {
	appEnv := strings.TrimSpace(os.Getenv("APP_ENV"))
	return strings.EqualFold(appEnv, "production") || strings.EqualFold(appEnv, "prod")
}

func getDSN(primaryKey, fallbackKey, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(primaryKey)); value != "" {
		return value
	}
	if value := strings.TrimSpace(os.Getenv(fallbackKey)); value != "" {
		return value
	}
	if value := strings.TrimSpace(loadDBConfig()[primaryKey]); value != "" {
		return value
	}
	if value := strings.TrimSpace(loadDBConfig()[fallbackKey]); value != "" {
		return value
	}
	return fallback
}

func loadDBConfig() map[string]string {
	dbConfigOnce.Do(func() {
		dbConfigMap = make(map[string]string)
		for _, path := range databaseConfigCandidatePaths() {
			readDatabaseConfigFile(path, dbConfigMap)
		}
	})
	return dbConfigMap
}

func databaseConfigCandidatePaths() []string {
	wd, _ := os.Getwd()
	candidates := []string{
		`configs/database.env`,
		`E:/server/operate/configs/database.env`,
	}
	if wd != "" {
		candidates = append([]string{filepath.Join(wd, "configs", "database.env")}, candidates...)
	}
	return candidates
}

func readDatabaseConfigFile(path string, target map[string]string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(sc.Text(), "\uFEFF"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(strings.TrimPrefix(line[:idx], "\uFEFF"))
		value := strings.Trim(strings.TrimSpace(line[idx+1:]), "\"'")
		if key != "" && value != "" {
			target[key] = value
		}
	}
}
