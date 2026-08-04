import json
import unittest
from pathlib import Path

try:
    import jsonschema
except ImportError:  # pragma: no cover - acceptance machines install the validator.
    jsonschema = None


BASE = Path(__file__).parent
SCHEMA = json.loads((BASE / "evidence-report.schema.json").read_text(encoding="utf-8"))


def environment(cache_state="", cache_preparation=""):
    return {
        "os": "windows",
        "architecture": "amd64",
        "windowsVersion": "Windows 11 24H2",
        "cpu": "test cpu",
        "ram": "32 GB",
        "disk": "test disk",
        "diskType": "NVMe SSD",
        "fileSystem": "NTFS",
        "cacheState": cache_state,
        "cachePreparation": cache_preparation,
        "appVersion": "0.7.0-beta",
        "revision": "0123456789abcdef",
    }


@unittest.skipIf(jsonschema is None, "install jsonschema to validate evidence schemas")
class EvidenceReportSchemaTests(unittest.TestCase):
    def validate(self, document):
        jsonschema.validate(document, SCHEMA)

    def test_not_verified_benchmark_without_fixture_is_valid(self):
        self.validate({
            "schemaVersion": 1,
            "kind": "benchmark",
            "generatedAt": "2026-08-02T00:00:00Z",
            "status": "not_verified",
            "environment": environment(),
            "results": [{
                "id": "100k-query-suite",
                "status": "not_verified",
                "iterations": 0,
                "resultCount": 0,
                "p50Ms": 0,
                "p95Ms": 0,
                "thresholdMs": 0,
            }],
        })

    def test_passed_benchmark_requires_complete_fixture_and_cache_attestation(self):
        report = {
            "schemaVersion": 1,
            "kind": "benchmark",
            "generatedAt": "2026-08-02T00:00:00Z",
            "status": "passed",
            "fixture": {
                "fixtureId": "mixed-photo-library-v1",
                "seed": 440011,
                "assetCount": 100000,
                "folderCount": 10,
                "emptyFolderCount": 1,
                "tagCount": 24,
                "collectionCount": 12,
                "histograms": {"formats": {"jpeg": 100000}},
                "signature": "fixture-signature",
            },
            "environment": environment("warm", "repeated query run"),
            "results": [{
                "id": "existing-library-open-first-page",
                "status": "passed",
                "iterations": 1,
                "resultCount": 100000,
                "p50Ms": 100,
                "p95Ms": 100,
                "thresholdMs": 2000,
            }],
        }
        self.validate(report)
        report["environment"]["cachePreparation"] = ""
        with self.assertRaises(jsonschema.ValidationError):
            self.validate(report)

    def test_passed_private_report_requires_manifest(self):
        report = {
            "schemaVersion": 1,
            "kind": "private-media",
            "generatedAt": "2026-08-02T00:00:00Z",
            "status": "passed",
            "environment": environment(),
            "results": [{
                "id": "jpeg-normal",
                "sha256": "0" * 64,
                "format": "jpeg",
                "status": "passed",
                "observed": {
                    "index": "supported",
                    "metadata": "ready",
                    "thumbnail": "ready",
                    "preview": "ready",
                    "originalView": "ready",
                },
            }],
        }
        with self.assertRaises(jsonschema.ValidationError):
            self.validate(report)
        report["manifest"] = {"fixtureSet": "private-v1", "sha256": "1" * 64}
        self.validate(report)


if __name__ == "__main__":
    unittest.main()
