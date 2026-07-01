package utils

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// maxMailItemsPerMail mirrors AzerothCore's MAX_MAIL_ITEMS. ".send items" refuses
// more than this many attachments in a single mail, so larger bundles are split.
const maxMailItemsPerMail = 12

// WorldMailItem is a single item attachment (item template entry + stack count).
type WorldMailItem struct {
	Entry int
	Count int
}

// SendWorldMail delivers in-game mail through the AzerothCore SOAP console using the
// ".send items" / ".send money" / ".send mail" commands.
//
// Routing mail through the worldserver — instead of INSERTing into the `mail` table
// directly — makes the worldserver the SOLE allocator of mail IDs. Direct inserts that
// pick their own id via "SELECT MAX(id)+1 FROM mail" collide with the server's in-memory
// GenerateMailID counter, which raises a duplicate-primary-key error that silently drops
// player-to-player mail. Going through SOAP also notifies online recipients instantly.
func SendWorldMail(receiverName, subject, body string, items []WorldMailItem, goldCopper int64) error {
	receiverName = strings.TrimSpace(receiverName)
	if receiverName == "" {
		return fmt.Errorf("receiver name is required")
	}
	if strings.ContainsAny(receiverName, " \t\r\n\"") {
		return fmt.Errorf("invalid receiver name: %q", receiverName)
	}
	if len(items) == 0 && goldCopper <= 0 {
		return fmt.Errorf("nothing to send: no items and no money")
	}

	cfg := loadWorldSOAPConfig()
	if !cfg.Enabled {
		return fmt.Errorf("world SOAP is not enabled")
	}
	user, pass := LoadSOAPCredentials()
	if user == "" || pass == "" {
		return fmt.Errorf("world SOAP credentials are not configured")
	}

	subject = sanitizeMailArg(subject)
	body = sanitizeMailArg(body)
	if subject == "" {
		subject = "보상"
	}
	if body == "" {
		body = subject
	}

	// Items: chunk into mails of at most MAX_MAIL_ITEMS attachments each.
	for start := 0; start < len(items); start += maxMailItemsPerMail {
		end := start + maxMailItemsPerMail
		if end > len(items) {
			end = len(items)
		}
		var tokens []string
		for _, it := range items[start:end] {
			if it.Entry <= 0 || it.Count <= 0 {
				return fmt.Errorf("invalid item entry/count: %+v", it)
			}
			tokens = append(tokens, fmt.Sprintf("%d:%d", it.Entry, it.Count))
		}
		cmd := fmt.Sprintf(`.send items %s "%s" "%s" %s`, receiverName, subject, body, strings.Join(tokens, " "))
		if err := sendWorldSOAPCommand(cfg, user, pass, cmd); err != nil {
			return fmt.Errorf("send items mail failed: %w", err)
		}
	}

	// Money is its own mail (".send items" cannot attach money).
	if goldCopper > 0 {
		cmd := fmt.Sprintf(`.send money %s "%s" "%s" %d`, receiverName, subject, body, goldCopper)
		if err := sendWorldSOAPCommand(cfg, user, pass, cmd); err != nil {
			return fmt.Errorf("send money mail failed: %w", err)
		}
	}

	return nil
}

// SendWorldItemMail is a convenience wrapper for item-only mail.
func SendWorldItemMail(receiverName, subject, body string, items []WorldMailItem) error {
	return SendWorldMail(receiverName, subject, body, items, 0)
}

// sanitizeMailArg makes a string safe to embed inside a double-quoted ".send"
// command argument. AzerothCore's QuotedString parser reads until the next double
// quote and PRESERVES embedded newlines, so line breaks are kept for mail formatting;
// only characters that break parsing are neutralized:
//   - backslash: QuotedString treats '\' as an escape that swallows the next char → remove
//   - double quote: would end the quoted argument early → replace with single quote
//   - carriage return: normalize to '\n'; tab → space
func sanitizeMailArg(s string) string {
	s = strings.ReplaceAll(s, "\\", "")
	s = strings.ReplaceAll(s, "\"", "'")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\t", " ")
	return strings.TrimSpace(s)
}

type worldSOAPConfig struct {
	Enabled bool
	IP      string
	Port    string
}

func loadWorldSOAPConfig() worldSOAPConfig {
	cfg := worldSOAPConfig{Enabled: false, IP: "127.0.0.1", Port: "7878"}

	enabledRaw := strings.TrimSpace(os.Getenv("KARAZHAN_SOAP_ENABLED"))
	if enabledRaw == "" {
		enabledRaw = strings.TrimSpace(os.Getenv("SOAP_ENABLED"))
	}
	if enabledRaw != "" {
		cfg.Enabled = enabledRaw == "1" || strings.EqualFold(enabledRaw, "true") || strings.EqualFold(enabledRaw, "yes")
		if v := strings.TrimSpace(os.Getenv("KARAZHAN_SOAP_IP")); v != "" {
			cfg.IP = v
		} else if v := strings.TrimSpace(os.Getenv("KARAZHAN_SOAP_HOST")); v != "" {
			cfg.IP = v
		} else if v := strings.TrimSpace(os.Getenv("SOAP_IP")); v != "" {
			cfg.IP = v
		}
		if v := strings.TrimSpace(os.Getenv("KARAZHAN_SOAP_PORT")); v != "" {
			cfg.Port = v
		} else if v := strings.TrimSpace(os.Getenv("SOAP_PORT")); v != "" {
			cfg.Port = v
		}
		return cfg
	}

	// Fall back to reading SOAP.* from worldserver.conf.
	for _, path := range worldSOAPConfigCandidatePaths() {
		if fileCfg, ok := readWorldSOAPConfig(path); ok && fileCfg.Enabled {
			return fileCfg
		}
	}
	return cfg
}

func worldSOAPConfigCandidatePaths() []string {
	candidates := []string{}
	if v := strings.TrimSpace(os.Getenv("KARAZHAN_WORLDSERVER_CONF")); v != "" {
		candidates = append(candidates, v)
	}
	if wd, err := os.Getwd(); err == nil && wd != "" {
		candidates = append(candidates, filepath.Join(wd, "configs", "worldserver.conf"))
	}
	candidates = append(candidates,
		"configs/worldserver.conf",
		"/opt/homebrew/var/www/karazhan/configs/worldserver.conf",
		"/opt/homebrew/etc/karazhan/worldserver.conf",
		"/Users/choitaeuk/Desktop/karazhan/operate/configs/worldserver.conf",
		// Windows dev (karazhandev) — AzerothCore 운영 디렉토리
		"E:/server/operate/configs/worldserver.conf",
		"E:/server/azerothcore-wotlk/env/dist/etc/worldserver.conf",
	)
	return candidates
}

func readWorldSOAPConfig(path string) (worldSOAPConfig, bool) {
	cfg := worldSOAPConfig{Enabled: false, IP: "127.0.0.1", Port: "7878"}
	f, err := os.Open(path)
	if err != nil {
		return cfg, false
	}
	defer f.Close()

	reKV := regexp.MustCompile(`^\s*([A-Za-z0-9._]+)\s*=\s*(.+?)\s*$`)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		m := reKV.FindStringSubmatch(line)
		if len(m) != 3 {
			continue
		}
		val := strings.Trim(strings.TrimSpace(m[2]), `"`)
		switch m[1] {
		case "SOAP.Enabled":
			cfg.Enabled = val == "1" || strings.EqualFold(val, "true")
		case "SOAP.IP":
			if val != "" {
				cfg.IP = val
			}
		case "SOAP.Port":
			if val != "" {
				cfg.Port = val
			}
		}
	}
	return cfg, true
}

func sendWorldSOAPCommand(cfg worldSOAPConfig, user, pass, cmd string) error {
	endpoint := fmt.Sprintf("http://%s:%s/", cfg.IP, cfg.Port)
	xmlBody := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"
 xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
 <SOAP-ENV:Body>
  <executeCommand xmlns="urn:AC">
   <command>%s</command>
  </executeCommand>
 </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`, escapeXMLForSOAP(cmd))

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewBufferString(xmlBody))
	if err != nil {
		return err
	}
	req.SetBasicAuth(user, pass)
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", "urn:AC#executeCommand")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	body := string(bodyBytes)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(body))
	}
	if strings.Contains(strings.ToLower(body), "fault") {
		return fmt.Errorf("SOAP Fault: %s", strings.TrimSpace(body))
	}
	return nil
}

func escapeXMLForSOAP(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, `"`, "&quot;")
	return strings.ReplaceAll(s, "'", "&apos;")
}
