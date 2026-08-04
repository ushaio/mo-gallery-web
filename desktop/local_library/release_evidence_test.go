package local_library

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"
)

const privateEvidenceSchemaVersion = 1

var privateVariantPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

type privateMediaManifest struct {
	SchemaVersion int                  `json:"schemaVersion"`
	FixtureSet    string               `json:"fixtureSet"`
	UpdatedAt     string               `json:"updatedAt"`
	Samples       []privateMediaSample `json:"samples"`
}

type privateMediaSample struct {
	ID                string                   `json:"id"`
	Variant           string                   `json:"variant"`
	RelativePath      string                   `json:"relativePath"`
	SHA256            string                   `json:"sha256"`
	ByteSize          int64                    `json:"byteSize"`
	Format            string                   `json:"format"`
	MIMEType          string                   `json:"mimeType"`
	SourceClass       string                   `json:"sourceClass"`
	CameraOrEncoder   string                   `json:"cameraOrEncoder"`
	LicenseNote       string                   `json:"licenseNote"`
	Expected          privateMediaExpectations `json:"expected"`
	Verification      privateMediaVerification `json:"verification"`
	VerificationBasis string                   `json:"verificationBasis"`
}

type privateMediaExpectations struct {
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	Orientation  int    `json:"orientation"`
	Index        string `json:"index"`
	Metadata     string `json:"metadata"`
	Thumbnail    string `json:"thumbnail"`
	Preview      string `json:"preview"`
	OriginalView string `json:"originalView"`
}

type privateMediaVerification struct {
	Status         string `json:"status"`
	WindowsVersion string `json:"windowsVersion"`
	AppVersion     string `json:"appVersion"`
	VerifiedAt     string `json:"verifiedAt"`
	Notes          string `json:"notes"`
}

type evidenceEnvironment struct {
	OS               string `json:"os"`
	Architecture     string `json:"architecture"`
	WindowsVersion   string `json:"windowsVersion"`
	CPU              string `json:"cpu"`
	RAM              string `json:"ram"`
	Disk             string `json:"disk"`
	DiskType         string `json:"diskType"`
	FileSystem       string `json:"fileSystem"`
	CacheState       string `json:"cacheState"`
	CachePreparation string `json:"cachePreparation"`
	AppVersion       string `json:"appVersion"`
	Revision         string `json:"revision"`
}

type privateMediaObservation struct {
	Format         string `json:"format,omitempty"`
	MIMEType       string `json:"mimeType,omitempty"`
	ByteSize       int64  `json:"byteSize,omitempty"`
	Width          int    `json:"width,omitempty"`
	Height         int    `json:"height,omitempty"`
	Orientation    int    `json:"orientation,omitempty"`
	Index          string `json:"index"`
	Metadata       string `json:"metadata"`
	Thumbnail      string `json:"thumbnail"`
	Preview        string `json:"preview"`
	OriginalView   string `json:"originalView"`
	InspectionNote string `json:"inspectionNote,omitempty"`
}

type privateMediaEvidenceResult struct {
	ID          string                  `json:"id"`
	SHA256      string                  `json:"sha256,omitempty"`
	Format      string                  `json:"format,omitempty"`
	Status      string                  `json:"status"`
	Observed    privateMediaObservation `json:"observed"`
	Differences []string                `json:"differences,omitempty"`
	Notes       string                  `json:"notes,omitempty"`
}

type evidenceManifestReference struct {
	FixtureSet string `json:"fixtureSet"`
	SHA256     string `json:"sha256"`
}

type privateMediaEvidenceReport struct {
	SchemaVersion int                          `json:"schemaVersion"`
	Kind          string                       `json:"kind"`
	GeneratedAt   string                       `json:"generatedAt"`
	Status        string                       `json:"status"`
	Manifest      *evidenceManifestReference   `json:"manifest,omitempty"`
	Environment   evidenceEnvironment          `json:"environment"`
	Results       []privateMediaEvidenceResult `json:"results"`
}

func TestPrivateMediaReleaseEvidence(t *testing.T) {
	manifestPath := strings.TrimSpace(os.Getenv("LOCAL_LIBRARY_PRIVATE_MANIFEST"))
	if manifestPath == "" {
		manifestPath = filepath.Join("..", "testdata", "local-library", "manifest.local.json")
	}
	report := privateMediaEvidenceReport{
		SchemaVersion: privateEvidenceSchemaVersion,
		Kind:          "private-media",
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Status:        "not_verified",
		Environment:   releaseEvidenceEnvironment(),
		Results:       []privateMediaEvidenceResult{},
	}
	manifestBytes, err := os.ReadFile(manifestPath)
	if errors.Is(err, os.ErrNotExist) {
		report.Results = append(report.Results, privateMediaEvidenceResult{
			ID:     "private-media-manifest",
			Status: "not_verified",
			Observed: privateMediaObservation{
				Index: "not_verified", Metadata: "not_verified", Thumbnail: "not_verified", Preview: "not_verified", OriginalView: "not_verified",
			},
			Notes: "private manifest is absent; no media capability was inferred as passed",
		})
		writePrivateEvidenceReport(t, report)
		t.Log("private media release evidence: not_verified (manifest is absent)")
		if releaseEvidenceGateEnabled() {
			t.Fatal("private media release gate requires LOCAL_LIBRARY_PRIVATE_MANIFEST")
		}
		return
	}
	if err != nil {
		report.Status = "failed"
		report.Results = append(report.Results, privateMediaEvidenceResult{
			ID:     "private-media-manifest",
			Status: "failed",
			Observed: privateMediaObservation{
				Index: "not_verified", Metadata: "not_verified", Thumbnail: "not_verified", Preview: "not_verified", OriginalView: "not_verified",
			},
			Differences: []string{fmt.Sprintf("read private media manifest: %v", err)},
		})
		writePrivateEvidenceReport(t, report)
		t.Fatalf("read private media manifest: %v", err)
	}
	manifest, validationErrors := decodeAndValidatePrivateManifest(manifestPath, manifestBytes)
	if len(validationErrors) > 0 {
		report.Status = "failed"
		for index, validationErr := range validationErrors {
			report.Results = append(report.Results, privateMediaEvidenceResult{
				ID:     fmt.Sprintf("manifest-validation-%02d", index+1),
				Status: "failed",
				Observed: privateMediaObservation{
					Index: "not_verified", Metadata: "not_verified", Thumbnail: "not_verified", Preview: "not_verified", OriginalView: "not_verified",
				},
				Differences: []string{validationErr.Error()},
			})
			t.Error(validationErr)
		}
		writePrivateEvidenceReport(t, report)
		return
	}
	manifestHash := sha256.Sum256(manifestBytes)
	report.Manifest = &evidenceManifestReference{FixtureSet: manifest.FixtureSet, SHA256: hex.EncodeToString(manifestHash[:])}
	manifestRoot := filepath.Dir(manifestPath)
	for _, sample := range manifest.Samples {
		result := observePrivateMediaSample(t, manifestRoot, sample)
		if result.Status == "passed" {
			if reason := privateEvidenceEnvironmentMismatch(sample, report.Environment); reason != "" {
				result.Status = "not_verified"
				result.Notes = reason
			}
		}
		report.Results = append(report.Results, result)
		if result.Status == "failed" {
			t.Errorf("private sample %s failed: %s", sample.ID, strings.Join(result.Differences, "; "))
		}
	}
	report.Status = aggregateEvidenceStatus(report.Results)
	writePrivateEvidenceReport(t, report)
	t.Logf("private media release evidence: %s (%d samples)", report.Status, len(report.Results))
	if releaseEvidenceGateEnabled() {
		missingCases := missingRequiredPrivateCases(manifest.Samples, report.Results)
		if report.Status != "passed" || len(missingCases) > 0 {
			t.Fatalf("private media release gate blocked: status=%s missingCases=%v", report.Status, missingCases)
		}
	}
}

func decodeAndValidatePrivateManifest(manifestPath string, data []byte) (privateMediaManifest, []error) {
	var manifest privateMediaManifest
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return manifest, []error{fmt.Errorf("decode private manifest: %w", err)}
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return manifest, []error{errors.New("private manifest contains trailing JSON values")}
	}
	errorsFound := []error{}
	if manifest.SchemaVersion != privateEvidenceSchemaVersion {
		errorsFound = append(errorsFound, fmt.Errorf("manifest schemaVersion=%d, want %d", manifest.SchemaVersion, privateEvidenceSchemaVersion))
	}
	if strings.TrimSpace(manifest.FixtureSet) == "" {
		errorsFound = append(errorsFound, errors.New("manifest fixtureSet is required"))
	}
	if _, err := time.Parse("2006-01-02", manifest.UpdatedAt); err != nil {
		errorsFound = append(errorsFound, fmt.Errorf("manifest updatedAt must use YYYY-MM-DD: %w", err))
	}
	ids := map[string]struct{}{}
	paths := map[string]struct{}{}
	for index, sample := range manifest.Samples {
		prefix := fmt.Sprintf("sample[%d]", index)
		if strings.TrimSpace(sample.ID) == "" {
			errorsFound = append(errorsFound, fmt.Errorf("%s id is required", prefix))
		}
		if _, exists := ids[sample.ID]; exists {
			errorsFound = append(errorsFound, fmt.Errorf("duplicate private sample id %q", sample.ID))
		}
		ids[sample.ID] = struct{}{}
		if _, exists := paths[sample.RelativePath]; exists {
			errorsFound = append(errorsFound, fmt.Errorf("duplicate private sample path %q", sample.RelativePath))
		}
		paths[sample.RelativePath] = struct{}{}
		if err := validatePrivateSampleContract(manifestPath, sample); err != nil {
			errorsFound = append(errorsFound, fmt.Errorf("%s %s: %w", prefix, sample.ID, err))
		}
	}
	return manifest, errorsFound
}

func validatePrivateSampleContract(manifestPath string, sample privateMediaSample) error {
	if strings.TrimSpace(sample.ID) == "" || strings.ContainsAny(sample.ID, `/\\`) || len(sample.ID) > 128 {
		return errors.New("id must be a stable path-free identifier of at most 128 characters")
	}
	for index, char := range sample.ID {
		if !((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '.' || char == '_' || char == '-') || (index == 0 && (char == '.' || char == '_' || char == '-')) {
			return errors.New("id must match [A-Za-z0-9][A-Za-z0-9._-]*")
		}
	}
	if !privateVariantPattern.MatchString(sample.Variant) {
		return errors.New("variant must match [a-z0-9][a-z0-9_-]*")
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(sample.RelativePath)))
	if clean != sample.RelativePath || !strings.HasPrefix(clean, "samples/") || strings.Contains(clean, "../") || filepath.IsAbs(sample.RelativePath) {
		return errors.New("relativePath must be a canonical samples/... path")
	}
	if len(sample.SHA256) != sha256.Size*2 {
		return errors.New("sha256 must contain 64 lowercase hexadecimal characters")
	}
	if _, err := hex.DecodeString(sample.SHA256); err != nil || strings.ToLower(sample.SHA256) != sample.SHA256 {
		return errors.New("sha256 must contain 64 lowercase hexadecimal characters")
	}
	if sample.ByteSize <= 0 {
		return errors.New("byteSize must be positive")
	}
	if !allowedPrivateFormat(sample.Format) {
		return fmt.Errorf("format %q is not supported by the evidence schema", sample.Format)
	}
	if strings.TrimSpace(sample.MIMEType) == "" || strings.TrimSpace(sample.LicenseNote) == "" {
		return errors.New("mimeType and licenseNote are required")
	}
	if !oneOf(sample.SourceClass, "self-created", "camera-original", "licensed-test-media", "private-local-sample") {
		return fmt.Errorf("invalid sourceClass %q", sample.SourceClass)
	}
	if sample.Expected.Width < 0 || sample.Expected.Height < 0 || sample.Expected.Orientation < 0 || sample.Expected.Orientation > 8 {
		return errors.New("expected dimensions/orientation are invalid")
	}
	if !oneOf(sample.Expected.Index, "supported", "unsupported", "not_verified") {
		return fmt.Errorf("invalid expected.index %q", sample.Expected.Index)
	}
	for field, value := range map[string]string{
		"metadata": sample.Expected.Metadata, "thumbnail": sample.Expected.Thumbnail, "preview": sample.Expected.Preview, "originalView": sample.Expected.OriginalView,
	} {
		if !oneOf(value, "ready", "partial", "unavailable", "not_applicable", "not_verified") {
			return fmt.Errorf("invalid expected.%s %q", field, value)
		}
	}
	basis, err := privateSampleVerificationBasis(sample)
	if err != nil {
		return fmt.Errorf("calculate verificationBasis: %w", err)
	}
	if sample.VerificationBasis != basis {
		return errors.New("verificationBasis is stale; regenerate the manifest")
	}
	if !oneOf(sample.Verification.Status, "passed", "failed", "not_verified") {
		return fmt.Errorf("invalid verification.status %q", sample.Verification.Status)
	}
	if isRAWFormat(sample.Format) && sample.Variant == "camera_original" && sample.SourceClass != "camera-original" {
		return errors.New("RAW camera_original samples require sourceClass camera-original")
	}
	if sample.Verification.Status == "passed" {
		if strings.TrimSpace(sample.CameraOrEncoder) == "" {
			return errors.New("passed verification requires cameraOrEncoder")
		}
		if strings.TrimSpace(sample.Verification.WindowsVersion) == "" || strings.TrimSpace(sample.Verification.AppVersion) == "" || strings.TrimSpace(sample.Verification.VerifiedAt) == "" {
			return errors.New("passed verification requires Windows version, app version, and verification date")
		}
		if _, err := time.Parse("2006-01-02", sample.Verification.VerifiedAt); err != nil {
			return errors.New("verification.verifiedAt must use YYYY-MM-DD")
		}
	}
	path := filepath.Join(filepath.Dir(manifestPath), filepath.FromSlash(sample.RelativePath))
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		if sample.Verification.Status != "not_verified" {
			return errors.New("missing sample must be not_verified")
		}
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return errors.New("sample must be a regular non-symlink file")
	}
	resolvedSamples, err := filepath.EvalSymlinks(filepath.Join(filepath.Dir(manifestPath), "samples"))
	if err != nil {
		return fmt.Errorf("resolve samples directory: %w", err)
	}
	resolvedPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return fmt.Errorf("resolve sample path: %w", err)
	}
	relative, err := filepath.Rel(resolvedSamples, resolvedPath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errors.New("sample path escapes samples directory")
	}
	return nil
}

func observePrivateMediaSample(t *testing.T, manifestRoot string, sample privateMediaSample) privateMediaEvidenceResult {
	t.Helper()
	result := privateMediaEvidenceResult{ID: sample.ID, SHA256: sample.SHA256, Format: sample.Format, Status: "not_verified"}
	result.Observed = privateMediaObservation{Index: "not_verified", Metadata: "not_verified", Thumbnail: "not_verified", Preview: "not_verified", OriginalView: "not_verified"}
	path := filepath.Join(manifestRoot, filepath.FromSlash(sample.RelativePath))
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		result.Notes = "sample file is missing"
		return result
	}
	if err != nil {
		result.Status = "failed"
		result.Differences = []string{err.Error()}
		return result
	}
	hash, err := fileSHA256(path)
	if err != nil {
		result.Status = "failed"
		result.Differences = []string{err.Error()}
		return result
	}
	if info.Size() != sample.ByteSize {
		result.Differences = append(result.Differences, fmt.Sprintf("byteSize=%d want %d", info.Size(), sample.ByteSize))
	}
	if hash != sample.SHA256 {
		result.Differences = append(result.Differences, "SHA-256 does not match manifest")
	}

	inspected := inspectMedia(path, info)
	result.Observed.Format = inspected.Format
	result.Observed.MIMEType = inspected.MimeType
	result.Observed.ByteSize = inspected.ByteSize
	result.Observed.Width = inspected.Width
	result.Observed.Height = inspected.Height
	result.Observed.Orientation = inspected.Orientation
	result.Observed.Index = "supported"
	result.Observed.Metadata = observedMetadataCapability(inspected.MetadataStatus)
	result.Observed.InspectionNote = inspected.PreviewError
	result.Observed.Thumbnail = renderPrivateDerivative(path, thumbnailMaxDimension, inspected.Orientation)
	result.Observed.Preview = renderPrivateDerivative(path, previewMaxDimension, inspected.Orientation)
	result.Observed.OriginalView = observeOriginalView(path, inspected.Format)

	if inspected.Format != sample.Format {
		result.Differences = append(result.Differences, fmt.Sprintf("format=%s want %s", inspected.Format, sample.Format))
	}
	if inspected.MimeType != sample.MIMEType {
		result.Differences = append(result.Differences, fmt.Sprintf("mimeType=%s want %s", inspected.MimeType, sample.MIMEType))
	}
	if sample.Expected.Width > 0 && inspected.Width != sample.Expected.Width {
		result.Differences = append(result.Differences, fmt.Sprintf("width=%d want %d", inspected.Width, sample.Expected.Width))
	}
	if sample.Expected.Height > 0 && inspected.Height != sample.Expected.Height {
		result.Differences = append(result.Differences, fmt.Sprintf("height=%d want %d", inspected.Height, sample.Expected.Height))
	}
	if sample.Expected.Orientation > 0 && inspected.Orientation != sample.Expected.Orientation {
		result.Differences = append(result.Differences, fmt.Sprintf("orientation=%d want %d", inspected.Orientation, sample.Expected.Orientation))
	}
	compareCapability := func(name, expected, observed string) {
		if expected != "not_verified" && expected != observed {
			result.Differences = append(result.Differences, fmt.Sprintf("%s=%s want %s", name, observed, expected))
		}
	}
	compareCapability("index", sample.Expected.Index, result.Observed.Index)
	compareCapability("metadata", sample.Expected.Metadata, result.Observed.Metadata)
	compareCapability("thumbnail", sample.Expected.Thumbnail, result.Observed.Thumbnail)
	compareCapability("preview", sample.Expected.Preview, result.Observed.Preview)
	compareCapability("originalView", sample.Expected.OriginalView, result.Observed.OriginalView)
	if len(result.Differences) > 0 {
		result.Status = "failed"
	} else if sample.Verification.Status == "failed" {
		result.Status = "failed"
		result.Differences = append(result.Differences, "manifest records failed verification")
	} else if sample.Verification.Status == "passed" {
		result.Status = "passed"
	} else {
		result.Status = "not_verified"
	}
	return result
}

func renderPrivateDerivative(source string, maxDimension, orientation int) string {
	directory, err := os.MkdirTemp("", "mo-gallery-private-evidence-")
	if err != nil {
		return "unavailable"
	}
	defer os.RemoveAll(directory)
	if err := renderJPEGDerivative(context.Background(), source, filepath.Join(directory, "derivative.jpg"), maxDimension, orientation); err != nil {
		return "unavailable"
	}
	return "ready"
}

func observeOriginalView(path, format string) string {
	config, _, err := decodeMediaConfigContext(context.Background(), path, format)
	if err != nil {
		return "unavailable"
	}
	if err := validateOriginalViewDimensions(config.Width, config.Height); err != nil {
		return "unavailable"
	}
	return "ready"
}

func observedMetadataCapability(status string) string {
	switch status {
	case "ready":
		return "ready"
	case "partial":
		return "partial"
	default:
		return "unavailable"
	}
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func privateSampleVerificationBasis(sample privateMediaSample) (string, error) {
	payload := map[string]any{
		"id":              sample.ID,
		"variant":         sample.Variant,
		"relativePath":    sample.RelativePath,
		"sha256":          sample.SHA256,
		"byteSize":        sample.ByteSize,
		"format":          sample.Format,
		"mimeType":        sample.MIMEType,
		"sourceClass":     sample.SourceClass,
		"cameraOrEncoder": sample.CameraOrEncoder,
		"licenseNote":     sample.LicenseNote,
		"expected": map[string]any{
			"width": sample.Expected.Width, "height": sample.Expected.Height, "orientation": sample.Expected.Orientation,
			"index": sample.Expected.Index, "metadata": sample.Expected.Metadata, "thumbnail": sample.Expected.Thumbnail,
			"preview": sample.Expected.Preview, "originalView": sample.Expected.OriginalView,
		},
	}
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(payload); err != nil {
		return "", err
	}
	data := bytes.TrimSuffix(encoded.Bytes(), []byte{'\n'})
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:]), nil
}

func allowedPrivateFormat(value string) bool {
	return oneOf(value, "jpeg", "png", "webp", "gif", "avif", "heif", "tiff", "cr2", "cr3", "nef", "arw", "dng", "raf", "rw2")
}

func oneOf(value string, values ...string) bool {
	for _, allowed := range values {
		if value == allowed {
			return true
		}
	}
	return false
}

func aggregateEvidenceStatus(results []privateMediaEvidenceResult) string {
	if len(results) == 0 {
		return "not_verified"
	}
	status := "passed"
	for _, result := range results {
		if result.Status == "failed" {
			return "failed"
		}
		if result.Status != "passed" {
			status = "not_verified"
		}
	}
	return status
}

func missingRequiredPrivateCases(samples []privateMediaSample, results []privateMediaEvidenceResult) []string {
	required := map[string][]string{
		"jpeg": {"normal", "exif_rotation", "no_exif", "truncated", "very_large"},
		"png":  {"alpha", "indexed", "16_bit", "malformed"},
		"webp": {"lossy", "lossless", "alpha", "animated"},
		"gif":  {"single_frame", "animated", "high_frame_count", "malformed"},
		"avif": {"static"},
		"heif": {"device_1", "device_2"},
		"tiff": {"8_bit", "16_bit", "orientation"},
		"cr2":  {"camera_original"},
		"cr3":  {"camera_original"},
		"nef":  {"camera_original"},
		"arw":  {"camera_original"},
		"dng":  {"camera_original"},
		"raf":  {"camera_original"},
		"rw2":  {"camera_original"},
	}
	passedIDs := map[string]bool{}
	for _, result := range results {
		if result.Status == "passed" {
			passedIDs[result.ID] = true
		}
	}
	present := map[string]map[string]bool{}
	heifDevices := map[string]bool{}
	for _, sample := range samples {
		if !passedIDs[sample.ID] || privateSampleHasUnverifiedExpectation(sample) {
			continue
		}
		if isRAWFormat(sample.Format) && (sample.SourceClass != "camera-original" || strings.TrimSpace(sample.CameraOrEncoder) == "") {
			continue
		}
		if present[sample.Format] == nil {
			present[sample.Format] = map[string]bool{}
		}
		present[sample.Format][sample.Variant] = true
		if sample.Format == "heif" && strings.TrimSpace(sample.CameraOrEncoder) != "" {
			heifDevices[strings.ToLower(strings.TrimSpace(sample.CameraOrEncoder))] = true
		}
	}
	missing := []string{}
	for format, variants := range required {
		for _, variant := range variants {
			if !present[format][variant] {
				missing = append(missing, format+"/"+variant)
			}
		}
	}
	if len(heifDevices) < 2 {
		missing = append(missing, "heif/distinct_device_or_encoder_count>=2")
	}
	sort.Strings(missing)
	return missing
}

func privateSampleHasUnverifiedExpectation(sample privateMediaSample) bool {
	return sample.Expected.Index == "not_verified" || sample.Expected.Metadata == "not_verified" || sample.Expected.Thumbnail == "not_verified" || sample.Expected.Preview == "not_verified" || sample.Expected.OriginalView == "not_verified"
}

func privateEvidenceEnvironmentMismatch(sample privateMediaSample, environment evidenceEnvironment) string {
	if environment.OS != "windows" || environment.Architecture != "amd64" || (!strings.Contains(environment.WindowsVersion, "Windows 10") && !strings.Contains(environment.WindowsVersion, "Windows 11")) {
		return "current run is not Windows 10/11 x64 acceptance evidence"
	}
	if strings.TrimSpace(environment.CPU) == "" || strings.TrimSpace(environment.RAM) == "" || strings.TrimSpace(environment.Disk) == "" || strings.TrimSpace(environment.DiskType) == "" || strings.TrimSpace(environment.FileSystem) == "" || strings.TrimSpace(environment.AppVersion) == "" || strings.TrimSpace(environment.Revision) == "" {
		return "current acceptance environment metadata is incomplete"
	}
	if environment.WindowsVersion != sample.Verification.WindowsVersion {
		return "current Windows version does not match the manifest verification"
	}
	if environment.AppVersion != sample.Verification.AppVersion {
		return "current app version does not match the manifest verification"
	}
	return ""
}

func releaseEvidenceEnvironment() evidenceEnvironment {
	return evidenceEnvironment{
		OS:               runtime.GOOS,
		Architecture:     runtime.GOARCH,
		WindowsVersion:   os.Getenv("LOCAL_LIBRARY_WINDOWS_VERSION"),
		CPU:              os.Getenv("LOCAL_LIBRARY_CPU"),
		RAM:              os.Getenv("LOCAL_LIBRARY_RAM"),
		Disk:             os.Getenv("LOCAL_LIBRARY_DISK"),
		DiskType:         os.Getenv("LOCAL_LIBRARY_DISK_TYPE"),
		FileSystem:       os.Getenv("LOCAL_LIBRARY_FILE_SYSTEM"),
		CacheState:       os.Getenv("LOCAL_LIBRARY_CACHE_STATE"),
		CachePreparation: os.Getenv("LOCAL_LIBRARY_CACHE_PREPARATION"),
		AppVersion:       os.Getenv("LOCAL_LIBRARY_APP_VERSION"),
		Revision:         os.Getenv("LOCAL_LIBRARY_REVISION"),
	}
}

func releaseEvidenceGateEnabled() bool {
	return strings.TrimSpace(os.Getenv("LOCAL_LIBRARY_RELEASE_GATE")) == "1"
}

func writePrivateEvidenceReport(t *testing.T, report privateMediaEvidenceReport) {
	t.Helper()
	path := strings.TrimSpace(os.Getenv("LOCAL_LIBRARY_EVIDENCE_REPORT"))
	if path == "" {
		return
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatalf("marshal private evidence report: %v", err)
	}
	data = append(data, '\n')
	if err := writeAtomicEvidenceFile(path, data); err != nil {
		t.Fatalf("write private evidence report: %v", err)
	}
}

func writeAtomicEvidenceFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return fmt.Errorf("evidence report already exists: %s", path)
		}
		return err
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}
