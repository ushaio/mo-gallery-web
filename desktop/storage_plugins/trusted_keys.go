package storage_plugins

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"strings"
)

// These values are injected by the release build with -ldflags. Keeping the
// defaults empty makes local builds fail closed for signed production package
// installation instead of silently trusting a development key.
var (
	BundledNodeRuntimePublicKey    string
	BundledPluginSigningKeyID      = "mo-gallery-plugins-v1"
	BundledPluginSigningPublicKey  string
)

func decodeEd25519PublicKey(value string) (ed25519.PublicKey, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("Ed25519 public key is empty")
	}
	der := []byte(value)
	if block, _ := pem.Decode(der); block != nil {
		der = block.Bytes
	} else {
		decoded, err := base64.StdEncoding.DecodeString(value)
		if err != nil {
			return nil, errors.New("Ed25519 public key is not valid PEM or base64")
		}
		if len(decoded) == ed25519.PublicKeySize {
			return append(ed25519.PublicKey(nil), decoded...), nil
		}
		der = decoded
	}
	parsed, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, errors.New("Ed25519 public key is invalid")
	}
	key, ok := parsed.(ed25519.PublicKey)
	if !ok || len(key) != ed25519.PublicKeySize {
		return nil, errors.New("public key is not Ed25519")
	}
	return append(ed25519.PublicKey(nil), key...), nil
}
