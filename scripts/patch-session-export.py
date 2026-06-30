import pathlib

p = pathlib.Path(r"C:\Windows\System32\claim-clash-tv\src\session-export.js")
text = p.read_text(encoding="utf-8")
old = """    function buildMarkdown(data) {
        const parts = ['# Claim Clash Session Summary', ''];
        buildMetadataLines(data).forEach(line => parts.push(line));"""
new = r"""    function escapeYamlString(text) {
        return String(text || '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\r?\n/g, ' ');
    }

    function buildFrontmatter(data) {
        const topic = data.convTopic || deriveConversationTopic(data);
        const lines = [
            '---',
            `conv: ${data.convNumber || 1}`,
            `topic: "${escapeYamlString(topic)}"`,
            `exportedAt: "${escapeYamlString(data.exportedAtDisplay)}"`,
            `turnCount: ${(data.turns || []).length}`,
            'bookmarks:'
        ];
        const bookmarks = data.bookmarks || [];
        if (!bookmarks.length) {
            lines.push('  []');
        } else {
            bookmarks.forEach(b => {
                lines.push(`  - concern: "${escapeYamlString(b.concern)}"`);
                if (b.question) lines.push(`    question: "${escapeYamlString(b.question)}"`);
                if (b.player) lines.push(`    player: "${escapeYamlString(b.player)}"`);
            });
        }
        lines.push('---', '');
        return lines.join('\n');
    }

    function buildMarkdown(data) {
        const parts = [buildFrontmatter(data), '# Claim Clash Session Summary', ''];
        buildMetadataLines(data).forEach(line => parts.push(line));"""
if old not in text:
    raise SystemExit('session-export.js anchor not found')
text = text.replace(old, new, 1)
text = text.replace("        buildMarkdown,\n        buildEmailTextBody,", "        buildMarkdown,\n        buildFrontmatter,\n        buildEmailTextBody,", 1)
p.write_text(text, encoding="utf-8")
print('session-export.js patched')
