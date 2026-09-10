package services

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	"gorm.io/gorm"

	"mo-gallery-desktop/db"
	"mo-gallery-desktop/db/migrate"
)

// DesktopUsageEndpoint may be replaced at build time with -ldflags -X.
// MO_GALLERY_USAGE_ENDPOINT takes precedence for local development.
var DesktopUsageEndpoint = "https://mo.gallery/api/desktop/usage"

const installationIDFileName = "installation-id"

var installationIDPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type desktopUsagePayload struct {
	SchemaVersion    int            `json:"schemaVersion"`
	InstallationID   string         `json:"installationId"`
	AppVersion       string         `json:"appVersion"`
	DatabaseVersions map[string]int `json:"databaseVersions"`
	OS               string         `json:"os"`
	Arch             string         `json:"arch"`
}

type UsageService struct {
	configDir string
	version   string
	endpoint  string
	client    *http.Client
}

func NewUsageService(configDir, version string) *UsageService {
	endpoint := strings.TrimSpace(os.Getenv("MO_GALLERY_USAGE_ENDPOINT"))
	if endpoint == "" {
		endpoint = DesktopUsageEndpoint
	}
	return &UsageService{
		configDir: configDir,
		version:   version,
		endpoint:  endpoint,
		client:    &http.Client{Timeout: 5 * time.Second},
	}
}

// Report sends one anonymous installation snapshot. Callers deliberately run
// this in the background: network or service failures must not affect startup.
func (s *UsageService) Report(ctx context.Context) error {
	installationID, err := loadOrCreateInstallationID(s.configDir)
	if err != nil {
		return err
	}

	payload := desktopUsagePayload{
		SchemaVersion:    1,
		InstallationID:   installationID,
		AppVersion:       s.version,
		DatabaseVersions: collectDatabaseVersions(),
		OS:               runtime.GOOS,
		Arch:             runtime.GOARCH,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode desktop usage: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create desktop usage request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "emulsion-desktop/"+s.version)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("report desktop usage: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 8<<10))
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("report desktop usage: HTTP %d", resp.StatusCode)
	}
	return nil
}

func collectDatabaseVersions() map[string]int {
	versions := make(map[string]int, 4)
	addDatabaseVersion(versions, "editor_ai", db.AiDB)
	addDatabaseVersion(versions, "drafts", db.DraftsDB)
	addDatabaseVersion(versions, "zine", db.ZineDB)
	addDatabaseVersion(versions, "design_canvas", db.DesignCanvasDB)
	return versions
}

func addDatabaseVersion(versions map[string]int, name string, database *gorm.DB) {
	if database == nil {
		return
	}
	if version, err := migrate.CurrentVersion(database); err == nil {
		versions[name] = version
	}
}

func loadOrCreateInstallationID(configDir string) (string, error) {
	if err := os.MkdirAll(configDir, 0o700); err != nil {
		return "", fmt.Errorf("create installation ID directory: %w", err)
	}
	path := filepath.Join(configDir, installationIDFileName)
	if value, err := os.ReadFile(path); err == nil {
		installationID := strings.ToLower(strings.TrimSpace(string(value)))
		if installationIDPattern.MatchString(installationID) {
			return installationID, nil
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("read installation ID: %w", err)
	}

	installationID, err := newUUID()
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(path, []byte(installationID+"\n"), 0o600); err != nil {
		return "", fmt.Errorf("save installation ID: %w", err)
	}
	return installationID, nil
}

func newUUID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", fmt.Errorf("generate installation ID: %w", err)
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16]), nil
}
