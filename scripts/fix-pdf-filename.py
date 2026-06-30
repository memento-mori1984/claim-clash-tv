from pathlib import Path

# Fix session-export.js: strip HTML in topic, use Windows-safe filename format
p = Path(r"C:\Windows\System32\claim-clash-tv\src\session-export.js")
t = p.read_text(encoding="utf-8")
t = t.replace(
    """    function deriveConversationTopic(data) {
        const firstUser = (data.turns || []).find(t => t.role === 'user');
        let raw = firstUser ? firstUser.text : (data.currentQuestion || '');
        raw = sanitizeExportText(raw).replace(/\\s+/g, ' ').trim();""",
    """    function stripHtmlForTopic(text) {
        return String(text || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\\s+/g, ' ')
            .trim();
    }

    function deriveConversationTopic(data) {
        const firstUser = (data.turns || []).find(t => t.role === 'user');
        let raw = firstUser ? firstUser.text : (data.currentQuestion || '');
        raw = stripHtmlForTopic(sanitizeExportText(raw));"""
)
t = t.replace(
    "        return `conv ${n} [${topic}]`;",
    "        return `conv ${n} - ${topic}`;"
)
p.write_text(t, encoding="utf-8")
print("session-export.js updated")

# Fix lib.rs: save dialog stem + filename parser for pdf/docx and dash format
p = Path(r"C:\Windows\System32\claim-clash-tv\src-tauri\src\lib.rs")
t = p.read_text(encoding="utf-8")
t = t.replace(
    """fn parse_conv_topic_from_filename(filename: &str) -> (Option<u32>, String) {
    let stem = filename.trim_end_matches(".md");
    if let Some(rest) = stem.strip_prefix("conv ") {
        if let Some(bracket_start) = rest.find('[') {
            if let Some(bracket_end) = rest[bracket_start..].find(']') {
                let conv_part = rest[..bracket_start].trim();
                let topic = rest[bracket_start + 1..bracket_start + bracket_end].trim();
                let conv = conv_part.parse::<u32>().ok();
                return (conv, topic.to_string());
            }
        }
        if let Some((conv_part, topic_part)) = rest.split_once(' ') {
            if let Ok(conv) = conv_part.parse::<u32>() {
                return (Some(conv), topic_part.trim().to_string());
            }
        }
    }
    (None, stem.to_string())
}""",
    """fn file_stem_name(filename: &str) -> String {
    std::path::Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename)
        .to_string()
}

fn parse_conv_topic_from_filename(filename: &str) -> (Option<u32>, String) {
    let stem = file_stem_name(filename);
    if let Some(rest) = stem.strip_prefix("conv ") {
        if let Some(dash_idx) = rest.find(" - ") {
            let conv_part = rest[..dash_idx].trim();
            let topic = rest[dash_idx + 3..].trim();
            if let Ok(conv) = conv_part.parse::<u32>() {
                return (Some(conv), topic.to_string());
            }
        }
        if let Some(bracket_start) = rest.find('[') {
            if let Some(bracket_end) = rest[bracket_start..].find(']') {
                let conv_part = rest[..bracket_start].trim();
                let topic = rest[bracket_start + 1..bracket_start + bracket_end].trim();
                let conv = conv_part.parse::<u32>().ok();
                return (conv, topic.to_string());
            }
        }
        if let Some((conv_part, topic_part)) = rest.split_once(' ') {
            if let Ok(conv) = conv_part.parse::<u32>() {
                return (Some(conv), topic_part.trim().to_string());
            }
        }
    }
    (None, stem.to_string())
}"""
)
old_save = """    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.dialog()
        .file()
        .add_filter(filter_name, &[ext.as_str()])
        .set_file_name(&default_name)
        .save_file(move |file_path| {"""
new_save = """    let dialog_stem = std::path::Path::new(default_name.trim())
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("session-export");

    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.dialog()
        .file()
        .add_filter(filter_name, &[ext.as_str()])
        .set_file_name(dialog_stem)
        .save_file(move |file_path| {"""
if old_save not in t:
    raise SystemExit('save_session_export block not found')
t = t.replace(old_save, new_save, 1)
p.write_text(t, encoding="utf-8")
print("lib.rs updated")
