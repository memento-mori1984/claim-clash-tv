from pathlib import Path

# session-export.js
p = Path(r"C:\Windows\System32\claim-clash-tv\src\session-export.js")
t = p.read_text(encoding="utf-8")

t = t.replace(
    """    function sanitizeFilenameTopic(text) {
        return String(text || 'session')
            .replace(/[<>:"/\\\\|?*\\x00-\\x1F]/g, '')
            .replace(/\\s+/g, ' ')
            .trim() || 'session';
    }""",
    """    function sanitizeFilenameTopic(text) {
        return String(text || 'session')
            .replace(/[\\[\\]<>:"/\\\\|?*\\x00-\\x1F]/g, '')
            .replace(/\\s+/g, ' ')
            .trim() || 'session';
    }

    function formatTopicBracket(topic, usePlaceholder) {
        if (usePlaceholder || !topic || topic === 'session') return '[topic]';
        return `[${topic}]`;
    }"""
)

t = t.replace(
    """    function resolveExportBasename(data) {
        const n = data.convNumber || 1;
        const topic = data.convTopic || deriveConversationTopic(data);
        return `conv ${n} - ${topic}`;
    }""",
    """    function resolveExportBasename(data) {
        const n = data.convNumber || 1;
        const topic = data.convTopic || deriveConversationTopic(data);
        const hasTopic = !!(topic && topic !== 'session');
        return `conv ${n} - ${formatTopicBracket(topic, !hasTopic)}`;
    }"""
)

t = t.replace(
    """    function emailSaveDefaultFilename(data, extension) {
        const n = data.convNumber || 1;
        let topic = data.convTopic || deriveConversationTopic(data);
        if (!topic || topic === 'session') topic = 'topic';
        const ext = String(extension || 'md').replace(/^\\./, '');
        return `conv ${n} - ${topic}.${ext}`;
    }""",
    """    function emailSaveDefaultFilename(data, extension) {
        const n = data.convNumber || 1;
        const topic = data.convTopic || deriveConversationTopic(data);
        const hasTopic = !!(topic && topic !== 'session');
        const ext = String(extension || 'md').replace(/^\./, '');
        return `conv ${n} - ${formatTopicBracket(topic, !hasTopic)}.${ext}`;
    }"""
)

if 'formatTopicBracket' not in t.split('window.SessionExport')[0]:
    raise SystemExit('session-export patch failed')
p.write_text(t, encoding='utf-8')

# lib.rs parse brackets after dash
p = Path(r"C:\Windows\System32\claim-clash-tv\src-tauri\src\lib.rs")
t = p.read_text(encoding='utf-8')
old = """        if let Some(dash_idx) = rest.find(" - ") {
            let conv_part = rest[..dash_idx].trim();
            let topic = rest[dash_idx + 3..].trim();
            if let Ok(conv) = conv_part.parse::<u32>() {
                return (Some(conv), topic.to_string());
            }
        }"""
new = """        if let Some(dash_idx) = rest.find(" - ") {
            let conv_part = rest[..dash_idx].trim();
            let mut topic = rest[dash_idx + 3..].trim().to_string();
            if topic.starts_with('[') && topic.ends_with(']') && topic.len() >= 2 {
                topic = topic[1..topic.len() - 1].trim().to_string();
            }
            if let Ok(conv) = conv_part.parse::<u32>() {
                return (Some(conv), topic);
            }
        }"""
t = t.replace(old, new, 1)
t = t.replace('format!("conv 1 - topic.{ext}")', 'format!("conv 1 - [topic].{ext}")')
p.write_text(t, encoding='utf-8')

# index.html hint
p = Path(r"C:\Windows\System32\claim-clash-tv\src\index.html")
t = p.read_text(encoding='utf-8')
t = t.replace(
    'Save the file to Documents first (edit the topic in the file name), then Outlook or Thunderbird attaches it when available. Web email cannot auto-attach.',
    'Save the file to Documents first (default name uses [topic] for you to edit), then Outlook or Thunderbird attaches it when available. Web email cannot auto-attach.'
)
t = t.replace(
    "setExportSessionStatus('Save the file to Documents (edit topic in file name)...', false);",
    "setExportSessionStatus('Save the file to Documents (edit [topic] in file name)...', false);"
)
p.write_text(t, encoding='utf-8')
print('bracket topic format applied')
