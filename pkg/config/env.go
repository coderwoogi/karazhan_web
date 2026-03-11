package config

import (
	"bufio"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var (
	envOnce sync.Once
	envMap  map[string]string
)

func AppEnv() string {
	if v := get("APP_ENV"); v != "" {
		return strings.ToLower(v)
	}
	return "development"
}

func IsProduction() bool {
	env := AppEnv()
	return env == "production" || env == "prod"
}

func Port() string {
	if v := get("PORT"); v != "" {
		return v
	}
	if IsProduction() {
		return "80"
	}
	return "8080"
}

func AuthDSN() string       { return get("KARAZHAN_AUTH_DSN") }
func CharactersDSN() string { return get("KARAZHAN_CHARACTERS_DSN") }
func WorldDSN() string      { return get("KARAZHAN_WORLD_DSN") }
func UpdateDSN() string     { return get("KARAZHAN_UPDATE_DSN") }

func AuthDSNWithParams(params string) string       { return withParams(AuthDSN(), params) }
func CharactersDSNWithParams(params string) string { return withParams(CharactersDSN(), params) }
func WorldDSNWithParams(params string) string      { return withParams(WorldDSN(), params) }
func UpdateDSNWithParams(params string) string     { return withParams(UpdateDSN(), params) }

func OpenMySQL(dsn string) (*sql.DB, error) {
	if strings.TrimSpace(dsn) == "" {
		return nil, fmt.Errorf("mysql dsn is not configured")
	}
	return sql.Open("mysql", dsn)
}

func get(key string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return strings.TrimSpace(loadEnvMap()[key])
}

func withParams(base, params string) string {
	base = strings.TrimSpace(base)
	params = strings.TrimSpace(params)
	if base == "" {
		return ""
	}
	if params == "" {
		return base
	}
	if strings.Contains(base, "?") {
		if strings.HasSuffix(base, "?") || strings.HasSuffix(base, "&") {
			return base + params
		}
		return base + "&" + params
	}
	return base + "?" + params
}

func loadEnvMap() map[string]string {
	envOnce.Do(func() {
		envMap = make(map[string]string)
		for _, path := range candidatePaths() {
			readEnvFile(path, envMap)
		}
	})
	return envMap
}

func candidatePaths() []string {
	wd, _ := os.Getwd()
	paths := []string{
		`configs/database.env`,
		`configs/database.local.env`,
		`E:/server/operate/configs/database.env`,
	}
	if wd != "" {
		paths = append([]string{
			filepath.Join(wd, "configs", "database.env"),
			filepath.Join(wd, "configs", "database.local.env"),
		}, paths...)
	}
	return paths
}

func readEnvFile(path string, target map[string]string) {
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
		if key != "" {
			target[key] = value
		}
	}
}
