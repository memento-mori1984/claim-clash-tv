import pathlib
p = pathlib.Path(r"C:\Windows\System32\claim-clash-tv\src\session-recall.js")
text = p.read_text(encoding="utf-8")
old = '''        block.split('\n').forEach(line => {
            const trimmedLine = line.trimEnd();
            if (!trimmedLine.trim()) return;

            if (trimmedLine.startsWith('- concern:')) {
                if (currentBookmark) bookmarks.push(currentBookmark);
                currentBookmark = {
                    concern: unquoteYaml(trimmedLine.split(':').slice(1).join(':')),
                    question: '',
                    player: ''
                };
                return;
            }
            if (trimmedLine.startsWith('question:') && currentBookmark) {
                currentBookmark.question = unquoteYaml(trimmedLine.split(':').slice(1).join(':'));
                return;
            }
            if (trimmedLine.startsWith('player:') && currentBookmark) {
                currentBookmark.player = unquoteYaml(trimmedLine.split(':').slice(1).join(':'));
                return;
            }

            const colon = trimmedLine.indexOf(':');
            if (colon < 0) return;
            const key = trimmedLine.slice(0, colon).trim();
            const value = unquoteYaml(trimmedLine.slice(colon + 1));'''
new = '''        block.split('\n').forEach(line => {
            const trimmedLine = line.trimEnd();
            const stripped = trimmedLine.trim();
            if (!stripped) return;

            if (/^-\s+concern:/.test(stripped)) {
                if (currentBookmark) bookmarks.push(currentBookmark);
                currentBookmark = {
                    concern: unquoteYaml(stripped.split(':').slice(1).join(':')),
                    question: '',
                    player: ''
                };
                return;
            }
            if (/^question:/.test(stripped) && currentBookmark) {
                currentBookmark.question = unquoteYaml(stripped.split(':').slice(1).join(':'));
                return;
            }
            if (/^player:/.test(stripped) && currentBookmark) {
                currentBookmark.player = unquoteYaml(stripped.split(':').slice(1).join(':'));
                return;
            }

            const colon = stripped.indexOf(':');
            if (colon < 0) return;
            const key = stripped.slice(0, colon).trim();
            const value = unquoteYaml(stripped.slice(colon + 1));'''
if old not in text:
    raise SystemExit('session-recall anchor not found')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
print('session-recall.js frontmatter fix')
