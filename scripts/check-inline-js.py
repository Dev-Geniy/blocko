#!/usr/bin/env python3
"""Extract inline JavaScript from HTML files and validate it with `node --check`."""
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_RE = re.compile(r"<script([^>]*)>([\s\S]*?)</script>", re.IGNORECASE)


def inline_scripts(html_path: Path) -> list[str]:
    text = html_path.read_text(encoding="utf-8", errors="ignore")
    scripts: list[str] = []

    for match in SCRIPT_RE.finditer(text):
        attrs = match.group(1).lower()
        body = match.group(2)
        if "src=" in attrs or "application/ld+json" in attrs:
            continue
        if body.strip():
            scripts.append(body)

    return scripts


def main() -> int:
    html_files = sorted(ROOT.glob("*.html"))
    failures: list[tuple[Path, str]] = []

    with tempfile.TemporaryDirectory(prefix="blocko-inline-js-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        for html_file in html_files:
            scripts = inline_scripts(html_file)
            if not scripts:
                continue

            js_path = tmp_path / f"{html_file.stem}.js"
            js_path.write_text("\n".join(scripts), encoding="utf-8")
            result = subprocess.run(
                ["node", "--check", str(js_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                failures.append((html_file, result.stderr.strip()))

    if failures:
        for html_file, stderr in failures:
            print(f"FAIL {html_file.relative_to(ROOT)}", file=sys.stderr)
            print(stderr, file=sys.stderr)
        return 1

    print(f"Checked inline scripts in {len(html_files)} HTML files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
