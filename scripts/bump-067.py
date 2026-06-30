from pathlib import Path

# bump version 0.1.67
for fp, old, new in [
    (r"C:\Windows\System32\claim-clash-tv\src\index.html", 'const APP_VERSION = "0.1.66";', 'const APP_VERSION = "0.1.67";'),
    (r"C:\Windows\System32\claim-clash-tv\version.json", '"iteration":  66,', '"iteration":  67,'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\Cargo.toml", 'version = "0.1.66"', 'version = "0.1.67"'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\tauri.conf.json", '"version": "0.1.66"', '"version": "0.1.67"'),
]:
    p = Path(fp)
    c = p.read_text(encoding='utf-8')
    p.write_text(c.replace(old, new, 1), encoding='utf-8')

notes = Path(r"C:\Windows\System32\claim-clash-tv\UPDATE-NOTES.txt")
text = notes.read_text(encoding='utf-8')
entry = """

VERSION 0.1.67
--------------
PDF Save File default name fix
  - Save dialog now pre-fills conv number and topic for PDF, Word, and Markdown.
  - Filename format: conv N - topic.ext (example: conv 2 - Did inflation peak.pdf)
  - Topic text is stripped of HTML from the question box.
  - Windows save dialog fix: passes the name without extension so PDF filter applies correctly.
  - Bracket format conv N [topic] still recognized for older saved files.

"""
if 'VERSION 0.1.67' not in text:
    text = text.replace('Current source version: 0.1.66 Alpha', 'Current source version: 0.1.67 Alpha', 1)
    text = text.replace('FEEDBACK\n--------', entry + 'FEEDBACK\n--------', 1)
    for path in [
        r"C:\Windows\System32\claim-clash-tv\UPDATE-NOTES.txt",
        r"C:\Windows\System32\claim-clash-tv\dist\UPDATE-NOTES.txt",
        r"C:\Users\Ranzh\ClaimClash\alpha-dev\UPDATE-NOTES.txt",
    ]:
        Path(path).write_text(text, encoding='utf-8')
print('version and notes updated')
