package auth

import (
	"crypto/aes"
	"crypto/cipher"
	crand "crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/o1egl/paseto"
	"golang.org/x/crypto/chacha20poly1305"
)

type TokenConfig struct {
	Issuer            string
	Audience          string
	AccessTokenTTLMin int
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int
}

type TokenClaims struct {
	Iss       string `json:"iss"`
	Aud       string `json:"aud"`
	Sub       string `json:"sub"`
	ProfileID string `json:"profile_id"`
	BranchID  string `json:"branch_id,omitempty"`
	ClientID  string `json:"client_id"`
	Scope     string `json:"scope"`
	Email     string `json:"email"`
	Iat       int64  `json:"iat"`
	Exp       int64  `json:"exp"`
	Jti       string `json:"jti"`
}

type KeyService struct {
	symmetricKey []byte
}

func NewKeyService(keyPath, decryptionKeyHex string) (*KeyService, error) {
	ks := &KeyService{}

	if keyPath != "" {
		if err := ks.loadFromFile(keyPath, decryptionKeyHex); err != nil {
			return nil, fmt.Errorf("load PASETO key: %w", err)
		}
	} else {
		if err := ks.generateEphemeral(); err != nil {
			return nil, fmt.Errorf("generate PASETO key: %w", err)
		}
	}

	return ks, nil
}

func (ks *KeyService) Key() []byte {
	return ks.symmetricKey
}

func (ks *KeyService) loadFromFile(path, decryptionKeyHex string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	if decryptionKeyHex != "" {
		keyHex, err := decryptAESGCM(data, decryptionKeyHex)
		if err != nil {
			return fmt.Errorf("decrypt key file: %w", err)
		}
		data = []byte(keyHex)
	}

	keyHex := strings.TrimSpace(string(data))
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return fmt.Errorf("invalid hex key in %s: %w", path, err)
	}
	if len(key) != chacha20poly1305.KeySize {
		return fmt.Errorf("key must be %d bytes, got %d", chacha20poly1305.KeySize, len(key))
	}

	ks.symmetricKey = key
	slog.Info("PASETO key loaded from file", "path", path)
	return nil
}

func (ks *KeyService) generateEphemeral() error {
	key := make([]byte, chacha20poly1305.KeySize)
	if _, err := crand.Read(key); err != nil {
		return err
	}
	ks.symmetricKey = key
	slog.Info("ephemeral PASETO key generated (256-bit)")
	return nil
}

func GenerateAccessToken(
	key []byte,
	cfg TokenConfig,
	userID uuid.UUID,
	profileID uuid.UUID,
	branchID *uuid.UUID,
	clientID string,
	scope string,
	email string,
) (string, error) {
	now := time.Now().UTC()
	expires := now.Add(time.Duration(cfg.AccessTokenTTLMin) * time.Minute)

	claims := TokenClaims{
		Iss:       cfg.Issuer,
		Aud:       cfg.Audience,
		Sub:       userID.String(),
		ProfileID: profileID.String(),
		BranchID:  branchIDToString(branchID),
		ClientID:  clientID,
		Scope:     scope,
		Email:     email,
		Iat:       now.Unix(),
		Exp:       expires.Unix(),
		Jti:       uuid.New().String(),
	}

	token, err := paseto.NewV2().Encrypt(key, claims, nil)
	if err != nil {
		return "", fmt.Errorf("encrypt paseto: %w", err)
	}

	return token, nil
}

func ValidatePasetoToken(tokenString string, key []byte, issuer, audience string) (*TokenClaims, error) {
	var claims TokenClaims
	err := paseto.NewV2().Decrypt(tokenString, key, &claims, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt paseto: %w", err)
	}

	if claims.Iss != issuer {
		return nil, fmt.Errorf("invalid issuer: expected %s, got %s", issuer, claims.Iss)
	}

	if claims.Aud != audience {
		return nil, fmt.Errorf("invalid audience: expected %s, got %s", audience, claims.Aud)
	}

	if time.Now().UTC().Unix() > claims.Exp {
		return nil, fmt.Errorf("token expired")
	}

	return &claims, nil
}

func branchIDToString(branchID *uuid.UUID) string {
	if branchID == nil {
		return ""
	}
	return branchID.String()
}

// EncryptKeyFile reads a plaintext hex key file, encrypts it with AES-256-GCM
// using the given master key (64 hex chars), and writes the result back.
func EncryptKeyFile(path, masterKeyHex string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read key file: %w", err)
	}

	masterKey, err := hex.DecodeString(masterKeyHex)
	if err != nil {
		return fmt.Errorf("invalid master key hex: %w", err)
	}
	if len(masterKey) != 32 {
		return fmt.Errorf("master key must be 32 bytes, got %d", len(masterKey))
	}

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return fmt.Errorf("create cipher: %w", err)
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("create GCM: %w", err)
	}

	nonce := make([]byte, aesgcm.NonceSize())
	if _, err := crand.Read(nonce); err != nil {
		return fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := aesgcm.Seal(nil, nonce, data, nil)
	out := append(nonce, ciphertext...)

	if err := os.WriteFile(path, out, 0644); err != nil {
		return fmt.Errorf("write encrypted key file: %w", err)
	}

	return nil
}

func decryptAESGCM(data []byte, masterKeyHex string) (string, error) {
	masterKey, err := hex.DecodeString(masterKeyHex)
	if err != nil {
		return "", fmt.Errorf("invalid decryption key hex: %w", err)
	}

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}

	nonceSize := aesgcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("encrypted file too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}

	return string(plaintext), nil
}
