package services

import "testing"

func TestListZineSystemFonts(t *testing.T) {
	fonts := ListZineSystemFonts()
	if len(fonts) == 0 {
		t.Fatal("expected at least one system font family")
	}
	for index := 1; index < len(fonts); index++ {
		if fonts[index-1] >= fonts[index] {
			t.Fatalf("font families must be unique and sorted: %q, %q", fonts[index-1], fonts[index])
		}
	}
}
