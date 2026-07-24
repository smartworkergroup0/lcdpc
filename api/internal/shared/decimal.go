package shared

import (
	"fmt"
	"math"
)

const MaxStockDecimals = 3

// ValidateDecimalPrecision checks that a float64 value has at most maxDecimals
// decimal places. Returns an error if the precision exceeds the limit.
func ValidateDecimalPrecision(value float64, maxDecimals int) error {
	multiplier := math.Pow(10, float64(maxDecimals))
	rounded := math.Round(value*multiplier) / multiplier
	if value != rounded {
		return fmt.Errorf("DECIMAL_PRECISION_EXCEEDED: value %.4f has more than %d decimal places", value, maxDecimals)
	}
	return nil
}
