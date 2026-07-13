-- Revert password reset OTP flow migration
DROP INDEX IF EXISTS idx_password_reset_tokens_user_otp_active;

ALTER TABLE password_reset_tokens
    ALTER COLUMN token_hash SET NOT NULL,
    DROP COLUMN IF EXISTS otp_blocked_until_utc,
    DROP COLUMN IF EXISTS otp_attempts,
    DROP COLUMN IF EXISTS otp_expires_at_utc,
    DROP COLUMN IF EXISTS otp_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);
