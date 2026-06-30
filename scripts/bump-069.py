from pathlib import Path
for fp, old, new in [
    (r"C:\Windows\System32\claim-clash-tv\src\index.html", 'const APP_VERSION = "0.1.68";', 'const APP_VERSION = "0.1.69";'),
    (r"C:\Windows\System32\claim-clash-tv\version.json", '"iteration":  68,', '"iteration":  69,'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\Cargo.toml", 'version = "0.1.68"', 'version = "0.1.69"'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\tauri.conf.json", '"version": "0.1.68"', '"version": "0.1.69"'),
]:
    Path(fp).write_text(Path(fp).read_text(encoding='utf-8').replace(old, new, 1), encoding='utf-8')
notes = Path(r"C:\Windows\System32\claim-clash-tv\UPDATE-NOTES.txt")
text = notes.read_text(encoding='utf-8')
entry = """
VERSION 0.1.69
--------------
Save File naming (Markdown, Word, PDF)
  - Save dialog now pre-fills the full conv N - topic name for all three Save File format options.
  - Export preview shows Save as: filename when you click Save File.

"""
if 'VERSION 0.1.69' not in text:
    text = text.replace('Current source version: 0.1.68 Alpha', 'Current source version: 0.1.69 Alpha', 1)
    text = text.replace('VERSION 0.1.68\n--------------', entry + 'VERSION 0.1.68\n--------------', 1)
    for path in [r"C:\Windows\System32\claim-clash-tv\UPDATE-NOTES.txt", r"C:\Windows\System32\claim-clash-tv\dist\UPDATE-NOTES.txt", r"C:\Users\Ranzh\ClaimClash\alpha-dev\UPDATE-NOTES.txt"]:
        Path(path).write_text(text, encoding='utf-8')
print('0.1.69')
