package utils

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"karazhan/pkg/config"
	"mime"
	"net"
	"net/smtp"
	"strings"
)

type MailMessage struct {
	To       string
	Subject  string
	HTMLBody string
	TextBody string
}

func SendHTMLMail(msg MailMessage) error {
	host := strings.TrimSpace(config.SMTPHost())
	port := strings.TrimSpace(config.SMTPPort())
	username := strings.TrimSpace(config.SMTPUsername())
	password := config.SMTPPassword()
	fromEmail := strings.TrimSpace(config.SMTPFromEmail())
	fromName := strings.TrimSpace(config.SMTPFromName())

	if host == "" || port == "" || username == "" || password == "" || fromEmail == "" {
		return fmt.Errorf("smtp is not configured")
	}
	if strings.TrimSpace(msg.To) == "" {
		return fmt.Errorf("recipient email is required")
	}

	addr := net.JoinHostPort(host, port)
	auth := smtp.PlainAuth("", username, password, host)

	var headers bytes.Buffer
	headers.WriteString(fmt.Sprintf("From: %s\r\n", formatAddress(fromName, fromEmail)))
	headers.WriteString(fmt.Sprintf("To: %s\r\n", strings.TrimSpace(msg.To)))
	headers.WriteString(fmt.Sprintf("Subject: %s\r\n", mime.BEncoding.Encode("UTF-8", strings.TrimSpace(msg.Subject))))
	headers.WriteString("MIME-Version: 1.0\r\n")
	headers.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	headers.WriteString("Content-Transfer-Encoding: 8bit\r\n")
	headers.WriteString("\r\n")
	headers.WriteString(msg.HTMLBody)

	client, err := smtp.Dial(addr)
	if err != nil {
		return err
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: host}); err != nil {
			return err
		}
	}

	if ok, _ := client.Extension("AUTH"); ok {
		if err := client.Auth(auth); err != nil {
			return err
		}
	}

	if err := client.Mail(fromEmail); err != nil {
		return err
	}
	if err := client.Rcpt(strings.TrimSpace(msg.To)); err != nil {
		return err
	}

	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(headers.Bytes()); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func formatAddress(name, email string) string {
	email = strings.TrimSpace(email)
	name = strings.TrimSpace(name)
	if name == "" {
		return email
	}
	return mime.BEncoding.Encode("UTF-8", name) + " <" + email + ">"
}
