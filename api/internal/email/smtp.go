package email

import (
	"context"
	"fmt"
	"log/slog"

	"gopkg.in/gomail.v2"
)

type SMTPSender struct {
	host     string
	port     int
	username string
	password string
	from     string
}

func NewSMTPSender(host string, port int, username, password, from string) *SMTPSender {
	return &SMTPSender{
		host:     host,
		port:     port,
		username: username,
		password: password,
		from:     from,
	}
}

func (s *SMTPSender) SendOtpAsync(ctx context.Context, to, otpCode string) error {
	msg := s.newMessage(to, "LCDPC Verification Code",
		fmt.Sprintf("<p>Your verification code is: <strong>%s</strong></p><p>This code expires in 10 minutes.</p>", otpCode))

	if err := s.dialer().DialAndSend(msg); err != nil {
		slog.Error("failed to send OTP email via SMTP", "error", err, "to", to)
		return fmt.Errorf("send otp email via smtp: %w", err)
	}

	slog.Info("otp email sent via SMTP", "to", to)
	return nil
}

func (s *SMTPSender) SendPasswordResetAsync(ctx context.Context, to, otpCode string, ttlMinutes int) error {
	msg := s.newMessage(to, "LCDPC Password Reset",
		fmt.Sprintf("<p>Your password recovery code is: <strong>%s</strong></p><p>This code expires in %d minutes.</p>", otpCode, ttlMinutes))

	if err := s.dialer().DialAndSend(msg); err != nil {
		slog.Error("failed to send password reset email via SMTP", "error", err, "to", to)
		return fmt.Errorf("send password reset email via smtp: %w", err)
	}

	slog.Info("password reset email sent via SMTP", "to", to)
	return nil
}

func (s *SMTPSender) newMessage(to, subject, htmlBody string) *gomail.Message {
	msg := gomail.NewMessage()
	msg.SetHeader("From", s.from)
	msg.SetHeader("To", to)
	msg.SetHeader("Subject", subject)
	msg.SetBody("text/html", htmlBody)
	return msg
}

func (s *SMTPSender) dialer() *gomail.Dialer {
	return gomail.NewDialer(s.host, s.port, s.username, s.password)
}
