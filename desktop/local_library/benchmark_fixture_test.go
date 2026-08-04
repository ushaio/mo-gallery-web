package local_library

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
)

const (
	benchmarkFixtureSchemaVersion = 1
	benchmarkFixtureSummaryFile   = "benchmark-fixture-summary.v1.json"
)

type benchmarkFixtureSpec struct {
	SchemaVersion    int                           `json:"schemaVersion"`
	FixtureID        string                        `json:"fixtureId"`
	Seed             int64                         `json:"seed"`
	AssetCount       int                           `json:"assetCount"`
	MaxFolderDepth   int                           `json:"maxFolderDepth"`
	EmptyFolderCount int                           `json:"emptyFolderCount"`
	TagCount         int                           `json:"tagCount"`
	CollectionCount  int                           `json:"collectionCount"`
	Distributions    benchmarkFixtureDistributions `json:"distributions"`
}

type benchmarkFixtureDistributions struct {
	Formats      map[string]int `json:"formats"`
	Dimensions   map[string]int `json:"dimensions"`
	FileSizes    map[string]int `json:"fileSizes"`
	EXIF         map[string]int `json:"exif"`
	Preview      map[string]int `json:"preview"`
	Availability map[string]int `json:"availability"`
}

type benchmarkFixtureSummary struct {
	FixtureID        string                    `json:"fixtureId"`
	Seed             int64                     `json:"seed"`
	AssetCount       int                       `json:"assetCount"`
	FolderCount      int                       `json:"folderCount"`
	EmptyFolderCount int                       `json:"emptyFolderCount"`
	TagCount         int                       `json:"tagCount"`
	CollectionCount  int                       `json:"collectionCount"`
	Histograms       map[string]map[string]int `json:"histograms"`
	Signature        string                    `json:"signature"`
}

type benchmarkScenario struct {
	ID        string
	Query     AssetQuery
	Threshold time.Duration
}

type benchmarkEvidenceResult struct {
	ID          string  `json:"id"`
	Status      string  `json:"status"`
	Iterations  int     `json:"iterations"`
	ResultCount int64   `json:"resultCount"`
	P50MS       float64 `json:"p50Ms"`
	P95MS       float64 `json:"p95Ms"`
	ThresholdMS float64 `json:"thresholdMs"`
	Notes       string  `json:"notes,omitempty"`
}

type benchmarkEvidenceReport struct {
	SchemaVersion int                       `json:"schemaVersion"`
	Kind          string                    `json:"kind"`
	GeneratedAt   string                    `json:"generatedAt"`
	Status        string                    `json:"status"`
	Fixture       *benchmarkFixtureSummary  `json:"fixture,omitempty"`
	Environment   evidenceEnvironment       `json:"environment"`
	Results       []benchmarkEvidenceResult `json:"results"`
}

func TestBenchmarkFixtureContract(t *testing.T) {
	spec := loadBenchmarkFixtureSpec(t)
	validateBenchmarkFixtureSpec(t, spec)
}

func TestAggregateBenchmarkStatusPrefersFailures(t *testing.T) {
	environment := evidenceEnvironment{
		OS: "windows", Architecture: "amd64", WindowsVersion: "Windows 11 24H2", CPU: "test", RAM: "test", Disk: "test", DiskType: "SSD", FileSystem: "NTFS",
		CacheState: "warm", CachePreparation: "test preparation", AppVersion: "test", Revision: "test",
	}
	status := aggregateBenchmarkStatus([]benchmarkEvidenceResult{{ID: "missing", Status: "not_verified"}, {ID: "slow", Status: "failed"}}, environment)
	if status != "failed" {
		t.Fatalf("aggregate status=%q, want failed", status)
	}
}

func TestBenchmarkFixtureDeterministicSmall(t *testing.T) {
	spec := loadBenchmarkFixtureSpec(t)
	spec.AssetCount = 500
	firstStore, firstSummary, _ := createBenchmarkFixture(t, spec)
	defer firstStore.Close()
	secondStore, secondSummary, _ := createBenchmarkFixture(t, spec)
	defer secondStore.Close()
	if firstSummary.Signature != secondSummary.Signature {
		t.Fatalf("fixture signatures differ: %s != %s", firstSummary.Signature, secondSummary.Signature)
	}
	firstJSON, _ := json.Marshal(firstSummary.Histograms)
	secondJSON, _ := json.Marshal(secondSummary.Histograms)
	if string(firstJSON) != string(secondJSON) {
		t.Fatalf("fixture histograms differ:\n%s\n%s", firstJSON, secondJSON)
	}
	assertBenchmarkFixtureInvariants(t, firstStore, spec, firstSummary)
}

func TestPrepareLocalLibraryBenchmarkFixture(t *testing.T) {
	if os.Getenv("LOCAL_LIBRARY_PREPARE_100K") != "1" {
		t.Skip("set LOCAL_LIBRARY_PREPARE_100K=1")
	}
	root := strings.TrimSpace(os.Getenv("LOCAL_LIBRARY_BENCHMARK_FIXTURE_ROOT"))
	if root == "" {
		t.Fatal("LOCAL_LIBRARY_BENCHMARK_FIXTURE_ROOT is required")
	}
	spec := loadBenchmarkFixtureSpec(t)
	store, summary := prepareBenchmarkFixtureAtRoot(t, root, spec)
	defer store.Close()
	assertBenchmarkFixtureInvariants(t, store, spec, summary)
	if err := writeJSONAtomic(internalPath(root, benchmarkFixtureSummaryFile), summary); err != nil {
		t.Fatalf("write benchmark fixture summary: %v", err)
	}
	t.Logf("prepared benchmark fixture %s at %s", summary.Signature, root)
}

func TestLocalLibraryBenchmarkReleaseEvidence(t *testing.T) {
	spec := loadBenchmarkFixtureSpec(t)
	report := benchmarkEvidenceReport{
		SchemaVersion: benchmarkFixtureSchemaVersion,
		Kind:          "benchmark",
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Status:        "not_verified",
		Environment:   releaseEvidenceEnvironment(),
		Results:       []benchmarkEvidenceResult{},
	}
	if os.Getenv("LOCAL_LIBRARY_RUN_100K") != "1" {
		report.Results = append(report.Results, benchmarkEvidenceResult{ID: "100k-query-suite", Status: "not_verified", Notes: "set LOCAL_LIBRARY_RUN_100K=1 on the acceptance machine"})
		writeBenchmarkEvidenceReport(t, report)
		t.Log("100k local-library benchmark evidence: not_verified")
		if releaseEvidenceGateEnabled() {
			t.Fatal("release gate requires LOCAL_LIBRARY_RUN_100K=1")
		}
		return
	}

	root := strings.TrimSpace(os.Getenv("LOCAL_LIBRARY_BENCHMARK_FIXTURE_ROOT"))
	if root == "" {
		report.Results = append(report.Results, benchmarkEvidenceResult{ID: "prepared-100k-fixture", Status: "not_verified", Notes: "set LOCAL_LIBRARY_BENCHMARK_FIXTURE_ROOT to a separately prepared fixture"})
		writeBenchmarkEvidenceReport(t, report)
		if releaseEvidenceGateEnabled() {
			t.Fatal("release gate requires a separately prepared benchmark fixture")
		}
		return
	}
	summary := loadPreparedBenchmarkFixtureSummary(t, root, spec)
	report.Fixture = &summary
	manager, openResult := measureExistingLibraryOpenFirstPage(t, root)
	defer manager.Close()
	report.Results = append(report.Results, openResult)
	session, err := manager.currentSession()
	if err != nil {
		t.Fatal(err)
	}
	scenarios := benchmarkScenarios(t, session.store)
	for _, scenario := range scenarios {
		report.Results = append(report.Results, measureBenchmarkScenario(t, session.store, scenario, 25))
	}
	report.Status = aggregateBenchmarkStatus(report.Results, report.Environment)
	writeBenchmarkEvidenceReport(t, report)
	if report.Status == "failed" {
		t.Errorf("100k local-library benchmark exceeded one or more thresholds")
	}
	if releaseEvidenceGateEnabled() {
		if report.Status != "passed" {
			t.Fatalf("100k local-library benchmark release gate blocked: %s", report.Status)
		}
		if err := validateBenchmarkCounterpartReport(report); err != nil {
			t.Fatalf("100k local-library benchmark release gate requires matching cold/warm evidence: %v", err)
		}
	}
}

func BenchmarkListAssets100K(b *testing.B) {
	if os.Getenv("LOCAL_LIBRARY_RUN_100K") != "1" {
		b.Skip("set LOCAL_LIBRARY_RUN_100K=1")
	}
	spec := loadBenchmarkFixtureSpec(b)
	store, _, _ := createBenchmarkFixture(b, spec)
	defer store.Close()
	for _, scenario := range benchmarkScenarios(b, store) {
		b.Run(scenario.ID, func(b *testing.B) {
			ctx := context.Background()
			b.ReportAllocs()
			b.ResetTimer()
			for range b.N {
				if _, err := store.listAssets(ctx, scenario.Query, "benchmark-session", ScanStatus{State: "completed"}); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

type fixtureTestingT interface {
	Helper()
	Fatalf(string, ...any)
	TempDir() string
}

func loadBenchmarkFixtureSpec(t interface {
	Helper()
	Fatalf(string, ...any)
}) benchmarkFixtureSpec {
	t.Helper()
	path := filepath.Join("..", "testdata", "local-library", "benchmark-fixture.v1.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read benchmark fixture spec: %v", err)
	}
	var spec benchmarkFixtureSpec
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&spec); err != nil {
		t.Fatalf("decode benchmark fixture spec: %v", err)
	}
	validateBenchmarkFixtureSpec(t, spec)
	return spec
}

func validateBenchmarkFixtureSpec(t interface {
	Helper()
	Fatalf(string, ...any)
}, spec benchmarkFixtureSpec) {
	t.Helper()
	if spec.SchemaVersion != benchmarkFixtureSchemaVersion || spec.FixtureID == "" || spec.Seed == 0 || spec.AssetCount <= 0 {
		t.Fatalf("invalid benchmark fixture identity: %+v", spec)
	}
	if spec.MaxFolderDepth < 1 || spec.EmptyFolderCount < 1 || spec.TagCount < 1 || spec.CollectionCount < 1 {
		t.Fatalf("invalid benchmark fixture cardinalities: %+v", spec)
	}
	validateDistribution(t, "formats", spec.Distributions.Formats, []string{"jpeg", "png", "webp", "gif", "avif", "heif", "tiff", "cr2", "cr3", "nef", "arw", "dng", "raf", "rw2"})
	validateDistribution(t, "dimensions", spec.Distributions.Dimensions, []string{"small", "medium", "large", "very_large"})
	validateDistribution(t, "fileSizes", spec.Distributions.FileSizes, []string{"under_1mb", "1_to_5mb", "5_to_20mb", "over_20mb"})
	validateDistribution(t, "exif", spec.Distributions.EXIF, []string{"complete", "partial", "missing"})
	validateDistribution(t, "preview", spec.Distributions.Preview, []string{"ready", "pending", "unavailable"})
	validateDistribution(t, "availability", spec.Distributions.Availability, []string{"active", "missing"})
}

func validateDistribution(t interface {
	Helper()
	Fatalf(string, ...any)
}, name string, distribution map[string]int, order []string) {
	t.Helper()
	total := 0
	for _, key := range order {
		value, ok := distribution[key]
		if !ok || value < 0 {
			t.Fatalf("distribution %s is missing %s", name, key)
		}
		total += value
	}
	if len(distribution) != len(order) || total != 100 {
		t.Fatalf("distribution %s must contain only the declared buckets and total 100: %+v", name, distribution)
	}
}

func createBenchmarkFixture(t fixtureTestingT, spec benchmarkFixtureSpec) (*store, benchmarkFixtureSummary, string) {
	t.Helper()
	root := t.TempDir()
	fixtureStore, summary := prepareBenchmarkFixtureAtRoot(t, root, spec)
	return fixtureStore, summary, root
}

func prepareBenchmarkFixtureAtRoot(t interface {
	Helper()
	Fatalf(string, ...any)
}, root string, spec benchmarkFixtureSpec) (*store, benchmarkFixtureSummary) {
	t.Helper()
	if _, err := os.Stat(internalPath(root)); err == nil {
		t.Fatalf("benchmark fixture root is already initialized: %s", root)
	} else if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("inspect benchmark fixture root: %v", err)
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("create benchmark fixture root: %v", err)
	}
	if err := prepareLibraryStructure(root); err != nil {
		t.Fatalf("prepare benchmark library structure: %v", err)
	}
	if _, err := createManifest(root, "ADR-0044 100K Benchmark"); err != nil {
		t.Fatalf("create benchmark library manifest: %v", err)
	}
	fixtureStore, err := openStore(root)
	if err != nil {
		t.Fatalf("open benchmark store: %v", err)
	}
	summary, err := seedBenchmarkFixture(context.Background(), fixtureStore, spec)
	if err != nil {
		_ = fixtureStore.Close()
		t.Fatalf("seed benchmark fixture: %v", err)
	}
	return fixtureStore, summary
}

func loadPreparedBenchmarkFixtureSummary(t testing.TB, root string, spec benchmarkFixtureSpec) benchmarkFixtureSummary {
	t.Helper()
	data, err := os.ReadFile(internalPath(root, benchmarkFixtureSummaryFile))
	if err != nil {
		t.Fatalf("read prepared benchmark fixture summary: %v", err)
	}
	var summary benchmarkFixtureSummary
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&summary); err != nil {
		t.Fatalf("decode prepared benchmark fixture summary: %v", err)
	}
	if summary.FixtureID != spec.FixtureID || summary.Seed != spec.Seed || summary.AssetCount != spec.AssetCount || summary.Signature == "" {
		t.Fatalf("prepared benchmark fixture summary does not match committed spec: %+v", summary)
	}
	return summary
}

func seedBenchmarkFixture(ctx context.Context, fixtureStore *store, spec benchmarkFixtureSpec) (benchmarkFixtureSummary, error) {
	tx, err := fixtureStore.db.BeginTx(ctx, nil)
	if err != nil {
		return benchmarkFixtureSummary{}, err
	}
	defer tx.Rollback()
	if err := disableBenchmarkSearchTriggers(tx); err != nil {
		return benchmarkFixtureSummary{}, err
	}
	folderIDs, emptyFolderCount, err := insertBenchmarkFolders(ctx, tx, spec)
	if err != nil {
		return benchmarkFixtureSummary{}, err
	}
	if err := insertBenchmarkOrganization(ctx, tx, spec); err != nil {
		return benchmarkFixtureSummary{}, err
	}

	histograms := map[string]map[string]int{
		"formats": {}, "dimensions": {}, "fileSizes": {}, "exif": {}, "preview": {}, "availability": {},
	}
	assetStatement, err := tx.PrepareContext(ctx, `INSERT INTO assets(
		id,folder_id,relative_path,path_key,file_name,extension,format,mime_type,byte_size,modified_at_ns,width,height,orientation,is_animated,frame_count,
		availability,preview_status,preview_error,metadata_status,display_title,notes,rating,color_label,dominant_colors,is_favorite,captured_at,discovered_at,technical_updated_at,scan_token
	) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		return benchmarkFixtureSummary{}, err
	}
	defer assetStatement.Close()
	exifStatement, err := tx.PrepareContext(ctx, `INSERT INTO exif_metadata(asset_id,camera_make,camera_model,lens_model,iso,aperture,shutter_seconds,focal_length_mm,raw_json) VALUES(?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		return benchmarkFixtureSummary{}, err
	}
	defer exifStatement.Close()
	derivativeStatement, err := tx.PrepareContext(ctx, `INSERT INTO asset_derivatives(asset_id,variant,cache_key,content_version,decoder_version,max_dimension,width,height,byte_size,status,error,generated_at,last_accessed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		return benchmarkFixtureSummary{}, err
	}
	defer derivativeStatement.Close()
	tagStatement, err := tx.PrepareContext(ctx, `INSERT INTO asset_tags(asset_id,tag_id) VALUES(?,?)`)
	if err != nil {
		return benchmarkFixtureSummary{}, err
	}
	defer tagStatement.Close()
	collectionStatement, err := tx.PrepareContext(ctx, `INSERT INTO collection_assets(collection_id,asset_id,added_at) VALUES(?,?,?)`)
	if err != nil {
		return benchmarkFixtureSummary{}, err
	}
	defer collectionStatement.Close()

	formatOrder := []string{"jpeg", "png", "webp", "gif", "avif", "heif", "tiff", "cr2", "cr3", "nef", "arw", "dng", "raf", "rw2"}
	dimensionOrder := []string{"small", "medium", "large", "very_large"}
	sizeOrder := []string{"under_1mb", "1_to_5mb", "5_to_20mb", "over_20mb"}
	exifOrder := []string{"complete", "partial", "missing"}
	previewOrder := []string{"ready", "pending", "unavailable"}
	availabilityOrder := []string{"active", "missing"}
	baseTime := time.Date(2010, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli()
	colorLabels := []string{"", "red", "yellow", "green", "blue", "purple"}
	for index := 0; index < spec.AssetCount; index++ {
		formatName := distributionBucket(index, spec.Seed, spec.Distributions.Formats, formatOrder)
		dimensionBucket := distributionBucket(index, spec.Seed+11, spec.Distributions.Dimensions, dimensionOrder)
		sizeBucket := distributionBucket(index, spec.Seed+23, spec.Distributions.FileSizes, sizeOrder)
		exifBucket := distributionBucket(index, spec.Seed+37, spec.Distributions.EXIF, exifOrder)
		previewStatus := distributionBucket(index, spec.Seed+41, spec.Distributions.Preview, previewOrder)
		availability := distributionBucket(index, spec.Seed+53, spec.Distributions.Availability, availabilityOrder)
		histograms["formats"][formatName]++
		histograms["dimensions"][dimensionBucket]++
		histograms["fileSizes"][sizeBucket]++
		histograms["exif"][exifBucket]++
		histograms["preview"][previewStatus]++
		histograms["availability"][availability]++

		folderPath := benchmarkFolderPath(index, spec.MaxFolderDepth)
		var folderID any
		if folderPath != "" {
			folderID = folderIDs[folderPath]
		}
		extension, mimeType := benchmarkFormatDetails(formatName)
		fileName := fmt.Sprintf("photo-%06d%s", index, extension)
		relativePath := fileName
		if folderPath != "" {
			relativePath = folderPath + "/" + fileName
		}
		width, height := benchmarkDimensions(dimensionBucket, index)
		byteSize := benchmarkByteSize(sizeBucket, index)
		assetID := fmt.Sprintf("asset-%06d", index)
		capturedAt := baseTime + int64(index)*int64(6*time.Hour/time.Millisecond)
		discoveredAt := baseTime + int64(index)*1000
		notes := ""
		if index%20 == 0 {
			notes = "travel benchmark selection"
		}
		metadataStatus := "ready"
		if exifBucket == "partial" {
			metadataStatus = "partial"
		} else if exifBucket == "missing" {
			metadataStatus = "unavailable"
		}
		previewError := ""
		if previewStatus == "unavailable" {
			previewError = "deterministic fixture decode failure"
		}
		_, err = assetStatement.ExecContext(ctx,
			assetID, folderID, relativePath, strings.ToLower(relativePath), fileName, extension, formatName, mimeType, byteSize,
			int64(index+1)*1_000_000, width, height, index%8+1, formatName == "gif" && index%2 == 0, 1+index%12,
			availability, previewStatus, previewError, metadataStatus, fmt.Sprintf("Benchmark Photo %06d", index), notes,
			index%6, colorLabels[index%len(colorLabels)], `["#334455","#8899aa"]`, index%10 == 0, capturedAt, discoveredAt, discoveredAt, "benchmark-fixture-v1")
		if err != nil {
			return benchmarkFixtureSummary{}, err
		}
		if exifBucket != "missing" {
			cameraMake, cameraModel, lensModel := "Benchmark Camera Co", "Model Complete", "24-70mm"
			var iso, aperture, shutter, focal any = 100 + index%6400, 2.8 + float64(index%5), 1.0 / float64(30+index%500), 24 + index%177
			if exifBucket == "partial" {
				cameraModel, lensModel, aperture, shutter, focal = "Model Partial", "", nil, nil, nil
			}
			if _, err := exifStatement.ExecContext(ctx, assetID, cameraMake, cameraModel, lensModel, iso, aperture, shutter, focal, `{}`); err != nil {
				return benchmarkFixtureSummary{}, err
			}
		}
		derivativeStatus := previewStatus
		if derivativeStatus == "pending" {
			derivativeStatus = "pending"
		}
		for _, variant := range []struct {
			name string
			dim  int
		}{{"thumbnail", thumbnailMaxDimension}, {"preview", previewMaxDimension}} {
			status := derivativeStatus
			if variant.name == "thumbnail" && status == "unavailable" && index%2 == 0 {
				status = "ready"
			}
			_, err := derivativeStatement.ExecContext(ctx, assetID, variant.name, fmt.Sprintf("fixture-%s-%06d", variant.name, index), derivativeContentVersion, derivativeDecoderVersion, variant.dim, minInt(width, variant.dim), minInt(height, variant.dim), 4096+index%65536, status, previewError, discoveredAt, discoveredAt)
			if err != nil {
				return benchmarkFixtureSummary{}, err
			}
		}
		if index%3 != 0 {
			if _, err := tagStatement.ExecContext(ctx, assetID, fmt.Sprintf("tag-%02d", index%spec.TagCount)); err != nil {
				return benchmarkFixtureSummary{}, err
			}
		}
		if index%4 == 0 {
			if _, err := collectionStatement.ExecContext(ctx, fmt.Sprintf("collection-%02d", index%spec.CollectionCount), assetID, discoveredAt); err != nil {
				return benchmarkFixtureSummary{}, err
			}
		}
	}
	if err := rebuildBenchmarkSearchIndex(tx); err != nil {
		return benchmarkFixtureSummary{}, err
	}
	if err := tx.Commit(); err != nil {
		return benchmarkFixtureSummary{}, err
	}
	summary := benchmarkFixtureSummary{
		FixtureID: spec.FixtureID, Seed: spec.Seed, AssetCount: spec.AssetCount, FolderCount: len(folderIDs), EmptyFolderCount: emptyFolderCount,
		TagCount: spec.TagCount, CollectionCount: spec.CollectionCount, Histograms: histograms,
	}
	signature, err := benchmarkFixtureSignature(ctx, fixtureStore.db, summary)
	if err != nil {
		return benchmarkFixtureSummary{}, err
	}
	summary.Signature = signature
	return summary, nil
}

func disableBenchmarkSearchTriggers(tx *sql.Tx) error {
	triggers := []string{
		"asset_search_assets_insert", "asset_search_assets_update", "asset_search_assets_delete", "asset_search_exif_insert", "asset_search_exif_update", "asset_search_exif_delete",
		"asset_search_asset_tags_insert", "asset_search_asset_tags_delete", "asset_search_tags_update", "asset_search_collection_assets_insert", "asset_search_collection_assets_delete", "asset_search_collections_update",
	}
	for _, trigger := range triggers {
		if _, err := tx.Exec(`DROP TRIGGER IF EXISTS ` + trigger); err != nil {
			return err
		}
	}
	return nil
}

func rebuildBenchmarkSearchIndex(tx *sql.Tx) error {
	if _, err := tx.Exec(`DELETE FROM asset_search`); err != nil {
		return err
	}
	if _, err := tx.Exec(`INSERT INTO asset_search(asset_id,file_name,relative_path,display_title,notes,tags,collections,camera)
		SELECT asset_id,file_name,relative_path,display_title,notes,tags,collections,camera FROM asset_search_source`); err != nil {
		return err
	}
	statements := []string{
		assetSearchTrigger("asset_search_assets_insert", "AFTER INSERT ON assets", "NEW.id"),
		assetSearchTrigger("asset_search_assets_update", "AFTER UPDATE OF file_name,relative_path,display_title,notes ON assets", "NEW.id"),
		`CREATE TRIGGER IF NOT EXISTS asset_search_assets_delete AFTER DELETE ON assets BEGIN DELETE FROM asset_search WHERE asset_id=OLD.id; END`,
		assetSearchTrigger("asset_search_exif_insert", "AFTER INSERT ON exif_metadata", "NEW.asset_id"),
		assetSearchTrigger("asset_search_exif_update", "AFTER UPDATE OF camera_make,camera_model,lens_model ON exif_metadata", "NEW.asset_id"),
		assetSearchTrigger("asset_search_exif_delete", "AFTER DELETE ON exif_metadata", "OLD.asset_id"),
		assetSearchTrigger("asset_search_asset_tags_insert", "AFTER INSERT ON asset_tags", "NEW.asset_id"),
		assetSearchTrigger("asset_search_asset_tags_delete", "AFTER DELETE ON asset_tags", "OLD.asset_id"),
		assetSearchRelatedTrigger("asset_search_tags_update", "AFTER UPDATE OF name ON tags", "asset_tags", "tag_id", "NEW.id"),
		assetSearchTrigger("asset_search_collection_assets_insert", "AFTER INSERT ON collection_assets", "NEW.asset_id"),
		assetSearchTrigger("asset_search_collection_assets_delete", "AFTER DELETE ON collection_assets", "OLD.asset_id"),
		assetSearchRelatedTrigger("asset_search_collections_update", "AFTER UPDATE OF name ON collections", "collection_assets", "collection_id", "NEW.id"),
	}
	for _, statement := range statements {
		if _, err := tx.Exec(statement); err != nil {
			return err
		}
	}
	return nil
}

func insertBenchmarkFolders(ctx context.Context, tx *sql.Tx, spec benchmarkFixtureSpec) (map[string]string, int, error) {
	paths := map[string]struct{}{}
	for index := 0; index < spec.AssetCount; index++ {
		path := benchmarkFolderPath(index, spec.MaxFolderDepth)
		for path != "" {
			paths[path] = struct{}{}
			parent := filepath.ToSlash(filepath.Dir(path))
			if parent == "." {
				break
			}
			path = parent
		}
	}
	paths["empty"] = struct{}{}
	for index := 0; index < spec.EmptyFolderCount; index++ {
		paths[fmt.Sprintf("empty/slot-%03d", index)] = struct{}{}
	}
	ordered := make([]string, 0, len(paths))
	for path := range paths {
		ordered = append(ordered, path)
	}
	sort.Slice(ordered, func(i, j int) bool {
		leftDepth := strings.Count(ordered[i], "/")
		rightDepth := strings.Count(ordered[j], "/")
		if leftDepth == rightDepth {
			return ordered[i] < ordered[j]
		}
		return leftDepth < rightDepth
	})
	ids := make(map[string]string, len(ordered))
	statement, err := tx.PrepareContext(ctx, `INSERT INTO folders(id,parent_id,relative_path,path_key,name,availability,discovered_at,updated_at) VALUES(?,?,?,?,?,'active',?,?)`)
	if err != nil {
		return nil, 0, err
	}
	defer statement.Close()
	for index, path := range ordered {
		id := fmt.Sprintf("folder-%06d", index)
		ids[path] = id
		parentPath := filepath.ToSlash(filepath.Dir(path))
		var parentID any
		if parentPath != "." {
			parentID = ids[parentPath]
		}
		if _, err := statement.ExecContext(ctx, id, parentID, path, strings.ToLower(path), filepath.Base(path), int64(index), int64(index)); err != nil {
			return nil, 0, err
		}
	}
	return ids, spec.EmptyFolderCount, nil
}

func insertBenchmarkOrganization(ctx context.Context, tx *sql.Tx, spec benchmarkFixtureSpec) error {
	for index := 0; index < spec.TagCount; index++ {
		if _, err := tx.ExecContext(ctx, `INSERT INTO tags(id,name,name_key,color,created_at) VALUES(?,?,?,?,?)`, fmt.Sprintf("tag-%02d", index), fmt.Sprintf("Tag %02d", index), fmt.Sprintf("tag %02d", index), "", index); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO collection_groups(id,parent_id,name,position) VALUES('benchmark-group',NULL,'Benchmark Collections',0)`); err != nil {
		return err
	}
	for index := 0; index < spec.CollectionCount; index++ {
		if _, err := tx.ExecContext(ctx, `INSERT INTO collections(id,group_id,name,notes,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, fmt.Sprintf("collection-%02d", index), "benchmark-group", fmt.Sprintf("Collection %02d", index), "benchmark fixture", index, index, index); err != nil {
			return err
		}
	}
	return nil
}

func distributionBucket(index int, seed int64, distribution map[string]int, order []string) string {
	position := int((int64(index)*37 + seed) % 100)
	if position < 0 {
		position += 100
	}
	cumulative := 0
	for _, key := range order {
		cumulative += distribution[key]
		if position < cumulative {
			return key
		}
	}
	return order[len(order)-1]
}

func benchmarkFolderPath(index, maxDepth int) string {
	depth := index % (maxDepth + 1)
	if depth == 0 {
		return ""
	}
	parts := make([]string, depth)
	for level := 0; level < depth; level++ {
		parts[level] = fmt.Sprintf("d%d-%02d", level+1, (index/(level+1)/17)%16)
	}
	return strings.Join(parts, "/")
}

func benchmarkFormatDetails(formatName string) (string, string) {
	values := map[string][2]string{
		"jpeg": {".jpg", "image/jpeg"}, "png": {".png", "image/png"}, "webp": {".webp", "image/webp"}, "gif": {".gif", "image/gif"},
		"avif": {".avif", "image/avif"}, "heif": {".heic", "image/heif"}, "tiff": {".tiff", "image/tiff"}, "cr2": {".cr2", "image/x-canon-cr2"},
		"cr3": {".cr3", "image/x-canon-cr3"}, "nef": {".nef", "image/x-nikon-nef"}, "arw": {".arw", "image/x-sony-arw"}, "dng": {".dng", "image/x-adobe-dng"}, "raf": {".raf", "image/x-fuji-raf"}, "rw2": {".rw2", "image/x-panasonic-rw2"},
	}
	value := values[formatName]
	return value[0], value[1]
}

func benchmarkDimensions(bucket string, index int) (int, int) {
	switch bucket {
	case "small":
		return 1280 + index%640, 720 + index%360
	case "medium":
		return 3000 + index%1000, 2000 + index%800
	case "large":
		return 6000 + index%2200, 4000 + index%1600
	default:
		return 12000 + index%4000, 8000 + index%2400
	}
}

func benchmarkByteSize(bucket string, index int) int64 {
	switch bucket {
	case "under_1mb":
		return int64(128*1024 + index%(768*1024))
	case "1_to_5mb":
		return int64(1*1024*1024 + index%(4*1024*1024))
	case "5_to_20mb":
		return int64(5*1024*1024 + index%(15*1024*1024))
	default:
		return int64(20*1024*1024 + index%(80*1024*1024))
	}
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func benchmarkFixtureSignature(ctx context.Context, db *sql.DB, summary benchmarkFixtureSummary) (string, error) {
	digest := sha256.New()
	summaryJSON, err := json.Marshal(summary.Histograms)
	if err != nil {
		return "", err
	}
	_, _ = digest.Write(summaryJSON)
	queries := []struct {
		name  string
		query string
	}{
		{"folders", `SELECT * FROM folders ORDER BY id`},
		{"assets", `SELECT * FROM assets ORDER BY id`},
		{"exif_metadata", `SELECT * FROM exif_metadata ORDER BY asset_id`},
		{"asset_derivatives", `SELECT * FROM asset_derivatives ORDER BY asset_id,variant`},
		{"tags", `SELECT * FROM tags ORDER BY id`},
		{"asset_tags", `SELECT * FROM asset_tags ORDER BY asset_id,tag_id`},
		{"collection_groups", `SELECT * FROM collection_groups ORDER BY id`},
		{"collections", `SELECT * FROM collections ORDER BY id`},
		{"collection_assets", `SELECT * FROM collection_assets ORDER BY collection_id,asset_id`},
		{"asset_search", `SELECT * FROM asset_search ORDER BY asset_id`},
	}
	for _, item := range queries {
		if err := hashBenchmarkQuery(ctx, digest, db, item.name, item.query); err != nil {
			return "", err
		}
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func hashBenchmarkQuery(ctx context.Context, digest io.Writer, db *sql.DB, name, query string) error {
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("query signature table %s: %w", name, err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return err
	}
	_, _ = fmt.Fprintf(digest, "table:%s\ncolumns:%s\n", name, strings.Join(columns, ","))
	values := make([]any, len(columns))
	targets := make([]any, len(columns))
	for index := range values {
		targets[index] = &values[index]
	}
	for rows.Next() {
		if err := rows.Scan(targets...); err != nil {
			return err
		}
		for _, value := range values {
			switch typed := value.(type) {
			case nil:
				_, _ = io.WriteString(digest, "-1:")
			case []byte:
				_, _ = fmt.Fprintf(digest, "%d:", len(typed))
				_, _ = digest.Write(typed)
			default:
				text := fmt.Sprint(typed)
				_, _ = fmt.Fprintf(digest, "%d:%s", len(text), text)
			}
			_, _ = io.WriteString(digest, "|")
		}
		_, _ = io.WriteString(digest, "\n")
	}
	return rows.Err()
}

func assertBenchmarkFixtureInvariants(t testing.TB, fixtureStore *store, spec benchmarkFixtureSpec, summary benchmarkFixtureSummary) {
	t.Helper()
	counts := map[string]int{}
	queries := map[string]string{
		"assets": "SELECT COUNT(*) FROM assets", "search": "SELECT COUNT(*) FROM asset_search", "tags": "SELECT COUNT(*) FROM tags", "collections": "SELECT COUNT(*) FROM collections",
		"emptyFolders": "SELECT COUNT(*) FROM folders f LEFT JOIN assets a ON a.folder_id=f.id WHERE f.relative_path LIKE 'empty/slot-%' AND a.id IS NULL",
	}
	for name, query := range queries {
		var count int
		if err := fixtureStore.db.QueryRow(query).Scan(&count); err != nil {
			t.Fatalf("count benchmark %s: %v", name, err)
		}
		counts[name] = count
	}
	if counts["assets"] != spec.AssetCount || counts["search"] != spec.AssetCount || counts["tags"] != spec.TagCount || counts["collections"] != spec.CollectionCount || counts["emptyFolders"] != spec.EmptyFolderCount {
		t.Fatalf("benchmark fixture invariant mismatch: counts=%+v summary=%+v", counts, summary)
	}
	for name, histogram := range summary.Histograms {
		total := 0
		for _, count := range histogram {
			total += count
		}
		if total != spec.AssetCount {
			t.Fatalf("histogram %s total=%d, want %d", name, total, spec.AssetCount)
		}
	}
	actualHistograms := map[string]map[string]int{
		"formats":      queryBenchmarkHistogram(t, fixtureStore.db, `SELECT format,COUNT(*) FROM assets GROUP BY format`),
		"preview":      queryBenchmarkHistogram(t, fixtureStore.db, `SELECT preview_status,COUNT(*) FROM assets GROUP BY preview_status`),
		"availability": queryBenchmarkHistogram(t, fixtureStore.db, `SELECT availability,COUNT(*) FROM assets GROUP BY availability`),
		"dimensions": queryBenchmarkHistogram(t, fixtureStore.db, `SELECT CASE
			WHEN width<2500 THEN 'small' WHEN width<5000 THEN 'medium' WHEN width<10000 THEN 'large' ELSE 'very_large' END,COUNT(*) FROM assets GROUP BY 1`),
		"fileSizes": queryBenchmarkHistogram(t, fixtureStore.db, `SELECT CASE
			WHEN byte_size<1048576 THEN 'under_1mb' WHEN byte_size<5242880 THEN '1_to_5mb' WHEN byte_size<20971520 THEN '5_to_20mb' ELSE 'over_20mb' END,COUNT(*) FROM assets GROUP BY 1`),
		"exif": queryBenchmarkHistogram(t, fixtureStore.db, `SELECT CASE metadata_status
			WHEN 'ready' THEN 'complete' WHEN 'partial' THEN 'partial' ELSE 'missing' END,COUNT(*) FROM assets GROUP BY 1`),
	}
	for name, actual := range actualHistograms {
		if !reflect.DeepEqual(actual, summary.Histograms[name]) {
			t.Fatalf("histogram %s database=%+v generated=%+v", name, actual, summary.Histograms[name])
		}
	}
	var derivatives, tagRelations, collectionRelations, exifRows int
	if err := fixtureStore.db.QueryRow(`SELECT COUNT(*) FROM asset_derivatives`).Scan(&derivatives); err != nil {
		t.Fatal(err)
	}
	if err := fixtureStore.db.QueryRow(`SELECT COUNT(*) FROM asset_tags`).Scan(&tagRelations); err != nil {
		t.Fatal(err)
	}
	if err := fixtureStore.db.QueryRow(`SELECT COUNT(*) FROM collection_assets`).Scan(&collectionRelations); err != nil {
		t.Fatal(err)
	}
	if err := fixtureStore.db.QueryRow(`SELECT COUNT(*) FROM exif_metadata`).Scan(&exifRows); err != nil {
		t.Fatal(err)
	}
	if derivatives != spec.AssetCount*2 || tagRelations != spec.AssetCount-(spec.AssetCount+2)/3 || collectionRelations != (spec.AssetCount+3)/4 || exifRows != summary.Histograms["exif"]["complete"]+summary.Histograms["exif"]["partial"] {
		t.Fatalf("relation invariant mismatch: derivatives=%d tags=%d collections=%d exif=%d", derivatives, tagRelations, collectionRelations, exifRows)
	}
}

func queryBenchmarkHistogram(t testing.TB, db *sql.DB, query string) map[string]int {
	t.Helper()
	rows, err := db.Query(query)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	result := map[string]int{}
	for rows.Next() {
		var bucket string
		var count int
		if err := rows.Scan(&bucket, &count); err != nil {
			t.Fatal(err)
		}
		result[bucket] = count
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return result
}

func benchmarkScenariosContract() []benchmarkScenario {
	return []benchmarkScenario{
		{ID: "db-first-page-query", Threshold: 300 * time.Millisecond},
		{ID: "cursor-page", Threshold: 300 * time.Millisecond},
		{ID: "fts-travel", Threshold: 300 * time.Millisecond},
		{ID: "deep-folder", Threshold: 300 * time.Millisecond},
		{ID: "format-preview", Threshold: 300 * time.Millisecond},
		{ID: "rating-favorite", Threshold: 300 * time.Millisecond},
		{ID: "tag", Threshold: 300 * time.Millisecond},
		{ID: "collection", Threshold: 300 * time.Millisecond},
		{ID: "exif", Threshold: 300 * time.Millisecond},
	}
}

func benchmarkScenarios(t testing.TB, fixtureStore *store) []benchmarkScenario {
	t.Helper()
	first, err := fixtureStore.listAssets(context.Background(), AssetQuery{Limit: 60}, "benchmark-session", ScanStatus{State: "completed"})
	if err != nil {
		t.Fatalf("prepare benchmark cursor: %v", err)
	}
	var deepFolder string
	if err := fixtureStore.db.QueryRow(`SELECT f.relative_path FROM folders f JOIN assets a ON a.folder_id=f.id WHERE a.availability='active' ORDER BY LENGTH(f.relative_path) DESC,f.relative_path LIMIT 1`).Scan(&deepFolder); err != nil {
		t.Fatalf("prepare deep-folder benchmark: %v", err)
	}
	ratingMin := 4
	isoMin := 800
	return []benchmarkScenario{
		{ID: "db-first-page-query", Query: AssetQuery{Limit: 60}, Threshold: 300 * time.Millisecond},
		{ID: "cursor-page", Query: AssetQuery{Limit: 60, Cursor: first.NextCursor}, Threshold: 300 * time.Millisecond},
		{ID: "fts-travel", Query: AssetQuery{Limit: 60, Search: "travel"}, Threshold: 300 * time.Millisecond},
		{ID: "deep-folder", Query: AssetQuery{Limit: 60, Folder: deepFolder, DirectFolderOnly: true, Sort: "name"}, Threshold: 300 * time.Millisecond},
		{ID: "format-preview", Query: AssetQuery{Limit: 60, Formats: []string{"heif", "tiff", "cr3"}, PreviewStatuses: []string{"ready", "unavailable"}}, Threshold: 300 * time.Millisecond},
		{ID: "rating-favorite", Query: AssetQuery{Limit: 60, FavoritesOnly: true, RatingMin: &ratingMin, ColorLabels: []string{"red", "blue"}, Sort: "rating"}, Threshold: 300 * time.Millisecond},
		{ID: "tag", Query: AssetQuery{Limit: 60, TagIDs: []string{"tag-07"}}, Threshold: 300 * time.Millisecond},
		{ID: "collection", Query: AssetQuery{Limit: 60, CollectionIDs: []string{"collection-04"}}, Threshold: 300 * time.Millisecond},
		{ID: "exif", Query: AssetQuery{Limit: 60, CameraMakes: []string{"Benchmark Camera Co"}, ISOMin: &isoMin, Orientation: "landscape"}, Threshold: 300 * time.Millisecond},
	}
}

func measureExistingLibraryOpenFirstPage(t testing.TB, root string) (*Manager, benchmarkEvidenceResult) {
	t.Helper()
	manager := NewManager(t.TempDir(), nil)
	manager.startWatch = func(*librarySession) error { return nil }
	manager.skipInitialScan = true
	started := time.Now()
	if _, err := manager.Open(root); err != nil {
		t.Fatalf("open existing benchmark library through manager: %v", err)
	}
	page, err := manager.ListAssets(AssetQuery{Limit: 60})
	elapsed := time.Since(started)
	if err != nil {
		_ = manager.Close()
		t.Fatalf("load existing benchmark first page: %v", err)
	}
	threshold := 2 * time.Second
	status := "passed"
	if elapsed > threshold {
		status = "failed"
	}
	return manager, benchmarkEvidenceResult{
		ID: "existing-library-open-first-page", Status: status, Iterations: 1, ResultCount: page.Total,
		P50MS: durationMilliseconds(elapsed), P95MS: durationMilliseconds(elapsed), ThresholdMS: durationMilliseconds(threshold),
		Notes: "measures manifest validation, locking, manager/session restore, SQLite open/migration, and backend first-page delivery; initial reconciliation is deferred until after first-screen evidence",
	}
}

func measureBenchmarkScenario(t testing.TB, fixtureStore *store, scenario benchmarkScenario, iterations int) benchmarkEvidenceResult {
	t.Helper()
	durations := make([]time.Duration, 0, iterations)
	var resultCount int64
	for index := 0; index < iterations+1; index++ {
		started := time.Now()
		page, err := fixtureStore.listAssets(context.Background(), scenario.Query, "benchmark-session", ScanStatus{State: "completed"})
		elapsed := time.Since(started)
		if err != nil {
			t.Fatalf("measure benchmark %s: %v", scenario.ID, err)
		}
		resultCount = page.Total
		if index > 0 {
			durations = append(durations, elapsed)
		}
	}
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })
	p50 := percentileDuration(durations, 0.50)
	p95 := percentileDuration(durations, 0.95)
	status := "passed"
	if p95 > scenario.Threshold {
		status = "failed"
	}
	return benchmarkEvidenceResult{
		ID: scenario.ID, Status: status, Iterations: iterations, ResultCount: resultCount,
		P50MS: durationMilliseconds(p50), P95MS: durationMilliseconds(p95), ThresholdMS: durationMilliseconds(scenario.Threshold),
	}
}

func percentileDuration(values []time.Duration, percentile float64) time.Duration {
	if len(values) == 0 {
		return 0
	}
	index := int(float64(len(values)-1)*percentile + 0.5)
	if index >= len(values) {
		index = len(values) - 1
	}
	return values[index]
}

func durationMilliseconds(value time.Duration) float64 {
	return float64(value) / float64(time.Millisecond)
}

func aggregateBenchmarkStatus(results []benchmarkEvidenceResult, environment evidenceEnvironment) string {
	status := "passed"
	for _, result := range results {
		if result.Status == "failed" {
			return "failed"
		}
		if result.Status != "passed" {
			status = "not_verified"
		}
	}
	cacheState := strings.TrimSpace(environment.CacheState)
	if environment.OS != "windows" || environment.Architecture != "amd64" || (!strings.Contains(environment.WindowsVersion, "Windows 10") && !strings.Contains(environment.WindowsVersion, "Windows 11")) || strings.TrimSpace(environment.CPU) == "" || strings.TrimSpace(environment.RAM) == "" || strings.TrimSpace(environment.Disk) == "" || strings.TrimSpace(environment.DiskType) == "" || strings.TrimSpace(environment.FileSystem) == "" || !oneOf(cacheState, "cold", "warm") || strings.TrimSpace(environment.CachePreparation) == "" || strings.TrimSpace(environment.AppVersion) == "" || strings.TrimSpace(environment.Revision) == "" {
		return "not_verified"
	}
	return status
}

func validateBenchmarkCounterpartReport(current benchmarkEvidenceReport) error {
	path := strings.TrimSpace(os.Getenv("LOCAL_LIBRARY_BENCHMARK_COUNTERPART_REPORT"))
	if path == "" {
		return fmt.Errorf("LOCAL_LIBRARY_BENCHMARK_COUNTERPART_REPORT is required")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var counterpart benchmarkEvidenceReport
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&counterpart); err != nil {
		return fmt.Errorf("decode counterpart report: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("counterpart report contains trailing JSON values")
	}
	if counterpart.SchemaVersion != benchmarkFixtureSchemaVersion || counterpart.Kind != "benchmark" || counterpart.Status != "passed" {
		return fmt.Errorf("counterpart is not passed benchmark evidence")
	}
	if counterpart.Fixture == nil || current.Fixture == nil {
		return fmt.Errorf("current and counterpart reports require fixture summaries")
	}
	if counterpart.Fixture.FixtureID != current.Fixture.FixtureID || counterpart.Fixture.Seed != current.Fixture.Seed || counterpart.Fixture.AssetCount != current.Fixture.AssetCount || counterpart.Fixture.Signature != current.Fixture.Signature {
		return fmt.Errorf("counterpart fixture identity does not match")
	}
	if !oneOf(current.Environment.CacheState, "cold", "warm") || !oneOf(counterpart.Environment.CacheState, "cold", "warm") || current.Environment.CacheState == counterpart.Environment.CacheState {
		return fmt.Errorf("current and counterpart reports must cover opposite cold/warm cache states")
	}
	if counterpart.Environment.OS != current.Environment.OS || counterpart.Environment.Architecture != current.Environment.Architecture || counterpart.Environment.WindowsVersion != current.Environment.WindowsVersion || counterpart.Environment.CPU != current.Environment.CPU || counterpart.Environment.RAM != current.Environment.RAM || counterpart.Environment.Disk != current.Environment.Disk || counterpart.Environment.DiskType != current.Environment.DiskType || counterpart.Environment.FileSystem != current.Environment.FileSystem || counterpart.Environment.AppVersion != current.Environment.AppVersion || counterpart.Environment.Revision != current.Environment.Revision {
		return fmt.Errorf("counterpart acceptance environment does not match current run")
	}
	if strings.TrimSpace(counterpart.Environment.CachePreparation) == "" {
		return fmt.Errorf("counterpart cache preparation is required")
	}
	if err := validatePassedBenchmarkResults(counterpart.Results); err != nil {
		return fmt.Errorf("counterpart results: %w", err)
	}
	if aggregateBenchmarkStatus(counterpart.Results, counterpart.Environment) != "passed" {
		return fmt.Errorf("counterpart aggregate status is not passed")
	}
	return nil
}

func validatePassedBenchmarkResults(results []benchmarkEvidenceResult) error {
	required := map[string]time.Duration{"existing-library-open-first-page": 2 * time.Second}
	for _, scenario := range benchmarkScenariosContract() {
		required[scenario.ID] = scenario.Threshold
	}
	seen := map[string]bool{}
	for _, result := range results {
		threshold, ok := required[result.ID]
		if !ok {
			return fmt.Errorf("unexpected scenario %q", result.ID)
		}
		if seen[result.ID] {
			return fmt.Errorf("duplicate scenario %q", result.ID)
		}
		seen[result.ID] = true
		knownThreshold := durationMilliseconds(threshold)
		if result.Status != "passed" || result.Iterations < 1 || result.ThresholdMS != knownThreshold || result.P95MS > knownThreshold {
			return fmt.Errorf("scenario %q is not valid passed evidence", result.ID)
		}
	}
	for id := range required {
		if !seen[id] {
			return fmt.Errorf("missing scenario %q", id)
		}
	}
	return nil
}

func writeBenchmarkEvidenceReport(t testing.TB, report benchmarkEvidenceReport) {
	t.Helper()
	path := strings.TrimSpace(os.Getenv("LOCAL_LIBRARY_BENCHMARK_REPORT"))
	if path == "" {
		return
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatalf("marshal benchmark evidence report: %v", err)
	}
	data = append(data, '\n')
	if err := writeAtomicEvidenceFile(path, data); err != nil {
		t.Fatalf("write benchmark evidence report: %v", err)
	}
}
