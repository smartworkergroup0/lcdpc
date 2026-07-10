package email

import "context"

type Sender interface {
	SendOtpAsync(ctx context.Context, to, otpCode string) error
	SendPasswordResetAsync(ctx context.Context, to, resetToken string) error
}
