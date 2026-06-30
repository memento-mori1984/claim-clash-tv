from pathlib import Path
for fp, old, new in [
    (r"C:\Windows\System32\claim-clash-tv\src\index.html", 'const APP_VERSION = "0.1.69";', 'const APP_VERSION = "0.1.70";'),
    (r"C:\Windows\System32\claim-clash-tv\version.json", '"iteration":  69,', '"iteration":  70,'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\Cargo.toml", 'version = "0.1.69"', 'version = "0.1.70"'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\tauri.conf.json", '"version": "0.1.69"', '"version": "0.1.70"'),
]:
    Path(fp).write_text(Path(fp).read_text(encoding='utf-8').replace(old, new, 1), encoding='utf-8')
notes = Path(r"C:\Windows\System32\claim-clash-tv\UPDATE-NOTES.txt")
text = notes.read_text(encoding='utf-8')
entry = """
VERSION 0.1.70
--------------
Email attach: Save to Documents first
  - Web Gmail, Yahoo, and similar browsers cannot accept automatic file attachments. This is a platform limit.
  - Attach file now opens Save As in Documents\\Claim Clash Sessions first.
  - Default name: conv N - topic.ext (edit topic in the file name before saving).
  - If no topic yet, the placeholder word topic is used so you can type your own.
  - After save, Outlook or Thunderbird opens with the file attached when installed.
  - Otherwise your email provider opens and the file is already in Documents for you to attach.

"""
if 'VERSION 0.1.70' not in text:
    text = text.replace('Current source version: 0.1.69 Alpha', 'Current source version: 0.1.70 Alpha', 1)
    text = text.replace('VERSION 0.1.69\n--------------', entry + 'VERSION 0.1.69\n--------------', 1)
    for path in [r"C:\Windows\System32\claim-clash-tv\UPDATE-NOTES.txt", r"C:\Windows\System32\claim-clash-tv\dist\UPDATE-NOTES.txt", r"C:\Users\Ranzh\ClaimClash\alpha-dev\UPDATE-NOTES.txt"]:
        Path(path).write_text(text, encoding='utf-8')
print('0.1.70')
