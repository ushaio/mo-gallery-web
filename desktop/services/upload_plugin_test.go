package services

import "testing"

func TestPluginObjectKeyIsStableAndCollisionResistant(t *testing.T) {
	first := pluginObjectKey("/tmp/holiday.jpg", "0123456789abcdef0123456789abcdef")
	second := pluginObjectKey("/other/holiday.jpg", "fedcba98765432100123456789abcdef")
	if first != "holiday-0123456789abcdef.jpg" {
		t.Fatalf("first key = %q", first)
	}
	if second != "holiday-fedcba9876543210.jpg" {
		t.Fatalf("second key = %q", second)
	}
	if first == second {
		t.Fatal("different hashes must not share an object key")
	}
}
