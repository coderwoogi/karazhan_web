package auth

import "os"

func getDSN(primaryKey, fallbackKey, fallback string) string {
	if value := os.Getenv(primaryKey); value != "" {
		return value
	}
	if value := os.Getenv(fallbackKey); value != "" {
		return value
	}
	return fallback
}

func authDSN() string {
	return getDSN("KARAZHAN_AUTH_DSN", "AUTH_DSN", "root:4618@tcp(localhost:3306)/acore_auth")
}

func charsDSN() string {
	return getDSN("KARAZHAN_CHARACTERS_DSN", "CHARACTERS_DSN", "root:4618@tcp(localhost:3306)/acore_characters")
}

func updateDSN() string {
	return getDSN("KARAZHAN_UPDATE_DSN", "UPDATE_DSN", "cpo5704:584579@tcp(121.148.127.135:3306)/update")
}

func worldDSN() string {
	return getDSN("KARAZHAN_WORLD_DSN", "WORLD_DSN", "cpo5704:584579@tcp(121.148.127.135:3306)/acore_world")
}
