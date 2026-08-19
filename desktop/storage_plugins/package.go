package storage_plugins

import (
	"archive/zip"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	maxPluginPackageBytes    = 256 * 1024 * 1024
	maxPluginPackageFiles    = 4096
	maxPluginPackageUnpacked = 512 * 1024 * 1024
	pluginChecksumsFileName  = "checksums.json"
	pluginSignatureFileName  = "signature.sig"
)

type pluginPackage struct {
	Directory       string
	Manifest        Manifest
	SignatureStatus string
}

func inspectPluginPackage(packagePath string, trustedKeys map[string]ed25519.PublicKey, developerMode bool) (pluginPackage, error) {
	packagePath, err := filepath.Abs(packagePath)
	if err != nil {
		return pluginPackage{}, fmt.Errorf("resolve plugin package: %w", err)
	}
	info, err := os.Stat(packagePath)
	if err != nil {
		return pluginPackage{}, fmt.Errorf("stat plugin package: %w", err)
	}
	if info.IsDir() || info.Size() > maxPluginPackageBytes {
		return pluginPackage{}, errors.New("plugin package is missing or exceeds the size limit")
	}
	archive, err := zip.OpenReader(packagePath)
	if err != nil {
		return pluginPackage{}, fmt.Errorf("open plugin package: %w", err)
	}
	defer archive.Close()
	if len(archive.File) > maxPluginPackageFiles {
		return pluginPackage{}, errors.New("plugin package contains too many files")
	}
	stage, err := os.MkdirTemp("", "mo-gallery-plugin-package-")
	if err != nil {
		return pluginPackage{}, fmt.Errorf("create plugin package staging directory: %w", err)
	}
	keep := false
	defer func() {
		if !keep {
			_ = os.RemoveAll(stage)
		}
	}()

	seen := make(map[string]struct{}, len(archive.File))
	var unpacked int64
	for _, item := range archive.File {
		name, err := safeZipEntryName(item.Name)
		if err != nil {
			return pluginPackage{}, err
		}
		if _, exists := seen[name]; exists {
			return pluginPackage{}, fmt.Errorf("plugin package contains duplicate file: %s", name)
		}
		seen[name] = struct{}{}
		if item.FileInfo().Mode()&os.ModeSymlink != 0 {
			return pluginPackage{}, fmt.Errorf("plugin package cannot contain symbolic links: %s", name)
		}
		if item.UncompressedSize64 > uint64(maxPluginPackageUnpacked) || unpacked > int64(maxPluginPackageUnpacked)-int64(item.UncompressedSize64) {
			return pluginPackage{}, errors.New("plugin package exceeds the unpacked size limit")
		}
		unpacked += int64(item.UncompressedSize64)
		if item.FileInfo().IsDir() {
			if err := os.MkdirAll(filepath.Join(stage, filepath.FromSlash(name)), 0o700); err != nil {
				return pluginPackage{}, err
			}
			continue
		}
		target, err := resolvePackagePath(stage, name)
		if err != nil {
			return pluginPackage{}, fmt.Errorf("invalid plugin package path %q: %w", name, err)
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return pluginPackage{}, err
		}
		reader, err := item.Open()
		if err != nil {
			return pluginPackage{}, err
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
		if err != nil {
			_ = reader.Close()
			return pluginPackage{}, err
		}
		_, copyErr := io.CopyN(output, reader, int64(item.UncompressedSize64))
		closeErr := output.Close()
		readerCloseErr := reader.Close()
		if copyErr != nil && !(item.UncompressedSize64 == 0 && errors.Is(copyErr, io.EOF)) {
			return pluginPackage{}, fmt.Errorf("extract plugin package file %s: %w", name, copyErr)
		}
		if closeErr != nil {
			return pluginPackage{}, closeErr
		}
		if readerCloseErr != nil {
			return pluginPackage{}, readerCloseErr
		}
	}

	manifestPath := filepath.Join(stage, pluginManifestFileName)
	manifest, err := readManifest(manifestPath)
	if err != nil {
		return pluginPackage{}, err
	}
	if err := verifyPackageChecksums(stage, seen); err != nil {
		return pluginPackage{}, err
	}
	signatureStatus, err := verifyPackageSignature(stage, manifest, trustedKeys, developerMode)
	if err != nil {
		return pluginPackage{}, err
	}
	if err := validateInstalledPayload(stage, manifest); err != nil {
		return pluginPackage{}, err
	}
	keep = true
	return pluginPackage{Directory: stage, Manifest: manifest, SignatureStatus: signatureStatus}, nil
}

func safeZipEntryName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || strings.ContainsRune(name, '\x00') || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") {
		return "", errors.New("plugin package contains an invalid path")
	}
	pathName := strings.TrimSuffix(name, "/")
	for _, segment := range strings.Split(pathName, "/") {
		if segment == ".." {
			return "", fmt.Errorf("plugin package path contains a parent segment: %s", name)
		}
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(name)))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") || filepath.IsAbs(filepath.FromSlash(clean)) || filepath.VolumeName(filepath.FromSlash(clean)) != "" {
		return "", fmt.Errorf("plugin package path escapes its root: %s", name)
	}
	return clean, nil
}

func verifyPackageChecksums(stage string, names map[string]struct{}) error {
	data, err := os.ReadFile(filepath.Join(stage, pluginChecksumsFileName))
	if err != nil {
		return errors.New("plugin package must contain checksums.json")
	}
	var checksums map[string]string
	if err := json.Unmarshal(data, &checksums); err != nil {
		return fmt.Errorf("decode plugin checksums: %w", err)
	}
	if len(checksums) == 0 {
		return errors.New("plugin package checksums.json is empty")
	}
	for name := range names {
		if name == pluginSignatureFileName || name == pluginChecksumsFileName || strings.HasSuffix(name, "/") {
			continue
		}
		if info, err := os.Stat(filepath.Join(stage, filepath.FromSlash(name))); err == nil && info.IsDir() {
			continue
		}
		value, ok := checksums[name]
		if !ok {
			return fmt.Errorf("plugin package checksum is missing: %s", name)
		}
		if err := verifyFileHash(filepath.Join(stage, filepath.FromSlash(name)), value); err != nil {
			return err
		}
	}
	for name := range checksums {
		if _, ok := names[name]; !ok || name == pluginSignatureFileName || name == pluginChecksumsFileName {
			return fmt.Errorf("plugin package checksum references an unexpected file: %s", name)
		}
	}
	return nil
}

func verifyFileHash(path, expected string) error {
	expected = strings.ToLower(strings.TrimSpace(expected))
	if len(expected) != sha256.Size*2 {
		return fmt.Errorf("invalid sha256 checksum for %s", filepath.Base(path))
	}
	hash := sha256.New()
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	if _, err := io.Copy(hash, file); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if actual != expected {
		return fmt.Errorf("checksum mismatch for %s", filepath.Base(path))
	}
	return nil
}

func verifyPackageSignature(stage string, manifest Manifest, trustedKeys map[string]ed25519.PublicKey, developerMode bool) (string, error) {
	signaturePath := filepath.Join(stage, pluginSignatureFileName)
	signatureData, err := os.ReadFile(signaturePath)
	if err != nil {
		if developerMode {
			return "development", nil
		}
		return "unsigned", errors.New("plugin package signature is required")
	}
	keyID := strings.TrimSpace(manifest.SigningKeyID)
	key := trustedKeys[keyID]
	if len(key) != ed25519.PublicKeySize {
		return "invalid", fmt.Errorf("plugin signing key is not trusted: %s", keyID)
	}
	signature, err := decodeSignature(signatureData)
	if err != nil {
		return "invalid", err
	}
	checksums, err := os.ReadFile(filepath.Join(stage, pluginChecksumsFileName))
	if err != nil || !ed25519.Verify(key, checksums, signature) {
		return "invalid", errors.New("plugin package signature verification failed")
	}
	return "verified", nil
}

func decodeSignature(data []byte) ([]byte, error) {
	if len(data) == ed25519.SignatureSize {
		return append([]byte(nil), data...), nil
	}
	trimmed := []byte(strings.TrimSpace(string(data)))
	decoded, err := base64.StdEncoding.DecodeString(string(trimmed))
	if err != nil || len(decoded) != ed25519.SignatureSize {
		return nil, errors.New("plugin signature must be an Ed25519 signature or base64 encoded signature")
	}
	return decoded, nil
}

func sortedPackageNames(names map[string]struct{}) []string {
	result := make([]string, 0, len(names))
	for name := range names {
		result = append(result, name)
	}
	sort.Strings(result)
	return result
}
