#!/usr/bin/env python3
"""Generate and validate private local-library release-evidence manifests."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path, PurePosixPath
from typing import Any

FORMAT_BY_SUFFIX = {
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".png": "png",
    ".webp": "webp",
    ".gif": "gif",
    ".avif": "avif",
    ".heic": "heif",
    ".heif": "heif",
    ".tif": "tiff",
    ".tiff": "tiff",
    ".cr2": "cr2",
    ".cr3": "cr3",
    ".nef": "nef",
    ".arw": "arw",
    ".dng": "dng",
    ".raf": "raf",
    ".rw2": "rw2",
}
FORMATS = set(FORMAT_BY_SUFFIX.values())
CAPABILITIES = {"ready", "partial", "unavailable", "not_applicable", "not_verified"}
INDEX_EXPECTATIONS = {"supported", "unsupported", "not_verified"}
VERIFICATION_STATUSES = {"passed", "failed", "not_verified"}
SOURCE_CLASSES = {"self-created", "camera-original", "licensed-test-media", "private-local-sample"}
ROOT_FIELDS = {"schemaVersion", "fixtureSet", "updatedAt", "samples"}
SAMPLE_FIELDS = {"id", "variant", "relativePath", "sha256", "byteSize", "format", "mimeType", "sourceClass", "cameraOrEncoder", "licenseNote", "expected", "verification", "verificationBasis"}
EXPECTED_FIELDS = {"width", "height", "orientation", "index", "metadata", "thumbnail", "preview", "originalView"}
VERIFICATION_FIELDS = {"status", "windowsVersion", "appVersion", "verifiedAt", "notes"}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
VARIANT_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_sample_id(relative: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", str(PurePosixPath(relative).with_suffix(""))).strip("-._")
    stem = stem[:96] or "sample"
    path_hash = hashlib.sha256(relative.encode("utf-8")).hexdigest()[:12]
    return f"{stem}-{path_hash}"


def verification_basis(entry: dict[str, Any]) -> str:
    payload = {
        "id": entry["id"],
        "variant": entry["variant"],
        "relativePath": entry["relativePath"],
        "sha256": entry["sha256"],
        "byteSize": entry["byteSize"],
        "format": entry["format"],
        "mimeType": entry["mimeType"],
        "sourceClass": entry["sourceClass"],
        "cameraOrEncoder": entry["cameraOrEncoder"],
        "licenseNote": entry["licenseNote"],
        "expected": entry["expected"],
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def load_document(path: Path, parser: argparse.ArgumentParser) -> dict[str, Any]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        parser.error(f"cannot read manifest {path}: {error}")
    if not isinstance(document, dict):
        parser.error(f"manifest must be a JSON object: {path}")
    return document


def canonical_sample_path(relative_path: str) -> PurePosixPath | None:
    if "\\" in relative_path:
        return None
    value = PurePosixPath(relative_path)
    if value.is_absolute() or not value.parts or value.parts[0] != "samples":
        return None
    if any(part in {"", ".", ".."} for part in value.parts):
        return None
    return value


def require_string(item: dict[str, Any], field: str, sample_id: str, errors: list[str]) -> str:
    value = item.get(field)
    if not isinstance(value, str):
        errors.append(f"{sample_id}: {field} must be a string")
        return ""
    return value


def reject_unknown_fields(value: dict[str, Any], allowed: set[str], location: str, errors: list[str]) -> None:
    for field in sorted(set(value) - allowed):
        errors.append(f"{location}: unknown field {field}")


def validate_manifest(document: dict[str, Any], manifest_path: Path, samples_root: Path) -> list[str]:
    errors: list[str] = []
    reject_unknown_fields(document, ROOT_FIELDS, "manifest", errors)
    if document.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    if not isinstance(document.get("fixtureSet"), str) or not document["fixtureSet"].strip():
        errors.append("fixtureSet must be a non-empty string")
    try:
        datetime.strptime(str(document.get("updatedAt", "")), "%Y-%m-%d")
    except ValueError:
        errors.append("updatedAt must use YYYY-MM-DD")
    samples = document.get("samples")
    if not isinstance(samples, list):
        return errors + ["samples must be an array"]

    ids: set[str] = set()
    paths: set[str] = set()
    resolved_samples_root = samples_root.resolve()
    for index, raw_item in enumerate(samples):
        if not isinstance(raw_item, dict):
            errors.append(f"samples[{index}] must be an object")
            continue
        reject_unknown_fields(raw_item, SAMPLE_FIELDS, f"samples[{index}]", errors)
        sample_id = require_string(raw_item, "id", f"samples[{index}]", errors)
        if not ID_RE.fullmatch(sample_id):
            errors.append(f"{sample_id or f'samples[{index}]'}: invalid id")
        if sample_id in ids:
            errors.append(f"{sample_id}: duplicate id")
        ids.add(sample_id)
        variant = require_string(raw_item, "variant", sample_id, errors)
        if not VARIANT_RE.fullmatch(variant):
            errors.append(f"{sample_id}: invalid variant")

        relative_path = require_string(raw_item, "relativePath", sample_id, errors)
        canonical = canonical_sample_path(relative_path)
        if canonical is None:
            errors.append(f"{sample_id}: relativePath must be a canonical samples/... path")
            continue
        if relative_path in paths:
            errors.append(f"{sample_id}: duplicate relativePath {relative_path}")
        paths.add(relative_path)
        candidate = samples_root.joinpath(*canonical.parts[1:])
        try:
            resolved_candidate = candidate.resolve(strict=True)
        except FileNotFoundError:
            resolved_candidate = candidate.resolve(strict=False)
        try:
            resolved_candidate.relative_to(resolved_samples_root)
        except ValueError:
            errors.append(f"{sample_id}: path escapes samples directory")
            continue
        if candidate.is_symlink():
            errors.append(f"{sample_id}: sample must not be a symlink")
            continue
        candidate_exists = candidate.exists()
        if not candidate_exists:
            verification = raw_item.get("verification", {})
            if not isinstance(verification, dict) or verification.get("status") != "not_verified":
                errors.append(f"{sample_id}: missing sample must be not_verified")
        elif not candidate.is_file():
            errors.append(f"{sample_id}: sample must be a regular file")
            continue

        expected_sha = require_string(raw_item, "sha256", sample_id, errors)
        if not SHA256_RE.fullmatch(expected_sha):
            errors.append(f"{sample_id}: sha256 must contain 64 lowercase hex characters")
        elif candidate_exists and sha256(candidate) != expected_sha:
            errors.append(f"{sample_id}: SHA-256 does not match file bytes")
        byte_size = raw_item.get("byteSize")
        if not isinstance(byte_size, int) or byte_size <= 0:
            errors.append(f"{sample_id}: byteSize must be a positive integer")
        elif candidate_exists and candidate.stat().st_size != byte_size:
            errors.append(f"{sample_id}: byteSize does not match file size")

        if raw_item.get("format") not in FORMATS:
            errors.append(f"{sample_id}: unsupported format identifier")
        if raw_item.get("sourceClass") not in SOURCE_CLASSES:
            errors.append(f"{sample_id}: unsupported sourceClass")
        if raw_item.get("format") in {"cr2", "cr3", "nef", "arw", "dng", "raf", "rw2"} and variant == "camera_original" and raw_item.get("sourceClass") != "camera-original":
            errors.append(f"{sample_id}: RAW camera_original samples require sourceClass camera-original")
        for field in ("mimeType", "licenseNote"):
            if not require_string(raw_item, field, sample_id, errors).strip():
                errors.append(f"{sample_id}: {field} must not be empty")
        require_string(raw_item, "cameraOrEncoder", sample_id, errors)

        expected = raw_item.get("expected")
        if not isinstance(expected, dict):
            errors.append(f"{sample_id}: expected must be an object")
        else:
            reject_unknown_fields(expected, EXPECTED_FIELDS, f"{sample_id}.expected", errors)
            for field in ("width", "height"):
                if not isinstance(expected.get(field), int) or expected[field] < 0:
                    errors.append(f"{sample_id}: expected.{field} must be a non-negative integer")
            orientation = expected.get("orientation")
            if not isinstance(orientation, int) or orientation < 0 or orientation > 8:
                errors.append(f"{sample_id}: expected.orientation must be between 0 and 8")
            if expected.get("index") not in INDEX_EXPECTATIONS:
                errors.append(f"{sample_id}: invalid expected.index")
            for field in ("metadata", "thumbnail", "preview", "originalView"):
                if expected.get(field) not in CAPABILITIES:
                    errors.append(f"{sample_id}: invalid expected.{field}")

        verification = raw_item.get("verification")
        if not isinstance(verification, dict):
            errors.append(f"{sample_id}: verification must be an object")
        else:
            reject_unknown_fields(verification, VERIFICATION_FIELDS, f"{sample_id}.verification", errors)
            status = verification.get("status")
            if status not in VERIFICATION_STATUSES:
                errors.append(f"{sample_id}: invalid verification.status")
            for field in ("windowsVersion", "appVersion", "verifiedAt", "notes"):
                require_string(verification, field, sample_id, errors)
            if status == "passed":
                if not str(raw_item.get("cameraOrEncoder", "")).strip():
                    errors.append(f"{sample_id}: passed verification requires cameraOrEncoder")
                for field in ("windowsVersion", "appVersion", "verifiedAt"):
                    if not str(verification.get(field, "")).strip():
                        errors.append(f"{sample_id}: passed verification requires {field}")
                try:
                    datetime.strptime(str(verification.get("verifiedAt", "")), "%Y-%m-%d")
                except ValueError:
                    errors.append(f"{sample_id}: verifiedAt must use YYYY-MM-DD")

        basis = require_string(raw_item, "verificationBasis", sample_id, errors)
        if SHA256_RE.fullmatch(basis) and expected is not None:
            calculated = verification_basis(raw_item)
            if basis != calculated:
                errors.append(f"{sample_id}: verificationBasis is stale; regenerate the manifest")
    return errors


def write_json_atomic(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(document, stream, indent=2, ensure_ascii=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise


def build_manifest(root: Path, output: Path, prune: bool, parser: argparse.ArgumentParser) -> dict[str, Any]:
    existing_document: dict[str, Any] = {}
    existing_by_path: dict[str, dict[str, Any]] = {}
    if output.exists():
        existing_document = load_document(output, parser)
        existing_samples = existing_document.get("samples", [])
        if not isinstance(existing_samples, list):
            parser.error(f"existing manifest has invalid samples field: {output}")
        for item in existing_samples:
            if not isinstance(item, dict) or not isinstance(item.get("relativePath"), str):
                parser.error(f"existing manifest contains an invalid sample entry: {output}")
            relative_path = item["relativePath"]
            if relative_path in existing_by_path:
                parser.error(f"existing manifest contains duplicate path: {relative_path}")
            existing_by_path[relative_path] = item

    for path in root.rglob("*"):
        if path.is_symlink():
            parser.error(f"symlinks are not allowed in private fixtures: {path}")

    entries: list[dict[str, Any]] = []
    generated_paths: set[str] = set()
    generated_ids: set[str] = set()
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        suffix = path.suffix.lower()
        if suffix not in FORMAT_BY_SUFFIX:
            continue
        relative = path.relative_to(root).as_posix()
        relative_path = (PurePosixPath("samples") / relative).as_posix()
        generated_paths.add(relative_path)
        generated = {
            "id": stable_sample_id(relative),
            "variant": "unclassified",
            "relativePath": relative_path,
            "sha256": sha256(path),
            "byteSize": path.stat().st_size,
            "format": FORMAT_BY_SUFFIX[suffix],
            "mimeType": format_mime(FORMAT_BY_SUFFIX[suffix]),
            "sourceClass": "private-local-sample",
            "cameraOrEncoder": "",
            "licenseNote": "private verification only",
            "expected": {
                "width": 0,
                "height": 0,
                "orientation": 0,
                "index": "not_verified",
                "metadata": "not_verified",
                "thumbnail": "not_verified",
                "preview": "not_verified",
                "originalView": "not_verified",
            },
            "verification": {
                "status": "not_verified",
                "windowsVersion": "",
                "appVersion": "",
                "verifiedAt": "",
                "notes": "",
            },
        }
        preserved = existing_by_path.get(relative_path, {})
        if preserved:
            for field in ("id", "variant", "sourceClass", "cameraOrEncoder", "licenseNote", "expected", "verification"):
                if field in preserved:
                    generated[field] = preserved[field]
        if generated["id"] in generated_ids:
            parser.error(f"stable sample ID collision: {generated['id']}")
        generated_ids.add(generated["id"])
        basis = verification_basis(generated)
        if preserved.get("verificationBasis") != basis:
            if preserved.get("verification", {}).get("status") == "passed":
                print(f"verification basis changed; resetting passed evidence: {generated['id']}", file=sys.stderr)
            generated["verification"] = {
                "status": "not_verified",
                "windowsVersion": "",
                "appVersion": "",
                "verifiedAt": "",
                "notes": "verification basis changed",
            }
        generated["verificationBasis"] = basis
        entries.append(generated)

    missing_paths = sorted(set(existing_by_path) - generated_paths)
    if missing_paths and not prune:
        parser.error(
            "existing manifest entries are missing from the samples directory; "
            f"restore them or rerun with --prune: {', '.join(missing_paths)}"
        )

    return {
        "schemaVersion": 1,
        "fixtureSet": existing_document.get("fixtureSet", "local-private-v1"),
        "updatedAt": date.today().isoformat(),
        "samples": entries,
    }


def format_mime(format_name: str) -> str:
    return {
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
        "avif": "image/avif",
        "heif": "image/heif",
        "tiff": "image/tiff",
        "cr2": "image/x-canon-cr2",
        "cr3": "image/x-canon-cr3",
        "nef": "image/x-nikon-nef",
        "arw": "image/x-sony-arw",
        "dng": "image/x-adobe-dng",
        "raf": "image/x-fuji-raf",
        "rw2": "image/x-panasonic-rw2",
    }[format_name]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("samples", nargs="?", type=Path, default=Path("samples"), help="Private samples directory")
    parser.add_argument("--output", type=Path, default=Path("manifest.local.json"))
    parser.add_argument("--prune", action="store_true", help="Remove manifest entries whose files are no longer present")
    parser.add_argument("--validate", action="store_true", help="Validate the existing manifest and sample files without rewriting it")
    args = parser.parse_args()

    root = args.samples.resolve()
    output = args.output.resolve()
    if not root.is_dir():
        parser.error(f"samples directory does not exist: {root}")

    if args.validate:
        if not output.is_file():
            parser.error(f"manifest does not exist: {output}")
        errors = validate_manifest(load_document(output, parser), output, root)
        if errors:
            for error in errors:
                print(f"error: {error}", file=sys.stderr)
            raise SystemExit(1)
        print(f"validated {output}")
        return

    document = build_manifest(root, output, args.prune, parser)
    errors = validate_manifest(document, output, root)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
    write_json_atomic(output, document)
    print(f"wrote {len(document['samples'])} samples to {output}")


if __name__ == "__main__":
    main()
