from pathlib import Path

# --- lib.rs: shared email helper + save_to_documents + compose from path ---
p = Path(r"C:\Windows\System32\claim-clash-tv\src-tauri\src\lib.rs")
t = p.read_text(encoding="utf-8")

helper = r'''
fn open_native_email_with_attachment(
    file_path: &std::path::Path,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<String, String> {
    if !file_path.is_file() {
        return Err("Attachment file was not found.".into());
    }

    let export_dir = std::env::temp_dir().join("ClaimClashExports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;
    let safe_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment");
    let body_path = export_dir.join(format!("{safe_name}.body.txt"));
    std::fs::write(&body_path, body).map_err(|e| e.to_string())?;

    let path_literal = file_path.to_string_lossy().replace('\'', "''");
    let body_literal = body_path.to_string_lossy().replace('\'', "''");
    let to_literal = to.replace('\'', "''");
    let subject_literal = subject.replace('\'', "''");

    let ps_script = format!(
        r#"$path = '{path_literal}'
$bodyPath = '{body_literal}'
$to = '{to_literal}'
$subject = '{subject_literal}'
$body = Get-Content -LiteralPath $bodyPath -Raw -Encoding UTF8
try {{
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $ol = New-Object -ComObject Outlook.Application
  $mail = $ol.CreateItem(0)
  if ($to) {{ $mail.To = $to }}
  $mail.Subject = $subject
  $mail.Body = $body
  [void]$mail.Attachments.Add($resolved)
  $mail.Display()
  Write-Output 'outlook'
  exit 0
}} catch {{}}
try {{
  $tb = Get-Command thunderbird -ErrorAction Stop
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $attach = "attachment='file:///" + ($resolved -replace '\\','/') + "'"
  $args = @('-compose', "to={to_literal},subject={subject_literal},body=$body,$attach")
  Start-Process -FilePath $tb.Source -ArgumentList $args
  Write-Output 'thunderbird'
  exit 0
}} catch {{}}
Write-Output 'manual'"#
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .map_err(|e| format!("Could not launch email compose helper: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout
        .lines()
        .map(str::trim)
        .find(|line| *line == "outlook" || *line == "thunderbird" || *line == "manual")
        .unwrap_or("manual")
        .to_string())
}

'''

if 'fn open_native_email_with_attachment' not in t:
    t = t.replace(
        '/// Writes a temp export file and opens a desktop mail app with the attachment when possible.',
        helper + '/// Writes a temp export file and opens a desktop mail app with the attachment when possible.',
        1,
    )

old_compose = '''    let bytes = decode_export_bytes(&bytes_base64)?;
    let export_dir = std::env::temp_dir().join("ClaimClashExports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let safe_name = sanitize_export_filename(filename.trim());
    if safe_name.is_empty() {
        return Err("Invalid export filename.".into());
    }

    let file_path = export_dir.join(&safe_name);
    std::fs::write(&file_path, &bytes).map_err(|e| e.to_string())?;

    let body_path = export_dir.join(format!("{safe_name}.body.txt"));
    std::fs::write(&body_path, &body).map_err(|e| e.to_string())?;

    let path_string = file_path.to_string_lossy().into_owned();
    let path_literal = file_path.to_string_lossy().replace('\'', "''");
    let body_literal = body_path.to_string_lossy().replace('\'', "''");
    let to_literal = to.replace('\'', "''");
    let subject_literal = subject.replace('\'', "''");

    let ps_script = format!(
        r#"$path = '{path_literal}'
$bodyPath = '{body_literal}'
$to = '{to_literal}'
$subject = '{subject_literal}'
$body = Get-Content -LiteralPath $bodyPath -Raw -Encoding UTF8
try {{
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $ol = New-Object -ComObject Outlook.Application
  $mail = $ol.CreateItem(0)
  if ($to) {{ $mail.To = $to }}
  $mail.Subject = $subject
  $mail.Body = $body
  [void]$mail.Attachments.Add($resolved)
  $mail.Display()
  Write-Output 'outlook'
  exit 0
}} catch {{}}
try {{
  $tb = Get-Command thunderbird -ErrorAction Stop
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $attach = "attachment='file:///" + ($resolved -replace '\\','/') + "'"
  $args = @('-compose', "to={to_literal},subject={subject_literal},body=$body,$attach")
  Start-Process -FilePath $tb.Source -ArgumentList $args
  Write-Output 'thunderbird'
  exit 0
}} catch {{}}
Write-Output 'manual'"#
    );

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .map_err(|e| format!("Could not launch email compose helper: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let method = stdout
        .lines()
        .map(str::trim)
        .find(|line| *line == "outlook" || *line == "thunderbird" || *line == "manual")
        .unwrap_or("manual")
        .to_string();
    let message = match method.as_str() {
        "outlook" | "thunderbird" => "Email opened.".to_string(),
        _ => "Email opened.".to_string(),
    };

    Ok(ComposeEmailResult {
        method,
        path: path_string,
        message,
    })'''

new_compose = '''    let bytes = decode_export_bytes(&bytes_base64)?;
    let export_dir = std::env::temp_dir().join("ClaimClashExports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let safe_name = sanitize_export_filename(filename.trim());
    if safe_name.is_empty() {
        return Err("Invalid export filename.".into());
    }

    let file_path = export_dir.join(&safe_name);
    std::fs::write(&file_path, &bytes).map_err(|e| e.to_string())?;

    let path_string = file_path.to_string_lossy().into_owned();
    let method = open_native_email_with_attachment(&file_path, &to, &subject, &body)?;
    let message = "Email opened.".to_string();

    Ok(ComposeEmailResult {
        method,
        path: path_string,
        message,
    })'''

if 'open_native_email_with_attachment(&file_path' not in t:
    t = t.replace(old_compose, new_compose, 1)

new_from_path = '''

/// Opens a desktop mail app with an attachment from an existing file path.
#[tauri::command]
fn compose_session_email_from_path(
    file_path: String,
    to: String,
    subject: String,
    body: String,
) -> Result<ComposeEmailResult, String> {
    let path = std::path::PathBuf::from(file_path.trim());
    if !path.is_file() {
        return Err("Attachment file was not found.".into());
    }
    let path_string = path.to_string_lossy().into_owned();
    let method = open_native_email_with_attachment(&path, &to, &subject, &body)?;
    Ok(ComposeEmailResult {
        method,
        path: path_string,
        message: "Email opened.".to_string(),
    })
}

'''

if 'compose_session_email_from_path' not in t:
    t = t.replace(
        '/// Shows a native save dialog and writes exported session bytes to the chosen path.',
        new_from_path + '/// Shows a native save dialog and writes exported session bytes to the chosen path.',
        1,
    )

old_save = '''fn save_session_export(
    app: tauri::AppHandle,
    bytes_base64: String,
    default_name: String,
    extension: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let bytes = decode_export_bytes(&bytes_base64)?;
    let ext = extension.trim_start_matches('.').to_lowercase();
    let filter_name = match ext.as_str() {
        "md" => "Markdown",
        "pdf" => "PDF",
        "docx" => "Word Document",
        _ => "Export",
    };

    let dialog_name = sanitize_export_filename(default_name.trim());
    let dialog_default = if dialog_name.is_empty() {
        format!("conv 1 - session.{ext}")
    } else {
        dialog_name
    };

    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.dialog()
        .file()
        .add_filter(filter_name, &[ext.as_str()])
        .set_file_name(&dialog_default)
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });'''

new_save = '''fn save_session_export(
    app: tauri::AppHandle,
    bytes_base64: String,
    default_name: String,
    extension: String,
    save_to_documents: Option<bool>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let bytes = decode_export_bytes(&bytes_base64)?;
    let ext = extension.trim_start_matches('.').to_lowercase();
    let filter_name = match ext.as_str() {
        "md" => "Markdown",
        "pdf" => "PDF",
        "docx" => "Word Document",
        _ => "Export",
    };

    let dialog_name = sanitize_export_filename(default_name.trim());
    let dialog_default = if dialog_name.is_empty() {
        format!("conv 1 - topic.{ext}")
    } else {
        dialog_name
    };

    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let mut dialog = app.dialog().file();
    dialog = dialog
        .set_title(if save_to_documents.unwrap_or(false) {
            "Save session export to Documents"
        } else {
            "Save session export"
        })
        .add_filter(filter_name, &[ext.as_str()])
        .set_file_name(&dialog_default);
    if save_to_documents.unwrap_or(false) {
        if let Ok(backup_dir) = sessions_backup_dir() {
            let _ = std::fs::create_dir_all(&backup_dir);
            dialog = dialog.set_directory(&backup_dir);
        }
    }
    dialog.save_file(move |file_path| {
            let _ = tx.send(file_path);
        });'''

if 'save_to_documents: Option<bool>' not in t:
    t = t.replace(old_save, new_save, 1)

if 'compose_session_email_from_path' not in t.split('invoke_handler')[1]:
    t = t.replace(
        '            compose_session_email_with_attachment,',
        '            compose_session_email_with_attachment,\n            compose_session_email_from_path,',
        1,
    )

p.write_text(t, encoding='utf-8')
print('lib.rs done')
