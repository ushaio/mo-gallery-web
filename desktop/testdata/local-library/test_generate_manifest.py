from __future__ import annotations

import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("generate_manifest.py")
SPEC = importlib.util.spec_from_file_location("generate_manifest", MODULE_PATH)
assert SPEC and SPEC.loader
manifest_tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manifest_tool)


class ManifestToolTests(unittest.TestCase):
    def test_stable_ids_do_not_collide_for_ambiguous_paths(self) -> None:
        first = manifest_tool.stable_sample_id("a/b__c.jpg")
        second = manifest_tool.stable_sample_id("a__b/c.jpg")
        self.assertNotEqual(first, second)
        self.assertEqual(first, manifest_tool.stable_sample_id("a/b__c.jpg"))

    def test_rw2_uses_canonical_format_and_mime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            samples = base / "samples"
            samples.mkdir()
            (samples / "panasonic.rw2").write_bytes(b"RW2 fixture bytes")
            output = base / "manifest.local.json"
            parser = manifest_tool.argparse.ArgumentParser()

            document = manifest_tool.build_manifest(samples, output, False, parser)
            self.assertEqual(document["samples"][0]["format"], "rw2")
            self.assertEqual(document["samples"][0]["mimeType"], "image/x-panasonic-rw2")

    def test_changed_verification_basis_resets_passed_status(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            samples = base / "samples"
            samples.mkdir()
            sample = samples / "photo.jpg"
            sample.write_bytes(b"first-version")
            output = base / "manifest.local.json"
            parser = manifest_tool.argparse.ArgumentParser()

            document = manifest_tool.build_manifest(samples, output, False, parser)
            item = document["samples"][0]
            item["sourceClass"] = "self-created"
            item["cameraOrEncoder"] = "test encoder"
            item["expected"] = {
                "width": 1,
                "height": 1,
                "orientation": 1,
                "index": "supported",
                "metadata": "ready",
                "thumbnail": "ready",
                "preview": "ready",
                "originalView": "ready",
            }
            item["verification"] = {
                "status": "passed",
                "windowsVersion": "Windows 11 24H2",
                "appVersion": "test",
                "verifiedAt": "2026-08-02",
                "notes": "",
            }
            item["verificationBasis"] = manifest_tool.verification_basis(item)
            manifest_tool.write_json_atomic(output, document)

            sample.write_bytes(b"second-version")
            refreshed = manifest_tool.build_manifest(samples, output, False, parser)
            refreshed_item = refreshed["samples"][0]
            self.assertEqual(refreshed_item["verification"]["status"], "not_verified")
            self.assertEqual(refreshed_item["sha256"], hashlib.sha256(b"second-version").hexdigest())

    def test_unknown_fields_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            samples = base / "samples"
            samples.mkdir()
            sample = samples / "photo.jpg"
            sample.write_bytes(b"fixture")
            parser = manifest_tool.argparse.ArgumentParser()
            document = manifest_tool.build_manifest(samples, base / "manifest.local.json", False, parser)
            document["samples"][0]["unexpected"] = True
            errors = manifest_tool.validate_manifest(document, base / "manifest.local.json", samples)
            self.assertTrue(any("unknown field unexpected" in error for error in errors))

    def test_missing_sample_cannot_remain_passed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            samples = base / "samples"
            samples.mkdir()
            output = base / "manifest.local.json"
            item = {
                "id": "missing-sample",
                "variant": "normal",
                "relativePath": "samples/missing.jpg",
                "sha256": "0" * 64,
                "byteSize": 10,
                "format": "jpeg",
                "mimeType": "image/jpeg",
                "sourceClass": "self-created",
                "cameraOrEncoder": "test encoder",
                "licenseNote": "private verification only",
                "expected": {
                    "width": 1,
                    "height": 1,
                    "orientation": 1,
                    "index": "supported",
                    "metadata": "ready",
                    "thumbnail": "ready",
                    "preview": "ready",
                    "originalView": "ready",
                },
                "verification": {
                    "status": "passed",
                    "windowsVersion": "Windows 11",
                    "appVersion": "test",
                    "verifiedAt": "2026-08-02",
                    "notes": "",
                },
            }
            item["verificationBasis"] = manifest_tool.verification_basis(item)
            document = {
                "schemaVersion": 1,
                "fixtureSet": "test",
                "updatedAt": "2026-08-02",
                "samples": [item],
            }
            output.write_text(json.dumps(document), encoding="utf-8")
            errors = manifest_tool.validate_manifest(document, output, samples)
            self.assertTrue(any("missing sample must be not_verified" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
