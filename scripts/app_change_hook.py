"""Claude Code PostToolUse hook: after browser code that may have changed a CloudApper app's
design (forms, workflows, menus, roles, reports), tell Claude to refresh the export (WP-045).

Register for the Playwright tools browser_run_code_unsafe and browser_evaluate. Reads the hook
JSON on stdin, looks at the code (or the file it was loaded from) and prints additionalContext
only when it finds a write. Record writes and read-only POSTs don't count: they change data, not
the app's structure.
ponytail: text match on the code, so a write hidden behind a variable URL is missed and a
commented-out one is caught; good enough for a reminder.
"""
import json
import os
import re
import sys

WRITE = re.compile(
    r"method\s*:\s*['\"](POST|PUT|PATCH|DELETE)['\"]|request\.(post|put|patch|delete)\(|route\.fetch\(|SaveEntityType",
    re.I,
)
# Calls that send a write verb but don't change the app's design.
NOT_DESIGN = re.compile(
    r"127\.0\.0\.1|localhost|Records/fetch|v3/Records|validate-expression|ReportExport/stream|execution",
    re.I,
)


def main():
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return
    tool_input = event.get("tool_input") or {}
    code = tool_input.get("code") or tool_input.get("function") or ""
    path = tool_input.get("filename")
    if path:
        if not os.path.isabs(path):
            path = os.path.join(event.get("cwd") or "", path)
        try:
            code += open(path, encoding="utf8").read()
        except OSError:
            pass
    # Variables holding a localhost URL (the loader's `S`) are local saves too.
    local_vars = re.findall(r"(\w+)\s*=\s*['\"`]https?://(?:127\.0\.0\.1|localhost)", code)
    local_call = re.compile(r"\(\s*(?:%s)\s*[+,)]" % "|".join(map(re.escape, local_vars))) if local_vars else None
    # Judge each statement on its own so a localhost save next to a design write still counts.
    if any(WRITE.search(s) and not NOT_DESIGN.search(s) and not (local_call and local_call.search(s))
           for s in re.split(r";|\n", code)):
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": "CloudApper: that browser call may have changed the app's design. "
            "If it did, refresh the export now (WP-045: loader with since = app.json fingerprint) "
            "and update app-export/<app>/SUMMARY.md if the forms, workflow chain or known issues changed.",
        }}))


if __name__ == "__main__":
    main()
