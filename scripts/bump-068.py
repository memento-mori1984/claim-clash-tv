from pathlib import Path
for fp, old, new in [
    (r"C:\Windows\System32\claim-clash-tv\src\index.html", 'const APP_VERSION = "0.1.67";', 'const APP_VERSION = "0.1.68";'),
    (r"C:\Windows\System32\claim-clash-tv\version.json", '"iteration":  67,', '"iteration":  68,'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\Cargo.toml", 'version = "0.1.67"', 'version = "0.1.68"'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\tauri.conf.json", '"version": "0.1.67"', '"version": "0.1.68"'),
]:
    p = Path(fp); p.write_text(p.read_text(encoding='utf-8').replace(old, new, 1), encoding='utf-8')
notes = Path(r"C:\Windows\System32\claim-clash-tv\UPDATE-NOTES.txt")
text = notes.read_text(encoding='utf-8')
entry = """
VERSION 0.1.68
--------------
Export naming applies to all formats
  - conv N - topic naming now used for Markdown, Word, PDF, email attachments, and Documents backup.
  - Session line and document title inside each export match the file name.
  - Export modal preview shows the file name before you save or email.

"""
if 'VERSION 0.1.68' not in text:
    text = text.replace('Current source version: 0.1.67 Alpha', 'Current source version: 0.1.68 Alpha', 1)
    text = text.replace('VERSION 0.1.67\n--------------', entry + 'VERSION 0.1.67\n--------------', 1)
    for path in [r"C:\Windows\System32\claim-clash-tv\UPDATE-NOTES.txt", r"C:\Windows\System32\claim-clash-tv\dist\UPDATE-NOTES.txt", r"C:\Users\Ranzh\ClaimClash\alpha-dev\UPDATE-NOTES.txt"]:
        Path(path).write_text(text, encoding='utf-8')
print('0.1.68')
