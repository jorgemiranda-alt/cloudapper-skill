"""Checks the cloudapper skill for leaked customer data and structure problems.

Usage: python scripts/check_skill.py [--root PATH]
Exit code 1 when any error is found. Warnings don't fail the check.
Run by the pre-commit hook (.githooks/pre-commit) and by CI.
"""
import argparse
import datetime
import os
import re
import sys
from pathlib import Path

# Shared platform hosts (front ends, sign-in, docs, cluster APIs). Tenant hosts of customers are not listed.
ALLOWED_CLOUDAPPER_HOSTS = re.compile(
    r"web|www|account|docs|m2sys|m2sys-(?:api|designapi|reportapi)|(?:api|api-design|designapi|reportapi)-cl\d+")
ALLOW_MARKER = "leak-check: allow"
SKIP_DIRS = {".git", "evals/results", "node_modules", "__pycache__"}
TEXT_SUFFIXES = {".md", ".json", ".yml", ".yaml", ".txt", ".py", ".js", ".toml", ""}
STALE_MONTHS = 12

LEAK_PATTERNS = [
    ("GUID", re.compile(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b")),
    ("email address", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b")),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("bearer token", re.compile(r"\b[Bb]earer\s+[A-Za-z0-9._~+/-]{16,}")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("key-like value", re.compile(
        r"(?i)\b(api[_-]?key|client[_-]?secret|secret|password|passwd|access[_-]?token|token)\b"
        r"[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9/+_.\-]{12,}")),
    ("runtime URL with real IDs", re.compile(r"/\d{2,}/app/[A-Za-z0-9-]{2,}")),
]
HOST_RE = re.compile(r"(?<![\w>}*.-])([a-z0-9][a-z0-9-]*)\.cloudapper\.(?:com|ai)\b", re.I)
LONG_NUMBER_RE = re.compile(r"(?<![\w.])\d{7,}(?![\w.])")

ENTRY_HEADING_RE = re.compile(r"^### (WP-\d{3}) (.+)$")
STATUS_RE = re.compile(
    r"^\*\*Status:\*\* (Hypothesis|Observed|Verified) · (baseline|checked (\d{4})-(\d{2}))(.*)$")
WP_REF_RE = re.compile(r"\bWP-\d{3}\b")


class Report:
    def __init__(self):
        self.errors, self.warnings, self.notes = [], [], []

    def error(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def load_denylist(root):
    terms = []
    path = root / ".leak-denylist"
    if path.exists():
        terms += path.read_text(encoding="utf-8").splitlines()
    terms += os.environ.get("LEAK_DENYLIST", "").splitlines()
    terms = [t.strip() for t in terms if t.strip() and not t.strip().startswith("#")]
    return [(t, re.compile(r"(?<!\w)" + re.escape(t) + r"(?!\w)", re.I)) for t in terms]


def text_files(root):
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root).as_posix()
        if not path.is_file() or rel == ".leak-denylist":
            continue
        if any(rel == d or rel.startswith(d + "/") for d in SKIP_DIRS):
            continue
        if path.suffix.lower() in TEXT_SUFFIXES:
            yield rel, path


def check_leaks(root, report):
    denylist = load_denylist(root)
    if not denylist:
        report.notes.append("No denylist found (.leak-denylist or LEAK_DENYLIST); customer names were not checked.")
    for rel, path in text_files(root):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for n, line in enumerate(lines, 1):
            if ALLOW_MARKER in line:
                continue
            where = f"{rel}:{n}"
            for label, pattern in LEAK_PATTERNS:
                if pattern.search(line):
                    report.error(where, f"possible {label}")
            for m in HOST_RE.finditer(line):
                if not ALLOWED_CLOUDAPPER_HOSTS.fullmatch(m.group(1).lower()):
                    report.error(where, f"tenant host '{m.group(0)}' may identify a customer; use <tenant>.cloudapper.com")
            if LONG_NUMBER_RE.search(line):
                report.warn(where, "long number; make sure it isn't a client, app or record ID")
            for term, pattern in denylist:
                if pattern.search(line):
                    report.error(where, "matches a denylist term")  # don't print the term: CI logs are shared


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 4)
    if end < 0:
        return None, text
    fields = {}
    for line in text[4:end].splitlines():
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1)
            fields[key.strip()] = value.strip()
    return fields, text[end + 5:]


def check_skill_md(root, report):
    path = root / "SKILL.md"
    text = path.read_text(encoding="utf-8")
    fields, body = parse_frontmatter(text)
    if fields is None:
        report.error("SKILL.md", "missing or malformed YAML frontmatter")
        return text
    name, desc = fields.get("name", ""), fields.get("description", "")
    if not re.fullmatch(r"[a-z0-9-]{1,64}", name) or re.search(r"anthropic|claude", name):
        report.error("SKILL.md", "name must be 1-64 lowercase letters, digits or hyphens, without 'anthropic' or 'claude'")
    if not desc or len(desc) > 1024:
        report.error("SKILL.md", f"description must be 1-1,024 characters (now {len(desc)})")
    if "<" in desc or ">" in desc:
        report.error("SKILL.md", "description must not contain XML tags")
    body_lines = len(body.splitlines())
    if body_lines >= 500:
        report.error("SKILL.md", f"body is {body_lines} lines; keep it under 500")
    for ref in sorted((root / "references").glob("*.md")):
        if f"references/{ref.name}" not in text:
            report.error("SKILL.md", f"references/{ref.name} is not linked from SKILL.md, so Claude won't find it")
    return text


def check_references(root, report, skill_text):
    today = datetime.date.today()
    ids, baseline = {}, 0
    loaded = {"SKILL.md": skill_text}
    for ref in sorted((root / "references").glob("*.md")):
        rel = f"references/{ref.name}"
        lines = ref.read_text(encoding="utf-8").splitlines()
        loaded[rel] = "\n".join(lines)
        if len(lines) > 300:
            report.warn(rel, f"{len(lines)} lines; split it by topic (see CONTRIBUTING.md)")
        if len(lines) > 100 and not any(l.strip().lower() == "## contents" for l in lines):
            report.warn(rel, f"{len(lines)} lines without a '## Contents' list")
        for start, entry_id, block in entry_blocks(lines):
            where = f"{rel}:{start}"
            if entry_id in ids:
                report.error(where, f"{entry_id} is also used at {ids[entry_id]}")
            ids[entry_id] = where
            if not any(l.startswith("**Rule:**") for l in block):
                report.error(where, f"{entry_id} has no **Rule:** line")
            status = [l for l in block if l.startswith("**Status:**")]
            if len(status) != 1:
                report.error(where, f"{entry_id} needs exactly one **Status:** line")
                continue
            m = STATUS_RE.match(status[0])
            if not m:
                report.error(where, f"{entry_id} Status line must look like '**Status:** Observed · checked 2026-11 · ...'")
                continue
            kind, when, year, month, rest = m.groups()
            if kind == "Hypothesis":
                report.error(where, f"{entry_id} is a Hypothesis; drafts belong in inbox/")
            if kind == "Verified" and "Evidence:" not in rest:
                report.error(where, f"{entry_id} is Verified but has no Evidence")
            if when == "baseline":
                baseline += 1
            else:
                age = (today.year - int(year)) * 12 + today.month - int(month)
                if age > STALE_MONTHS:
                    report.warn(where, f"{entry_id} last checked {year}-{month}; re-check it")
    retired = set()
    retired_path = root / "retired.md"
    if retired_path.exists():
        for start, entry_id, _ in entry_blocks(retired_path.read_text(encoding="utf-8").splitlines()):
            if entry_id in ids:
                report.error(f"retired.md:{start}", f"{entry_id} is retired but still an entry at {ids[entry_id]}")
            retired.add(entry_id)
    for rel, text in loaded.items():
        for n, line in enumerate(text.splitlines(), 1):
            for ref_id in WP_REF_RE.findall(line):
                if ref_id in retired:
                    report.error(f"{rel}:{n}", f"cites retired {ref_id}")
                elif ref_id not in ids:
                    report.error(f"{rel}:{n}", f"cites {ref_id}, which doesn't exist")
    report.notes.append(f"{len(ids)} pattern entries, {baseline} still at 'baseline' (not re-checked since import).")


def entry_blocks(lines):
    """Yields (line number, WP id, entry lines) for each ### WP-nnn entry."""
    current = None
    for n, line in enumerate(lines, 1):
        m = ENTRY_HEADING_RE.match(line)
        if m or re.match(r"^#{1,3} ", line):
            if current:
                yield current
            current = (n, m.group(1), []) if m else None
        elif current:
            current[2].append(line)
    if current:
        yield current


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=Path(__file__).resolve().parent.parent, type=Path)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    report = Report()
    check_leaks(args.root, report)
    skill_text = check_skill_md(args.root, report)
    check_references(args.root, report, skill_text)
    for note in report.notes:
        print(f"note: {note}")
    for warning in report.warnings:
        print(f"warning: {warning}")
    for error in report.errors:
        print(f"ERROR: {error}")
    print(f"{len(report.errors)} errors, {len(report.warnings)} warnings")
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
