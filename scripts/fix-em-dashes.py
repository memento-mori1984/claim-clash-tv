#!/usr/bin/env python3
"""Remove em/en dashes from user-facing Claim Clash copy."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

FILES = [
    ROOT / "src" / "index.html",
    ROOT / "src" / "brain.js",
    ROOT / "src" / "grade-level.js",
    ROOT / "distribution" / "HOW-TO-INSTALL.txt",
    ROOT / "distribution" / "TROUBLESHOOTING.txt",
    ROOT / "distribution" / "ALPHA-TESTER-AGREEMENT.txt",
]


def fix(text: str) -> str:
    for color in ("Green", "Red", "Amber", "Blue", "Gray"):
        text = text.replace(f"{color} \u2014 ", f"{color}: ")
    pairs = [
        ("optional \u2014 academic", "optional (academic)"),
        ("shared AI \u2014 sit", "shared AI. Sit"),
        ("actually known \u2014 including", "actually known, including"),
        ("paid API plan</strong> \u2014 not", "paid API plan</strong>, not"),
        ("when you can \u2014 solo", "when you can. Solo"),
        ("Two players \u2014 who", "Two players: who"),
        ("Primary AI \u2014 we recommend", "Primary AI: we recommend"),
        ("' \u2014 ' +", "': ' +"),
        ("\u2b50 Primary \u2014 we", "\u2b50 Primary: we"),
        ("primary \u2014 not a free tier", "primary, not a free tier"),
        ("pay-as-you-go \u2014 well", "pay-as-you-go, which is"),
        ("comparison-only \u2014 not", "comparison-only, not"),
        ("answers \u2014 use", "answers. Use"),
        ("provider \u2014 you", "provider. You"),
        ("providers anytime \u2014 your", "providers anytime. Your"),
        ("providers anytime \u2014 the", "providers anytime. The"),
        ("clipboard \u2014 try", "clipboard. Try"),
        ("Documents \u2014 try", "Documents. Try"),
        ("ready \u2014 or", "ready, or"),
        ("Solo \u2014 ", "Solo: "),
        (
            "player-visible session export data \u2014 never",
            "player-visible session export data. Never",
        ),
        ("OPTION A \u2014 ", "OPTION A: "),
        ("OPTION B \u2014 ", "OPTION B: "),
        ("OPTION C \u2014 ", "OPTION C: "),
        ("Save & Quit \u2014 ", "Save & Quit: "),
        ("Window X button \u2014 ", "Window X button: "),
        ("Claim Clash \u2014 ", "Claim Clash: "),
    ]
    for old, new in pairs:
        text = text.replace(old, new)
    text = re.sub(r" \u2014 ", ", ", text)
    text = text.replace("\u2013", "-")
    return text


def main() -> None:
    for path in FILES:
        if not path.exists():
            print(f"skip missing {path}")
            continue
        original = path.read_text(encoding="utf-8")
        updated = fix(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="\n")
        remaining = updated.count("\u2014") + updated.count("\u2013")
        print(f"{path.relative_to(ROOT)}: remaining dash chars {remaining}")


if __name__ == "__main__":
    main()