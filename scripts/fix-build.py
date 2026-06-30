from pathlib import Path

p = Path(r"C:\Windows\System32\claim-clash-tv\src-tauri\src\lib.rs")
t = p.read_text(encoding="utf-8")
t = t.replace("snippet = body[start..end].replace('\\n', ' ');", 'snippet = body[start..end].replace("\\n", " ");')
p.write_text(t, encoding="utf-8")

p = Path(r"C:\Windows\System32\claim-clash-tv\src\session-recall.js")
t = p.read_text(encoding="utf-8")
t = t.replace("if (trimmedLine.startsWith('- concern:')) {", "if (trimmedLine.trim().startsWith('- concern:')) {")
t = t.replace("if (trimmedLine.startsWith('question:') && currentBookmark) {", "if (trimmedLine.trim().startsWith('question:') && currentBookmark) {")
t = t.replace("if (trimmedLine.startsWith('player:') && currentBookmark) {", "if (trimmedLine.trim().startsWith('player:') && currentBookmark) {")
old = """            const colon = trimmedLine.indexOf(':');
            if (colon < 0) return;
            const key = trimmedLine.slice(0, colon).trim();
            const value = unquoteYaml(trimmedLine.slice(colon + 1));"""
new = """            const stripped = trimmedLine.trim();
            const colon = stripped.indexOf(':');
            if (colon < 0) return;
            const key = stripped.slice(0, colon).trim();
            const value = unquoteYaml(stripped.slice(colon + 1));"""
t = t.replace(old, new, 1)
p.write_text(t, encoding="utf-8")

for fp, old, new in [
    (r"C:\Windows\System32\claim-clash-tv\version.json", '"iteration":  65,', '"iteration":  66,'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\Cargo.toml", 'version = "0.1.65"', 'version = "0.1.66"'),
    (r"C:\Windows\System32\claim-clash-tv\src-tauri\tauri.conf.json", '"version": "0.1.65"', '"version": "0.1.66"'),
]:
    pt = Path(fp)
    c = pt.read_text(encoding="utf-8")
    pt.write_text(c.replace(old, new, 1), encoding="utf-8")
print("done")
