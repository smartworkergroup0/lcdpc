-- Password reset OTP flow migration
ALTER TABLE password_reset_tokens
    ADD COLUMN IF NOT EXISTS otp_code VARCHAR(6),
    ADD COLUMN IF NOT EXISTS otp_expires_at_utc TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS otp_blocked_until_utc TIMESTAMPTZ;

ALTER TABLE password_reset_tokens
    ALTER COLUMN token_hash DROP NOT NULL;

UPDATE password_reset_tokens
SET otp_code = LPAD((floor(random() * 1000000))::text, 6, '0'),
    otp_expires_at_utc = COALESCE(expires_at_utc, now() + INTERVAL '10 minutes'),
    otp_attempts = 0,
    otp_blocked_until_utc = NULL
WHERE otp_code IS NULL;

ALTER TABLE password_reset_tokens
    ALTER COLUMN otp_code SET NOT NULL,
    ALTER COLUMN otp_expires_at_utc SET NOT NULL;

DROP INDEX IF EXISTS idx_password_reset_tokens_token_hash;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_otp_active ON password_reset_tokens (user_id, revoked_at_utc, used_at_utc, otp_expires_at_utc);
