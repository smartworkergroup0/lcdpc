package email

import (
	"context"
	"log/slog"
)

type NoopSender struct{}

func (n *NoopSender) SendOtpAsync(ctx context.Context, to, otpCode string) error {
	slog.Info("OTP email (noop)", "to", to, "otp", otpCode)
	return nil
}

func (n *NoopSender) SendPasswordResetAsync(ctx context.Context, to, resetToken string) error {
	slog.Info("Password reset email (noop)", "to", to)
	return nil
}
