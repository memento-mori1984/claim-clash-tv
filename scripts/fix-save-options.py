from pathlib import Path

# Rust: use full sanitized filename in save dialog for all save formats
p = Path(r"C:\Windows\System32\claim-clash-tv\src-tauri\src\lib.rs")
t = p.read_text(encoding="utf-8")
old = """    let dialog_stem = std::path::Path::new(default_name.trim())
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("session-export");

    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.dialog()
        .file()
        .add_filter(filter_name, &[ext.as_str()])
        .set_file_name(dialog_stem)"""
new = """    let dialog_name = sanitize_export_filename(default_name.trim());
    let dialog_default = if dialog_name.is_empty() {
        format!("conv 1 - session.{ext}")
    } else {
        dialog_name
    };

    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.dialog()
        .file()
        .add_filter(filter_name, &[ext.as_str()])
        .set_file_name(&dialog_default)"""
if old not in t:
    raise SystemExit('rust save block not found')
p.write_text(t.replace(old, new, 1), encoding='utf-8')

# index.html: save-only preview + refresh topic right before save filename
p = Path(r"C:\Windows\System32\claim-clash-tv\src\index.html")
t = p.read_text(encoding='utf-8')
t = t.replace(
    "preview.textContent = contentLine + ' File name: ' + filename + ' (Markdown, Word, PDF, email attach, and Documents backup).';",
    "preview.textContent = contentLine + ' Save as: ' + filename + ' when you click Save File.';"
)
t = t.replace(
    """            const filename = SessionExport.defaultFilename(data, built.formatUsed || format);

            try {
                const savedPath = await tauriInvoke('save_session_export', {
                    bytesBase64: await exportBytesToBase64Async(built.bytes),
                    defaultName: filename,
                    extension: built.formatUsed || format
                });""",
    """            data.convTopic = SessionExport.deriveConversationTopic(data);
            const saveExtension = built.formatUsed || format;
            const filename = SessionExport.defaultFilename(data, saveExtension);

            try {
                const savedPath = await tauriInvoke('save_session_export', {
                    bytesBase64: await exportBytesToBase64Async(built.bytes),
                    defaultName: filename,
                    extension: saveExtension
                });"""
)
p.write_text(t, encoding='utf-8')
print('save options fix applied')
