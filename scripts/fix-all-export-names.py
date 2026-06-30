from pathlib import Path

# session-export.js updates
p = Path(r"C:\Windows\System32\claim-clash-tv\src\session-export.js")
t = p.read_text(encoding="utf-8")

if "function resolveExportBasename(data)" not in t:
    t = t.replace(
        """    function buildConvBasename(data) {
        const n = data.convNumber || 1;
        const topic = data.convTopic || deriveConversationTopic(data);
        return `conv ${n} - ${topic}`;
    }

    function defaultFilename(data, extension) {
        const ext = String(extension || 'md').replace(/^\\./, '');
        return `${buildConvBasename(data)}.${ext}`;
    }""",
        """    function resolveExportBasename(data) {
        const n = data.convNumber || 1;
        const topic = data.convTopic || deriveConversationTopic(data);
        return `conv ${n} - ${topic}`;
    }

    function buildConvBasename(data) {
        return resolveExportBasename(data);
    }

    function defaultFilename(data, extension) {
        const ext = String(extension || 'md').replace(/^\\./, '');
        return `${resolveExportBasename(data)}.${ext}`;
    }

    function previewExportFilename(data, extension) {
        return defaultFilename(data, extension);
    }"""
    )

t = t.replace(
    """    function buildMetadataLines(data) {
        const lines = [
            `Date: ${data.exportedAtDisplay}`,
            `Version: ${data.appVersion} ${data.appPhase}`.trim(),
            `Rules: v${data.rulesVersion}`,
            `Mode: ${data.mode}`,
            `Primary AI: ${data.primaryName}`
        ];""",
    """    function buildMetadataLines(data) {
        const lines = [
            `Session: ${resolveExportBasename(data)}`,
            `Date: ${data.exportedAtDisplay}`,
            `Version: ${data.appVersion} ${data.appPhase}`.trim(),
            `Rules: v${data.rulesVersion}`,
            `Mode: ${data.mode}`,
            `Primary AI: ${data.primaryName}`
        ];"""
)

t = t.replace(
    "        const parts = [buildFrontmatter(data), '# Claim Clash Session Summary', ''];",
    "        const parts = [buildFrontmatter(data), `# ${resolveExportBasename(data)}`, ''];"
)

t = t.replace(
    "        bodyParts.push(wordParagraph('Claim Clash Session Summary', { heading: true }));",
    "        bodyParts.push(wordParagraph(resolveExportBasename(data), { heading: true }));"
)

t = t.replace(
    "        await addText('Claim Clash Session Summary', 16, 'bold');",
    "        await addText(resolveExportBasename(data), 16, 'bold');"
)

if "previewExportFilename," not in t:
    t = t.replace(
        "        buildConvBasename,\n        defaultFilename,",
        "        resolveExportBasename,\n        buildConvBasename,\n        previewExportFilename,\n        defaultFilename,"
    )

p.write_text(t, encoding="utf-8")
print("session-export.js updated")

# index.html updates
p = Path(r"C:\Windows\System32\claim-clash-tv\src\index.html")
t = p.read_text(encoding="utf-8")

if "function peekNextExportConvNumber" not in t:
    t = t.replace(
        """        function getNextExportConvNumber() {
            let n = 1;
            try {
                n = (parseInt(localStorage.getItem(EXPORT_CONV_COUNTER_KEY) || '0', 10) || 0) + 1;
                localStorage.setItem(EXPORT_CONV_COUNTER_KEY, String(n));
            } catch (e) {}
            return n;
        }""",
        """        function peekNextExportConvNumber() {
            try {
                return (parseInt(localStorage.getItem(EXPORT_CONV_COUNTER_KEY) || '0', 10) || 0) + 1;
            } catch (e) {}
            return 1;
        }

        function getNextExportConvNumber() {
            let n = peekNextExportConvNumber();
            try { localStorage.setItem(EXPORT_CONV_COUNTER_KEY, String(n)); } catch (e) {}
            return n;
        }

        function buildExportPreviewData() {
            const data = SessionExport.collectSessionExportData(getSessionExportContext());
            data.convNumber = pendingExportConvNumber != null ? pendingExportConvNumber : peekNextExportConvNumber();
            data.convTopic = SessionExport.deriveConversationTopic(data);
            return data;
        }"""
    )

t = t.replace(
    """        function updateExportSessionPreview() {
            const preview = document.getElementById('export-session-preview');
            if (!preview || !window.SessionExport) return;
            const data = SessionExport.collectSessionExportData(getSessionExportContext());
            const parts = [];
            if (data.turns.length) parts.push(`${data.turns.length} conversation turn${data.turns.length === 1 ? '' : 's'}`);
            if (data.bookmarks.length) parts.push(`${data.bookmarks.length} bookmark${data.bookmarks.length === 1 ? '' : 's'}`);
            if (data.comparison.length) parts.push(`${data.comparison.length} comparison response${data.comparison.length === 1 ? '' : 's'}`);
            preview.textContent = parts.length
                ? 'This export will include: ' + parts.join(', ') + '.'
                : 'No session content yet. Ask at least one question or add a bookmark before exporting.';
        }""",
    """        function updateExportSessionPreview() {
            const preview = document.getElementById('export-session-preview');
            if (!preview || !window.SessionExport) return;
            const data = buildExportPreviewData();
            const format = getSelectedExportFormat();
            const parts = [];
            if (data.turns.length) parts.push(`${data.turns.length} conversation turn${data.turns.length === 1 ? '' : 's'}`);
            if (data.bookmarks.length) parts.push(`${data.bookmarks.length} bookmark${data.bookmarks.length === 1 ? '' : 's'}`);
            if (data.comparison.length) parts.push(`${data.comparison.length} comparison response${data.comparison.length === 1 ? '' : 's'}`);
            const filename = SessionExport.previewExportFilename(data, format);
            const contentLine = parts.length
                ? 'This export will include: ' + parts.join(', ') + '.'
                : 'No session content yet. Ask at least one question or add a bookmark before exporting.';
            preview.textContent = contentLine + ' File name: ' + filename + ' (Markdown, Word, PDF, email attach, and Documents backup).';
        }"""
)

# Refresh topic on each export action
t = t.replace(
    "            data.convNumber = pendingExportConvNumber;\n            data.convTopic = SessionExport.deriveConversationTopic(data);",
    "            data.convNumber = pendingExportConvNumber;\n            data.convTopic = SessionExport.deriveConversationTopic(data);\n            data.exportBasename = SessionExport.resolveExportBasename(data);"
)

p.write_text(t, encoding="utf-8")
print("index.html updated")
