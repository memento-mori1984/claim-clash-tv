from pathlib import Path

# session-export.js
p = Path(r"C:\Windows\System32\claim-clash-tv\src\session-export.js")
t = p.read_text(encoding="utf-8")
if 'emailSaveDefaultFilename' not in t:
    t = t.replace(
        """    function previewExportFilename(data, extension) {
        return defaultFilename(data, extension);
    }""",
        """    function previewExportFilename(data, extension) {
        return defaultFilename(data, extension);
    }

    function emailSaveDefaultFilename(data, extension) {
        const n = data.convNumber || 1;
        let topic = data.convTopic || deriveConversationTopic(data);
        if (!topic || topic === 'session') topic = 'topic';
        const ext = String(extension || 'md').replace(/^\\./, '');
        return `conv ${n} - ${topic}.${ext}`;
    }"""
    )
    t = t.replace(
        '        previewExportFilename,\n        defaultFilename,',
        '        previewExportFilename,\n        emailSaveDefaultFilename,\n        defaultFilename,',
        1,
    )
    p.write_text(t, encoding='utf-8')
print('session-export.js')

# index.html
p = Path(r"C:\Windows\System32\claim-clash-tv\src\index.html")
t = p.read_text(encoding='utf-8')

t = t.replace(
    ": 'The selected file is created and attached automatically. Large exports are split into multiple emails.';",
    ": 'Save the file to Documents first (edit the topic in the file name), then Outlook or Thunderbird attaches it when available. Web email cannot auto-attach.';"
)

old_attach = '''                setExportSessionStatus('Encoding attachment...', false);
                await paintExportUi();

                const result = await tauriInvoke('compose_session_email_with_attachment', {
                    bytesBase64: await exportBytesToBase64Async(filePart.bytes),
                    filename: filePart.filename,
                    to: to,
                    subject: subject,
                    body: body
                });

                if (result && (result.method === 'outlook' || result.method === 'thunderbird')) {
                    const extra = plan.length > 1
                        ? ` Part ${selectedPartIndex + 1} of ${plan.length}. Use the buttons below for the remaining parts.`
                        : '';
                    setExportSessionStatus('Email opened.' + extra, false);
                    return;
                }

                setExportSessionStatus('Opening email...', false);
                await paintExportUi();
                const opened = await openWebEmailCompose(provider, to, subject, body);
                const extra = plan.length > 1
                    ? ` Part ${selectedPartIndex + 1} of ${plan.length}. Use the buttons below for the remaining parts.`
                    : '';
                if (opened) {
                    setExportSessionStatus('Email opened.' + extra, false);
                } else {
                    setExportSessionStatus('Could not open email.', true);
                }'''

new_attach = '''                setExportSessionStatus('Save the file to Documents (edit topic in file name)...', false);
                await paintExportUi();

                data.convTopic = SessionExport.deriveConversationTopic(data);
                const attachExtension = filePart.formatUsed || format;
                const emailSaveName = SessionExport.emailSaveDefaultFilename(data, attachExtension);

                let savedPath = null;
                try {
                    savedPath = await tauriInvoke('save_session_export', {
                        bytesBase64: await exportBytesToBase64Async(filePart.bytes),
                        defaultName: emailSaveName,
                        extension: attachExtension,
                        saveToDocuments: true
                    });
                } catch (e) {
                    setExportSessionStatus('Could not save attachment: ' + (e.message || e), true);
                    return;
                }

                if (!savedPath) {
                    setExportSessionStatus('Save canceled.', false);
                    return;
                }

                setExportSessionStatus('Opening email...', false);
                await paintExportUi();

                const result = await tauriInvoke('compose_session_email_from_path', {
                    filePath: savedPath,
                    to: to,
                    subject: subject,
                    body: body
                });

                const extra = plan.length > 1
                    ? ` Part ${selectedPartIndex + 1} of ${plan.length}. Use the buttons below for the remaining parts.`
                    : '';

                if (result && (result.method === 'outlook' || result.method === 'thunderbird')) {
                    setExportSessionStatus('Saved and email opened with attachment.' + extra, false);
                    return;
                }

                const opened = await openWebEmailCompose(provider, to, subject, body);
                if (opened) {
                    setExportSessionStatus('File saved to Documents. Email opened (attach the saved file manually).' + extra, false);
                } else {
                    setExportSessionStatus('File saved to Documents. Attach it manually in your email app.' + extra, false);
                }'''

if 'compose_session_email_from_path' not in t:
    t = t.replace(old_attach, new_attach, 1)

# Save File invoke - add saveToDocuments: false
t = t.replace(
    """                const savedPath = await tauriInvoke('save_session_export', {
                    bytesBase64: await exportBytesToBase64Async(built.bytes),
                    defaultName: filename,
                    extension: saveExtension
                });""",
    """                const savedPath = await tauriInvoke('save_session_export', {
                    bytesBase64: await exportBytesToBase64Async(built.bytes),
                    defaultName: filename,
                    extension: saveExtension,
                    saveToDocuments: false
                });"""
)

p.write_text(t, encoding='utf-8')
print('index.html done')
