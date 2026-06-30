from pathlib import Path
p = Path(r"C:\Windows\System32\claim-clash-tv\src\index.html")
t = p.read_text(encoding="utf-8")
old = '''        async function usePastSessionInQuestion(meta) {
            if (!window.SessionRecall) return;
            try {
                const hit = { meta: meta, snippet: meta.topic ? ('Topic: ' + meta.topic) : '' };
                pendingPastSessionRecallContext = SessionRecall.buildRecallContext([hit], 'Recall this past session');
                const q = document.getElementById('question-box');
                if (q) {
                    const label = formatPastSessionLabel(meta);
                    q.innerHTML = 'What can you tell me about our past session: ' + label + '?';
                }
                closePastSessionsModal();
            } catch (e) {
                alert('Could not prepare session context: ' + (e.message || e));
            }
        }'''
new = '''        async function usePastSessionInQuestion(meta) {
            if (!window.SessionRecall) return;
            try {
                const content = await SessionRecall.readPastSession(meta.path);
                const parsed = SessionRecall.parseFrontmatter(content);
                const turns = SessionRecall.parseConversationTurns(parsed.body);
                const bookmarks = SessionRecall.parseBookmarksSection(parsed.body);
                const enriched = Object.assign({}, meta, parsed.meta, { bookmarks: bookmarks.length ? bookmarks : (meta.bookmarks || []) });
                let snippet = meta.topic ? ('Topic: ' + meta.topic) : '';
                if (turns.length) snippet += ' | ' + turns[0].label + ': ' + turns[0].text.slice(0, 160);
                const hit = { meta: enriched, snippet: snippet };
                pendingPastSessionRecallContext = SessionRecall.buildRecallContext([hit], 'Recall this past session');
                const q = document.getElementById('question-box');
                if (q) {
                    const label = formatPastSessionLabel(meta);
                    q.innerHTML = 'What can you tell me about our past session: ' + label + '?';
                }
                closePastSessionsModal();
            } catch (e) {
                alert('Could not prepare session context: ' + (e.message || e));
            }
        }'''
if old not in t:
    raise SystemExit('usePastSessionInQuestion block not found')
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('enhanced usePastSessionInQuestion')
