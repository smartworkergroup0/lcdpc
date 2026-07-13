package email

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/resend/resend-go/v2"
)

type ResendSender struct {
	client *resend.Client
	from   string
}

func NewResendSender(apiKey, from string) *ResendSender {
	return &ResendSender{
		client: resend.NewClient(apiKey),
		from:   from,
	}
}

func (s *ResendSender) SendOtpAsync(ctx context.Context, to, otpCode string) error {
	params := &resend.SendEmailRequest{
		From:    s.from,
		To:      []string{to},
		Subject: "LCDPC Verification Code",
		Html:    fmt.Sprintf("<p>Your verification code is: <strong>%s</strong></p><p>This code expires in 10 minutes.</p>", otpCode),
	}

	_, err := s.client.Emails.SendWithContext(ctx, params)
	if err != nil {
		slog.Error("failed to send OTP email", "error", err, "to", to)
		return fmt.Errorf("send otp email: %w", err)
	}

	slog.Info("otp email sent", "to", to)
	return nil
}

func (s *ResendSender) SendPasswordResetAsync(ctx context.Context, to, otpCode string, ttlMinutes int) error {
	params := &resend.SendEmailRequest{
		From:    s.from,
		To:      []string{to},
		Subject: "LCDPC Password Reset",
		Html:    fmt.Sprintf("<p>Your password recovery code is: <strong>%s</strong></p><p>This code expires in %d minutes.</p>", otpCode, ttlMinutes),
	}

	_, err := s.client.Emails.SendWithContext(ctx, params)
	if err != nil {
		slog.Error("failed to send password reset email", "error", err, "to", to)
		return fmt.Errorf("send password reset email: %w", err)
	}

	slog.Info("password reset email sent", "to", to)
	return nil
}
