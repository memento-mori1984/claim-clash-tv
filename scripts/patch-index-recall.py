import pathlib

p = pathlib.Path(r"C:\Windows\System32\claim-clash-tv\src\index.html")
text = p.read_text(encoding="utf-8")

def must_replace(old, new, label):
    global text
    if new in text and old not in text:
        print(f'skip {label}')
        return
    if old not in text:
        raise SystemExit(f'missing {label}: {old[:80]}')
    text = text.replace(old, new, 1)
    print(f'ok {label}')

must_replace('const APP_VERSION = "0.1.65";', 'const APP_VERSION = "0.1.66";', 'version')
must_replace('    <script src="session-export.js"></script>\n    <script>', '    <script src="session-export.js"></script>\n    <script src="session-recall.js"></script>\n    <script>', 'script tag')

must_replace('        }\n        // --- 2. Constants and global state ---', '        }\n        window.tauriInvoke = tauriInvoke;\n        // --- 2. Constants and global state ---', 'tauri expose')

old_btn = '''                        <button onclick="showExportSessionModal()" class="w-full bg-sky-700 hover:bg-sky-800 px-4 py-3 rounded-2xl text-sm flex items-center justify-center gap-x-2">
                            <i class="fa-solid fa-file-export"></i> <span>Export Session</span>
                        </button>'''
new_btn = old_btn + '''
                        <button onclick="showPastSessionsModal()" class="w-full bg-violet-700 hover:bg-violet-800 px-4 py-3 rounded-2xl text-sm flex items-center justify-center gap-x-2">
                            <i class="fa-solid fa-clock-rotate-left"></i> <span>Past Sessions</span>
                        </button>'''
must_replace(old_btn, new_btn, 'past sessions button')

modal_anchor = '    <!-- Analyze AI Differences Modal -->'
modal_html = '''    <!-- Past Sessions Modal -->
    <div id="past-sessions-modal" onclick="closePastSessionsModal()" class="hidden fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
        <div onclick="event.stopImmediatePropagation()" class="bg-zinc-900 border border-zinc-700 rounded-3xl p-6 w-full max-w-2xl mx-4 shadow-2xl max-h-[85vh] flex flex-col">
            <h3 class="text-xl font-semibold mb-1 flex items-center gap-x-2">
                <i class="fa-solid fa-clock-rotate-left text-violet-400"></i> Past Sessions
            </h3>
            <p class="text-xs text-zinc-500 mb-4">Search saved session exports in Documents/Claim Clash Sessions. Use a result to ask the primary AI with that context.</p>
            <div class="flex gap-2 mb-3">
                <input id="past-sessions-search" type="text" placeholder="Search by topic, question, or bookmark..." class="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-2xl text-sm focus:outline-none focus:border-violet-500" onkeydown="if(event.key==='Enter')searchPastSessionsUi()" />
                <button type="button" onclick="searchPastSessionsUi()" class="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-2xl text-sm">Search</button>
            </div>
            <div id="past-sessions-list" class="flex-1 overflow-y-auto space-y-2 min-h-[120px]"></div>
            <p id="past-sessions-status" class="text-xs text-zinc-500 mt-2"></p>
            <div class="mt-4 flex justify-end gap-2">
                <button onclick="closePastSessionsModal()" class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-2xl text-sm">Close</button>
            </div>
        </div>
    </div>

'''
must_replace(modal_anchor, modal_html + modal_anchor, 'modal html')

ask_old = '''            answerBox.innerHTML = "Asking " + primary.name + "...";

            const finishPrimary = async (text, modelUsed, isError) => {'''
ask_new = '''            let recallContext = pendingPastSessionRecallContext;
            pendingPastSessionRecallContext = null;
            if (!recallContext && window.SessionRecall && SessionRecall.detectRecallIntent(question)) {
                answerBox.innerHTML = '<span class="text-zinc-400">Searching saved sessions...</span>';
                await paintExportUi();
                recallContext = await SessionRecall.buildRecallAugmentation(question);
            }

            answerBox.innerHTML = "Asking " + primary.name + "...";

            const finishPrimary = async (text, modelUsed, isError) => {'''
must_replace(ask_old, ask_new, 'ask recall')

api_old = '''            primarySessionMessages.push({ role: 'user', text: question });

            if (primaryProviderId === 'gemini') {
                const result = await callGemini(sessionToGeminiContents(primarySessionMessages));'''
api_new = '''            primarySessionMessages.push({ role: 'user', text: question });

            let messagesForApi = primarySessionMessages;
            if (recallContext) {
                messagesForApi = primarySessionMessages.slice();
                messagesForApi[messagesForApi.length - 1] = {
                    role: 'user',
                    text: recallContext + '\\n\\nUser question: ' + question
                };
            }

            if (primaryProviderId === 'gemini') {
                const result = await callGemini(sessionToGeminiContents(messagesForApi));'''
must_replace(api_old, api_new, 'api messages')

must_replace('                    const result = await callAIProvider(primaryProviderId, question, primarySessionMessages);',
             '                    const result = await callAIProvider(primaryProviderId, question, messagesForApi);', 'callAIProvider')

email_old = '''                setExportSessionStatus('Preparing email...', false);
                await paintExportUi();

                if (textOnly) {'''
email_new = '''                setExportSessionStatus('Preparing email...', false);
                await paintExportUi();

                try {
                    await saveMdBackupToDocuments(data);
                } catch (e) {
                    console.warn('Markdown backup to Documents failed', e);
                }

                if (textOnly) {'''
must_replace(email_old, email_new, 'email backup')

section_anchor = '        // --- 9. Alpha tester feedback ---'
section_js = r'''        // --- 8b. Past session recall UI ---

        let pendingPastSessionRecallContext = null;

        function formatPastSessionLabel(meta) {
            const conv = meta.conv ? ('conv ' + meta.conv) : 'session';
            const topic = meta.topic ? (' [' + meta.topic + ']') : '';
            const when = meta.exported_at || meta.exportedAt || '';
            return conv + topic + (when ? (' - ' + when) : '');
        }

        async function showPastSessionsModal() {
            closeAllModals();
            pendingPastSessionRecallContext = null;
            const modal = document.getElementById('past-sessions-modal');
            const status = document.getElementById('past-sessions-status');
            const search = document.getElementById('past-sessions-search');
            if (status) status.textContent = '';
            if (search) search.value = '';
            if (modal) modal.classList.remove('hidden');
            await refreshPastSessionsList('');
        }

        function closePastSessionsModal() {
            const modal = document.getElementById('past-sessions-modal');
            if (modal) modal.classList.add('hidden');
        }

        async function refreshPastSessionsList(query) {
            const list = document.getElementById('past-sessions-list');
            const status = document.getElementById('past-sessions-status');
            if (!list || !window.SessionRecall) return;
            list.innerHTML = '<p class="text-xs text-zinc-500">Loading...</p>';
            try {
                let items;
                if (query && query.trim()) {
                    const hits = await SessionRecall.searchPastSessions(query.trim(), 12);
                    items = hits.map(h => Object.assign({}, h.meta || h, { snippet: h.snippet, score: h.score }));
                } else {
                    items = await SessionRecall.listPastSessions();
                }
                if (!items.length) {
                    list.innerHTML = '<p class="text-xs text-zinc-500">No saved sessions found. Export a session first (Save File or Email).</p>';
                    if (status) status.textContent = '';
                    return;
                }
                list.innerHTML = '';
                items.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'p-3 rounded-2xl border border-zinc-700 bg-zinc-800/60';
                    const title = document.createElement('div');
                    title.className = 'text-sm text-zinc-100 font-medium';
                    title.textContent = formatPastSessionLabel(item);
                    card.appendChild(title);
                    const meta = document.createElement('div');
                    meta.className = 'text-[11px] text-zinc-500 mt-1';
                    const bookmarkCount = (item.bookmarks || []).length;
                    meta.textContent = (item.turn_count || item.turnCount || 0) + ' turns' + (bookmarkCount ? (', ' + bookmarkCount + ' bookmark' + (bookmarkCount === 1 ? '' : 's')) : '');
                    card.appendChild(meta);
                    if (item.snippet) {
                        const sn = document.createElement('div');
                        sn.className = 'text-xs text-zinc-400 mt-2';
                        sn.textContent = item.snippet;
                        card.appendChild(sn);
                    }
                    const actions = document.createElement('div');
                    actions.className = 'flex flex-wrap gap-2 mt-3';
                    const viewBtn = document.createElement('button');
                    viewBtn.type = 'button';
                    viewBtn.className = 'px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-xs';
                    viewBtn.textContent = 'View';
                    viewBtn.onclick = () => viewPastSession(item.path);
                    actions.appendChild(viewBtn);
                    const useBtn = document.createElement('button');
                    useBtn.type = 'button';
                    useBtn.className = 'px-3 py-1.5 bg-violet-600 hover:bg-violet-700 rounded-xl text-xs';
                    useBtn.textContent = 'Use in question';
                    useBtn.onclick = () => usePastSessionInQuestion(item);
                    actions.appendChild(useBtn);
                    card.appendChild(actions);
                    list.appendChild(card);
                });
                if (status) status.textContent = items.length + ' result' + (items.length === 1 ? '' : 's') + '.';
            } catch (e) {
                list.innerHTML = '<p class="text-xs text-red-400">Could not load past sessions.</p>';
                if (status) status.textContent = String(e.message || e);
            }
        }

        async function searchPastSessionsUi() {
            const search = document.getElementById('past-sessions-search');
            await refreshPastSessionsList(search ? search.value : '');
        }

        async function viewPastSession(path) {
            if (!window.SessionRecall) return;
            try {
                const content = await SessionRecall.readPastSession(path);
                const parsed = SessionRecall.parseFrontmatter(content);
                const turns = SessionRecall.parseConversationTurns(parsed.body);
                const bookmarks = SessionRecall.parseBookmarksSection(parsed.body);
                let preview = formatPastSessionLabel(Object.assign({}, parsed.meta, { path: path }));
                if (turns.length) {
                    preview += '\n\n' + turns.slice(0, 4).map(t => t.label + '\n' + t.text.slice(0, 400)).join('\n\n');
                }
                if (bookmarks.length) {
                    preview += '\n\nBookmarks:\n' + bookmarks.map(b => '- ' + b.concern + ': ' + (b.question || '').slice(0, 120)).join('\n');
                }
                alert(preview.slice(0, 3500));
            } catch (e) {
                alert('Could not read session: ' + (e.message || e));
            }
        }

        async function usePastSessionInQuestion(meta) {
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
        }

        window.showPastSessionsModal = showPastSessionsModal;
        window.closePastSessionsModal = closePastSessionsModal;
        window.searchPastSessionsUi = searchPastSessionsUi;

'''
must_replace(section_anchor, section_js + section_anchor, 'past sessions js')

p.write_text(text, encoding='utf-8')
print('index.html patched')
