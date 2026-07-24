package shared

import (
	"testing"
)

func TestValidateDecimalPrecision(t *testing.T) {
	tests := []struct {
		name      string
		value     float64
		maxDec    int
		expectErr bool
	}{
		{"integer", 5.0, 3, false},
		{"1 decimal", 5.1, 3, false},
		{"2 decimals", 5.12, 3, false},
		{"3 decimals", 5.123, 3, false},
		{"4 decimals", 5.1234, 3, true},
		{"5 decimals", 5.12345, 3, true},
		{"zero", 0.0, 3, false},
		{"negative 3 decimals", -5.123, 3, false},
		{"negative 4 decimals", -5.1234, 3, true},
		{"2 decimals with maxDec=2", 5.12, 2, false},
		{"3 decimals with maxDec=2", 5.123, 2, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateDecimalPrecision(tt.value, tt.maxDec)
			if (err != nil) != tt.expectErr {
				t.Errorf("ValidateDecimalPrecision(%v, %d) error = %v, wantErr %v", tt.value, tt.maxDec, err, tt.expectErr)
			}
		})
	}
}
