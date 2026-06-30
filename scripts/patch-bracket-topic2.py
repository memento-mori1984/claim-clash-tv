from pathlib import Path

p = Path(r"C:\Windows\System32\claim-clash-tv\src\session-export.js")
t = p.read_text(encoding="utf-8")

t = t.replace(
    '.replace(/[<>:"/\\|?*\\x00-\\x1F]/g, \'\')',
    '.replace(/[\\[\\]<>:"/\\|?*\\x00-\\x1F]/g, \'\')',
    1,
)

insert = """
    function formatTopicBracket(topic, usePlaceholder) {
        if (usePlaceholder || !topic || topic === 'session') return '[topic]';
        return '[' + topic + ']';
    }
"""
if "formatTopicBracket" not in t:
    t = t.replace(
        "    function deriveConversationTopic(data) {",
        insert + "\n    function deriveConversationTopic(data) {",
        1,
    )

old_resolve = """    function resolveExportBasename(data) {
        const n = data.convNumber || 1;
        const topic = data.convTopic || deriveConversationTopic(data);
        return `conv ${n} - ${topic}`;
    }"""

new_resolve = """    function resolveExportBasename(data) {
        const n = data.convNumber || 1;
        const topic = data.convTopic || deriveConversationTopic(data);
        const hasTopic = !!(topic && topic !== 'session');
        return `conv ${n} - ${formatTopicBracket(topic, !hasTopic)}`;
    }"""
t = t.replace(old_resolve, new_resolve, 1)

old_email = """    function emailSaveDefaultFilename(data, extension) {
        const n = data.convNumber || 1;
        let topic = data.convTopic || deriveConversationTopic(data);
        if (!topic || topic === 'session') topic = 'topic';
        const ext = String(extension || 'md').replace(/^\\./, '');
        return `conv ${n} - ${topic}.${ext}`;
    }"""

new_email = """    function emailSaveDefaultFilename(data, extension) {
        const n = data.convNumber || 1;
        const topic = data.convTopic || deriveConversationTopic(data);
        const hasTopic = !!(topic && topic !== 'session');
        const ext = String(extension || 'md').replace(/^\\./, '');
        return `conv ${n} - ${formatTopicBracket(topic, !hasTopic)}.${ext}`;
    }"""
t = t.replace(old_email, new_email, 1)

p.write_text(t, encoding="utf-8")

p = Path(r"C:\Windows\System32\claim-clash-tv\src-tauri\src\lib.rs")
t = p.read_text(encoding="utf-8")
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
if old in t:
    t = t.replace(old, new, 1)
t = t.replace('format!("conv 1 - topic.{ext}")', 'format!("conv 1 - [topic].{ext}")')
p.write_text(t, encoding="utf-8")

p = Path(r"C:\Windows\System32\claim-clash-tv\src\index.html")
t = p.read_text(encoding="utf-8")
t = t.replace("edit the topic in the file name", "edit [topic] in the file name")
t = t.replace("edit topic in file name", "edit [topic] in file name")
p.write_text(t, encoding="utf-8")
print("done")
