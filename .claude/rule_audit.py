#!/usr/bin/env python3
"""
rule_audit.py — Mechanical rule enforcement for Daily Predict.

Usage:
    python3 .claude/rule_audit.py            # audit src/
    python3 .claude/rule_audit.py src/lib    # audit subset
    python3 .claude/rule_audit.py --json     # JSON output for state.json

Exit codes:
    0 = PASS (no issues)
    1 = WARNING (warnings only, deploy allowed with caution)
    2 = CRITICAL (critical issues, deploy BLOCKED)

Design:
    grep/regex ベースの機械チェック。意味解析はしない。
    意味的なバグは別途 npm run build (型) と *.test.ts (動作) で見る。
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Iterable

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Files that look like secrets (regex matches the *value*, not the var name)
SECRET_PATTERNS = [
    (r"sk-ant-(?!placeholder|xxx)[a-zA-Z0-9_-]{20,}", "Anthropic API key literal"),
    (r"eyJ[a-zA-Z0-9_-]{40,}\.[a-zA-Z0-9_-]{40,}\.[a-zA-Z0-9_-]{20,}", "JWT-looking literal (likely Supabase service key)"),
    (r"0x[a-f0-9]{64}", "64-byte hex literal (likely private/signing key)"),
]

# Files that are allowed to contain test fixtures / docs that look like secrets
SECRET_ALLOWLIST_FILES = {
    ".env.example",
    "src/lib/auth.test.ts",  # uses test-secret-do-not-use-in-prod
    "src/lib/rewards-skeleton.test.ts",
}

# Patterns to skip entirely
SKIP_DIRS = {"node_modules", ".next", ".git", "supabase/migrations", "public", ".vercel"}
INCLUDE_EXTS = {".ts", ".tsx", ".js", ".jsx"}


# ──────────────────────────────────────────────────────────────────────────────
# Issue model
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Issue:
    severity: str  # "critical" | "warning"
    rule: str
    file: str
    line: int
    message: str
    snippet: str


@dataclass
class AuditReport:
    critical: list[Issue] = field(default_factory=list)
    warning: list[Issue] = field(default_factory=list)
    files_scanned: int = 0

    def add(self, issue: Issue) -> None:
        if issue.severity == "critical":
            self.critical.append(issue)
        else:
            self.warning.append(issue)

    def exit_code(self) -> int:
        if self.critical:
            return 2
        if self.warning:
            return 1
        return 0


# ──────────────────────────────────────────────────────────────────────────────
# Rule implementations
# ──────────────────────────────────────────────────────────────────────────────

def iter_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        if path.suffix not in INCLUDE_EXTS:
            continue
        rel = path.relative_to(PROJECT_ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        yield path


def is_allowlisted(rel_path: str, file_allowlist: set[str]) -> bool:
    for allowed in file_allowlist:
        if rel_path == allowed or rel_path.endswith("/" + allowed):
            return True
    return False


# ─── CRITICAL rules ─────────────────────────────────────────────────────────


def rule_secrets_hardcoded(file: Path, lines: list[str]) -> list[Issue]:
    rel = str(file.relative_to(PROJECT_ROOT))
    if is_allowlisted(rel, SECRET_ALLOWLIST_FILES):
        return []
    issues = []
    for i, line in enumerate(lines, start=1):
        # Skip comments
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue
        for pattern, desc in SECRET_PATTERNS:
            if re.search(pattern, line):
                issues.append(Issue(
                    severity="critical",
                    rule="secrets_hardcoded",
                    file=rel,
                    line=i,
                    message=f"{desc} hardcoded in source",
                    snippet=line.strip()[:120],
                ))
    return issues


def rule_dangerously_set_inner_html(file: Path, lines: list[str]) -> list[Issue]:
    rel = str(file.relative_to(PROJECT_ROOT))
    issues = []
    for i, line in enumerate(lines, start=1):
        if "dangerouslySetInnerHTML" in line:
            issues.append(Issue(
                severity="critical",
                rule="dangerously_set_inner_html",
                file=rel,
                line=i,
                message="dangerouslySetInnerHTML opens XSS risk",
                snippet=line.strip()[:120],
            ))
    return issues


def rule_todo_in_production(file: Path, lines: list[str]) -> list[Issue]:
    """TODO/FIXME in non-test, non-skeleton production code."""
    rel = str(file.relative_to(PROJECT_ROOT))
    if rel.endswith(".test.ts") or "skeleton" in rel:
        return []
    issues = []
    for i, line in enumerate(lines, start=1):
        if re.search(r"\b(TODO|FIXME|XXX)\b", line):
            issues.append(Issue(
                severity="critical",
                rule="todo_in_production",
                file=rel,
                line=i,
                message="TODO/FIXME/XXX left in production code",
                snippet=line.strip()[:120],
            ))
    return issues


CONSOLE_LOG_ALLOWLIST = {
    # The structured logger itself uses console.* internally — that's the
    # whole point of the wrapper.
    "src/lib/server-log.ts",
}


def rule_console_log(file: Path, lines: list[str]) -> list[Issue]:
    """console.log残留 (console.error/warn は server-log.ts経由なので別ルール)"""
    rel = str(file.relative_to(PROJECT_ROOT))
    if rel.endswith(".test.ts"):
        return []
    if rel in CONSOLE_LOG_ALLOWLIST:
        return []
    issues = []
    for i, line in enumerate(lines, start=1):
        # Match console.log but not console.error/warn/info
        if re.search(r"\bconsole\.log\b", line):
            issues.append(Issue(
                severity="critical",
                rule="console_log",
                file=rel,
                line=i,
                message="console.log left in code (use server-log.ts logger or remove)",
                snippet=line.strip()[:120],
            ))
    return issues


def rule_service_role_in_client(file: Path, lines: list[str]) -> list[Issue]:
    """SUPABASE_SERVICE_ROLE_KEY referenced in client component"""
    rel = str(file.relative_to(PROJECT_ROOT))
    content = "\n".join(lines)
    if '"use client"' not in content:
        return []
    if "SUPABASE_SERVICE_ROLE_KEY" in content or "supabaseAdmin" in content:
        for i, line in enumerate(lines, start=1):
            if "SUPABASE_SERVICE_ROLE_KEY" in line or "supabaseAdmin" in line:
                return [Issue(
                    severity="critical",
                    rule="service_role_in_client",
                    file=rel,
                    line=i,
                    message="Service role / supabaseAdmin used in client component (would expose service key)",
                    snippet=line.strip()[:120],
                )]
    return []


# ─── WARNING rules ──────────────────────────────────────────────────────────


def rule_any_type(file: Path, lines: list[str]) -> list[Issue]:
    """`: any` or `as any` usage (warns when 3+ in one file)"""
    rel = str(file.relative_to(PROJECT_ROOT))
    if rel.endswith(".test.ts"):
        return []
    count = 0
    matches = []
    for i, line in enumerate(lines, start=1):
        # Skip comments
        if line.strip().startswith("//") or line.strip().startswith("*"):
            continue
        if re.search(r":\s*any\b", line) or re.search(r"\bas\s+any\b", line):
            # Allow `as unknown as X` chain
            if "as unknown as" in line:
                continue
            count += 1
            matches.append((i, line))
    if count >= 3:
        return [Issue(
            severity="warning",
            rule="any_type_overuse",
            file=rel,
            line=matches[0][0],
            message=f"{count} uses of `any` type in this file (consider proper types)",
            snippet=matches[0][1].strip()[:120],
        )]
    return []


def rule_api_route_no_try_catch(file: Path, lines: list[str]) -> list[Issue]:
    """API route handler without top-level try/catch"""
    rel = str(file.relative_to(PROJECT_ROOT))
    if not rel.startswith("src/app/api/") or not rel.endswith("route.ts"):
        return []
    content = "\n".join(lines)
    # Check that each exported handler has try/catch in its body
    handler_pattern = re.compile(
        r"export async function (GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\)\s*\{",
        re.MULTILINE,
    )
    issues = []
    for m in handler_pattern.finditer(content):
        method = m.group(1)
        # Take a window of next 500 chars and check for "try"
        body = content[m.end(): m.end() + 500]
        if "try" not in body.split("\n")[0:10][0:1] + "\n".join(body.split("\n")[0:10]).split("try"):
            # Lazy check: just look for "try {" within first 300 chars of body
            pass
        if "try {" not in content[m.end(): m.end() + 300] and "try{" not in content[m.end(): m.end() + 300]:
            line = content[: m.start()].count("\n") + 1
            issues.append(Issue(
                severity="warning",
                rule="api_route_no_try_catch",
                file=rel,
                line=line,
                message=f"{method} handler has no top-level try/catch",
                snippet=m.group(0).strip()[:120],
            ))
    return issues


def rule_lib_without_test(file: Path, _lines: list[str]) -> list[Issue]:
    """src/lib/X.ts without src/lib/X.test.ts"""
    rel = str(file.relative_to(PROJECT_ROOT))
    if not rel.startswith("src/lib/") or not rel.endswith(".ts"):
        return []
    if rel.endswith(".test.ts"):
        return []
    # Skip non-pure-logic files
    if rel.endswith("supabase.ts") or rel.endswith("server-log.ts") or rel.endswith("track.ts") or rel.endswith("share.ts") or rel.endswith("types.ts"):
        return []
    test_file = file.with_name(file.stem + ".test.ts")
    if not test_file.exists():
        return [Issue(
            severity="warning",
            rule="lib_without_test",
            file=rel,
            line=1,
            message=f"No corresponding {test_file.name} found",
            snippet="",
        )]
    return []


def rule_ts_ignore(file: Path, lines: list[str]) -> list[Issue]:
    """@ts-ignore / @ts-expect-error usage"""
    rel = str(file.relative_to(PROJECT_ROOT))
    issues = []
    for i, line in enumerate(lines, start=1):
        if "@ts-ignore" in line or "@ts-expect-error" in line:
            severity = "warning"
            issues.append(Issue(
                severity=severity,
                rule="ts_ignore",
                file=rel,
                line=i,
                message="@ts-ignore/@ts-expect-error suppresses type checking",
                snippet=line.strip()[:120],
            ))
    return issues


def rule_use_effect_empty_deps(file: Path, lines: list[str]) -> list[Issue]:
    """useEffect with empty deps and no eslint-disable comment"""
    rel = str(file.relative_to(PROJECT_ROOT))
    if not rel.endswith(".tsx"):
        return []
    content = "\n".join(lines)
    issues = []
    # Find useEffect(...,[]) patterns
    for m in re.finditer(r"useEffect\s*\([^,]+,\s*\[\s*\]\s*\)", content, re.MULTILINE | re.DOTALL):
        # Check if there's an eslint-disable nearby
        start = max(0, m.start() - 200)
        nearby = content[start: m.end()]
        if "eslint-disable" in nearby or "exhaustive-deps" in nearby:
            continue
        line = content[: m.start()].count("\n") + 1
        issues.append(Issue(
            severity="warning",
            rule="use_effect_empty_deps",
            file=rel,
            line=line,
            message="useEffect with empty deps array (verify intent or add eslint-disable)",
            snippet=m.group(0)[:120],
        ))
    return issues


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

ALL_RULES = [
    # CRITICAL
    rule_secrets_hardcoded,
    rule_dangerously_set_inner_html,
    rule_todo_in_production,
    rule_console_log,
    rule_service_role_in_client,
    # WARNING
    rule_any_type,
    rule_api_route_no_try_catch,
    rule_lib_without_test,
    rule_ts_ignore,
    rule_use_effect_empty_deps,
]


def audit(target: Path) -> AuditReport:
    report = AuditReport()
    for file in iter_files(target):
        try:
            lines = file.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        report.files_scanned += 1
        for rule in ALL_RULES:
            for issue in rule(file, lines):
                report.add(issue)
    return report


def format_text(report: AuditReport) -> str:
    out = []
    out.append(f"\n📊 rule_audit.py — {report.files_scanned} files scanned\n")

    if report.critical:
        out.append(f"\n🔴 CRITICAL ({len(report.critical)})")
        for issue in report.critical:
            out.append(f"  [{issue.rule}] {issue.file}:{issue.line}")
            out.append(f"    {issue.message}")
            if issue.snippet:
                out.append(f"    > {issue.snippet}")
    else:
        out.append("\n🔴 CRITICAL: 0")

    if report.warning:
        out.append(f"\n🟡 WARNING ({len(report.warning)})")
        for issue in report.warning[:20]:  # cap at 20
            out.append(f"  [{issue.rule}] {issue.file}:{issue.line}")
            out.append(f"    {issue.message}")
        if len(report.warning) > 20:
            out.append(f"  ... and {len(report.warning) - 20} more")
    else:
        out.append("\n🟡 WARNING: 0")

    code = report.exit_code()
    verdict = {0: "✅ PASS", 1: "⚠️  WARNING", 2: "❌ CRITICAL — deploy BLOCKED"}[code]
    out.append(f"\n{verdict}\n")
    return "\n".join(out)


def format_json(report: AuditReport) -> str:
    return json.dumps({
        "exit_code": report.exit_code(),
        "files_scanned": report.files_scanned,
        "critical_count": len(report.critical),
        "warning_count": len(report.warning),
        "critical": [asdict(i) for i in report.critical],
        "warning": [asdict(i) for i in report.warning],
    }, indent=2, ensure_ascii=False)


def main() -> int:
    args = sys.argv[1:]
    json_mode = False
    target = PROJECT_ROOT / "src"
    for arg in args:
        if arg == "--json":
            json_mode = True
        elif not arg.startswith("--"):
            target = (PROJECT_ROOT / arg).resolve()

    if not target.exists():
        print(f"❌ target not found: {target}", file=sys.stderr)
        return 2

    report = audit(target)
    if json_mode:
        print(format_json(report))
    else:
        print(format_text(report))
    return report.exit_code()


if __name__ == "__main__":
    sys.exit(main())
