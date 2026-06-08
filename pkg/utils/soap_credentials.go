package utils

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// LoadSOAPCredentials returns SOAP credentials from request-independent sources.
// Priority: environment variables -> local credential files.
func LoadSOAPCredentials() (string, string) {
	envUser := strings.TrimSpace(os.Getenv("KARAZHAN_SOAP_USER"))
	envPass := os.Getenv("KARAZHAN_SOAP_PASS")
	if envUser == "" {
		envUser = strings.TrimSpace(os.Getenv("SOAP_USER"))
	}
	if envUser == "" {
		envUser = strings.TrimSpace(os.Getenv("SOAP_USERNAME"))
	}
	if envPass == "" {
		envPass = os.Getenv("SOAP_PASS")
	}
	if envPass == "" {
		envPass = os.Getenv("SOAP_PASSWORD")
	}
	if envUser != "" && envPass != "" {
		return envUser, envPass
	}

	for _, p := range soapCredentialCandidatePaths() {
		user, pass := readSOAPCredentialsFile(p)
		if user != "" && pass != "" {
			return user, pass
		}
	}

	return envUser, envPass
}

func soapCredentialCandidatePaths() []string {
	wd, _ := os.Getwd()
	candidates := []string{
		`configs/soap_credentials.env`,
		`configs/database.env`,
		`configs/database.local.env`,
		`E:/server/operate/configs/soap_credentials.env`,
		`E:/server/operate/configs/database.env`,
		`/opt/homebrew/var/www/karazhan/configs/soap_credentials.env`,
		`/opt/homebrew/var/www/karazhan/configs/database.env`,
		`/opt/homebrew/etc/karazhan/soap_credentials.env`,
		`/Users/choitaeuk/Desktop/karazhan/configs/soap_credentials.env`,
		`/Users/choitaeuk/Desktop/karazhan/configs/database.env`,
		`/Users/choitaeuk/Desktop/karazhan/operate/configs/soap_credentials.env`,
		`/Users/choitaeuk/Desktop/karazhan/operate/configs/database.env`,
		`/Users/choitaeuk/Desktop/karazhan/karazhan/configs/soap_credentials.env`,
		`/Users/choitaeuk/Desktop/karazhan/karazhan/configs/database.env`,
	}
	if wd != "" {
		candidates = append([]string{
			filepath.Join(wd, "configs", "soap_credentials.env"),
			filepath.Join(wd, "configs", "database.env"),
			filepath.Join(wd, "configs", "database.local.env"),
		}, candidates...)
	}
	return candidates
}

func readSOAPCredentialsFile(path string) (string, string) {
	f, err := os.Open(path)
	if err != nil {
		return "", ""
	}
	defer f.Close()

	user := ""
	pass := ""
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		line = strings.TrimPrefix(line, "\uFEFF")
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx <= 0 {
			continue
		}
		k := strings.TrimSpace(strings.TrimPrefix(line[:idx], "\uFEFF"))
		v := strings.Trim(strings.TrimSpace(line[idx+1:]), "\"'")
		switch k {
		case "KARAZHAN_SOAP_USER", "SOAP_USER", "SOAP_USERNAME":
			user = strings.TrimSpace(v)
		case "KARAZHAN_SOAP_PASS", "SOAP_PASS", "SOAP_PASSWORD":
			pass = v
		}
	}
	return user, pass
}
