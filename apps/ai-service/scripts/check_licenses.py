"""Fails when a production Python dependency's licence is not allowed (RISK R1c).

Mirrors tooling/check-licenses.js. Run inside the synced venv:
    uv run python scripts/check_licenses.py
Only runtime dependencies are checked (`uv export --no-dev`); dev tools never ship.
"""

import importlib.metadata as md
import re
import subprocess
import sys

# Matched case-insensitively against License-Expression, License and classifiers.
DENIED = re.compile(r"\b(A?GPL|LGPL|SSPL|BUSL|Commons Clause|Non-?Commercial|CC-BY-NC)", re.I)
ALLOWED = re.compile(
    r"\b(MIT|BSD|Apache|ISC|0BSD|Zlib|Unlicense|CC0|PSF|Python Software Foundation"
    r"|Python-2\.0|MPL[- ]?2\.0|Mozilla Public License 2\.0)",
    re.I,
)

# name -> reason. Each entry needs an owner-approved justification.
EXCEPTIONS: dict[str, str] = {}


def runtime_requirements() -> list[str]:
    out = subprocess.run(
        ["uv", "export", "--frozen", "--no-dev", "--no-hashes", "--no-emit-project"],  # noqa: S607
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    names = []
    for line in out.splitlines():
        line = line.strip()
        if line and not line.startswith(("#", "-")):
            names.append(re.split(r"[=<>;\[ ]", line, maxsplit=1)[0])
    return names


def license_text(name: str) -> str:
    meta = md.metadata(name)
    parts = [meta.get("License-Expression") or "", (meta.get("License") or "")[:200]]
    parts += [c for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
    return " | ".join(p for p in parts if p)


def classify(text: str) -> bool:
    return bool(text) and not DENIED.search(text) and bool(ALLOWED.search(text))


def main() -> int:
    violations = []
    names = runtime_requirements()
    for name in names:
        if name in EXCEPTIONS:
            continue
        text = license_text(name)
        if not classify(text):
            violations.append(f"{name}: {text or 'no licence metadata'}")
    if violations:
        print(f"[licenses] {len(violations)} Python licence(s) not allowed:", file=sys.stderr)
        for v in sorted(violations):
            print(f"  - {v}", file=sys.stderr)
        return 1
    print(f"[licenses] {len(names)} runtime Python packages, all on the allowlist")
    return 0


if __name__ == "__main__":
    sys.exit(main())
