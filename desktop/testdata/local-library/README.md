# Local Library Release Fixtures

This directory defines the V1.1 private-media and 100,000-item benchmark contracts. Real private photos and generated reports are not committed.

## Files

```text
desktop/testdata/local-library/
|- private-manifest.schema.json  # committed private-manifest contract
|- manifest.template.json        # empty manifest starting point
|- generate_manifest.py          # generator and strict validator
|- benchmark-fixture.v1.json     # deterministic mixed-library distribution
|- evidence-report.schema.json   # sanitized report contract
|- manifest.local.json           # ignored acceptance-machine manifest
|- samples/                      # ignored private media
`- reports/                      # ignored local reports
```

Paths in the private manifest are relative to this directory and must remain under `samples/`. Symlinks, duplicate IDs, duplicate paths, path traversal, hash/size mismatches, stale verification bases, and unknown enum values are rejected.

## Private Media Workflow

Create or refresh the manifest:

```text
cd desktop/testdata/local-library
python generate_manifest.py samples --output manifest.local.json
```

Validate without changing it:

```text
python generate_manifest.py samples --output manifest.local.json --validate
```

The generator merges manual fields by `relativePath`. A `passed` result is reset to `not_verified` whenever file identity, source/license/device information, or expected behavior changes. Removed files stop generation unless `--prune` is explicitly supplied. A missing sample must remain `not_verified`; absence never implies success.

Run the application media pipeline and write a sanitized report:

```text
cd desktop
set LOCAL_LIBRARY_PRIVATE_MANIFEST=testdata\local-library\manifest.local.json
set LOCAL_LIBRARY_EVIDENCE_REPORT=testdata\local-library\reports\private-media-<timestamp>.json
set LOCAL_LIBRARY_WINDOWS_VERSION=Windows 11 24H2
set LOCAL_LIBRARY_CPU=<cpu-model>
set LOCAL_LIBRARY_RAM=<installed-ram>
set LOCAL_LIBRARY_DISK=<disk-model>
set LOCAL_LIBRARY_DISK_TYPE=NVMe SSD
set LOCAL_LIBRARY_FILE_SYSTEM=NTFS
set LOCAL_LIBRARY_APP_VERSION=0.7.0-beta
set LOCAL_LIBRARY_REVISION=<git-commit>
go test ./local_library -run TestPrivateMediaReleaseEvidence -count=1 -v
```

Set `LOCAL_LIBRARY_RELEASE_GATE=1` only on an acceptance run. Gate mode fails when any required format is failed or not verified.

## Minimum Media Matrix

- JPEG/JPG variants: `normal`, `exif_rotation`, `no_exif`, `truncated`, and `very_large`.
- PNG variants: `alpha`, `indexed`, `16_bit`, and `malformed`.
- WebP variants: `lossy`, `lossless`, `alpha`, and `animated` with the expected downgrade documented.
- GIF variants: `single_frame`, `animated`, `high_frame_count`, and `malformed`.
- AVIF variant: `static`; animated/multiframe remains uncommitted support until verified.
- HEIC/HEIF variants: `device_1` and `device_2`, with distinct non-empty device or encoder values.
- TIFF variants: `8_bit`, `16_bit`, and `orientation`.
- RAW variant `camera_original` for each of CR2, CR3, NEF, ARW, DNG, RAF, and Panasonic RW2; use real camera files where licensing permits.

Each entry records a required `variant`, SHA-256, byte size, canonical format, source class, camera/encoder, license note, expected dimensions/orientation, indexing/metadata/thumbnail/preview/original-view behavior, Windows version, app version, verification date, and `passed`, `failed`, or `not_verified` status. Gate mode requires every named variant above to pass in the current run; historical manifest status alone is insufficient.

Do not record owner names, precise GPS coordinates, credentials, private URLs, or absolute sample paths. Reports contain sample IDs and hashes, not source files.

## Deterministic Benchmark Fixture

`benchmark-fixture.v1.json` commits the seed and exact distributions for:

- formats, dimensions, and file-size buckets;
- directory depth and empty folders;
- complete, partial, and missing EXIF;
- ready, pending, and unavailable previews;
- active and missing assets;
- tags, collections, ratings, colors, and favorites.

The Go fixture populates the production SQLite schema, indexes, FTS5 table, derivative records, and organization relations. A 500-item determinism/invariant test runs normally. The full 100,000-item fixture is opt-in.

Prepare the persistent 100,000-item application library in a separate command (preparation is intentionally not timed):

```text
cd desktop
set LOCAL_LIBRARY_PREPARE_100K=1
set LOCAL_LIBRARY_BENCHMARK_FIXTURE_ROOT=D:\acceptance\mo-gallery-benchmark-100k
go test ./local_library -run TestPrepareLocalLibraryBenchmarkFixture -count=1 -v
```

After preparation completes, clear/restart the relevant Windows file-system cache before the cold run. The measurement command reads only the small committed fixture summary before starting the timer; it does not validate or hash the SQLite database before the manager-open measurement.

Run the structured release benchmark on Windows 10/11 x64:

```text
cd desktop
set LOCAL_LIBRARY_RUN_100K=1
set LOCAL_LIBRARY_BENCHMARK_FIXTURE_ROOT=D:\acceptance\mo-gallery-benchmark-100k
set LOCAL_LIBRARY_BENCHMARK_REPORT=testdata\local-library\reports\benchmark-warm-<timestamp>.json
set LOCAL_LIBRARY_WINDOWS_VERSION=Windows 11 24H2
set LOCAL_LIBRARY_CPU=<cpu-model>
set LOCAL_LIBRARY_RAM=<installed-ram>
set LOCAL_LIBRARY_DISK=<disk-model>
set LOCAL_LIBRARY_DISK_TYPE=NVMe SSD
set LOCAL_LIBRARY_FILE_SYSTEM=NTFS
set LOCAL_LIBRARY_CACHE_STATE=warm
set LOCAL_LIBRARY_CACHE_PREPARATION=fixture created in this run; repeated queries use the populated Windows cache
set LOCAL_LIBRARY_APP_VERSION=0.7.0-beta
set LOCAL_LIBRARY_REVISION=<git-commit>
go test ./local_library -run TestLocalLibraryBenchmarkReleaseEvidence -count=1 -v
```

Repeat with `LOCAL_LIBRARY_CACHE_STATE=cold` only after the acceptance operator has deliberately cleared/restarted the relevant Windows file-system cache, and describe the exact action in `LOCAL_LIBRARY_CACHE_PREPARATION`. Reopening SQLite alone is process-cold, not proof of an OS-cold cache. Use a new immutable report filename for every run.

For the second (gate) run, set `LOCAL_LIBRARY_RELEASE_GATE=1` and `LOCAL_LIBRARY_BENCHMARK_COUNTERPART_REPORT` to the first passed report. The gate verifies matching fixture signature, app revision, hardware/filesystem identity, and opposite `cold`/`warm` cache states. This produces an auditable pair rather than accepting a cache-state label in isolation.

For standard Go benchmark output:

```text
set LOCAL_LIBRARY_RUN_100K=1
go test ./local_library -run ^$ -bench BenchmarkListAssets100K -benchmem -count=1
```

The structured suite records production SQLite open/migration plus backend first-page delivery (2 s threshold), then warm-up-excluded P50/P95 values and result counts for the database first-page query, cursor page, FTS, deep folder, format/preview, rating/favorite/color, tag, collection, and EXIF queries. Database-query P95 thresholds are 300 ms. The acceptance operator remains responsible for the documented OS-cache preparation; the paired-report gate ensures both cold and warm runs exist and match. UI rendering time is recorded separately in the V1.1 release-gate report because the Go fixture does not launch WebView2.

## Evidence Status

- `passed`: the sample/scenario matched its contract and all required acceptance environment fields are present.
- `failed`: observed behavior differs from the contract or a performance threshold is exceeded.
- `not_verified`: samples, hardware, explicit execution, or environment metadata are missing.

Generated reports remain ignored locally. Release automation must archive the sanitized JSON reports as build/release artifacts so the evidence is durable without uploading private media.
