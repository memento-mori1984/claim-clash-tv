// Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
// "Claim Clash" is a trademark of Zachary H. Roberts.
//
//! Claim Clash Tauri backend: local HTTP server for Smart TV casting.
//!
//! The desktop app pushes live game state via [`update_cast_content`]. A TV browser
//! opens the URL returned by [`start_cast`] and polls `/state` for JSON updates.
//! The mirror page HTML is embedded from `src/cast-mirror.html` via [`get_cast_receiver_html`].

mod brain_config;
mod brain_feed;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{Emitter, Manager};
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use image::{ImageFormat, Luma};
use qrcode::QrCode;
use tiny_http::{Header, Response, Server};

/// A bookmarked concern shown on the TV mirror.
#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CastBookmark {
    pub concern: String,
    pub player: String,
}

/// One secondary AI response entry for the TV mirror.
#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CastAnswer {
    pub name: String,
    pub text: String,
}

/// Full game snapshot synced from the desktop app to the TV cast mirror.
#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CastContent {
    pub question: String,
    pub main_answer: String,
    pub current_player: String,
    pub answers: Vec<CastAnswer>,
    pub bookmarks: Vec<CastBookmark>,
    pub selected_ais: Vec<String>,
    pub primary_provider: String,
    // ARCHIVED: jailbreak_mode synced jailbreak toggle to TV cast mirror.
    // Feature disabled in shipping build; frontend always sends false.
    // Full implementation notes: src/jailbreak-mode.archive.js
    pub jailbreak_mode: bool,
    pub app_version: String,
    pub rules_version: String,
    /// Window scroll position as a fraction (0.0 = top, 1.0 = bottom).
    pub scroll_fraction: f64,
    pub question_scroll_fraction: f64,
    pub answer_scroll_fraction: f64,
    pub ai_responses_scroll_fraction: f64,
    pub updated_at: u64,
}

/// Connection details returned when casting starts.
#[derive(serde::Serialize)]
pub struct CastStartResponse {
    pub url: String,
    pub ip: String,
    pub port: u16,
    pub token: String,
}

/// Status returned to the frontend for the cast button indicator dot.
#[derive(serde::Serialize)]
pub struct CastStatus {
    pub running: bool,
    pub tv_connected: bool,
    pub url: String,
    pub ip: String,
    pub port: u16,
    pub token: String,
}

/// Viewer is considered connected only while `/state` polls arrive within this window.
const VIEWER_POLL_TIMEOUT_SECS: u64 = 4;

/// Returns current Unix timestamp in seconds for cache-busting and sync markers.
fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Shared cast server state managed by Tauri.
struct CastState {
    content: Arc<Mutex<CastContent>>,
    running: bool,
    /// Unix seconds of the last `/state` poll from a TV/phone/browser mirror.
    last_viewer_poll_at: Arc<Mutex<u64>>,
    cast_url: String,
    cast_ip: String,
    cast_port: u16,
    cast_token: String,
}

impl Default for CastState {
    fn default() -> Self {
        Self {
            content: Arc::new(Mutex::new(CastContent::default())),
            running: false,
            last_viewer_poll_at: Arc::new(Mutex::new(0)),
            cast_url: String::new(),
            cast_ip: String::new(),
            cast_port: 0,
            cast_token: String::new(),
        }
    }
}

fn generate_cast_token() -> String {
    let mut n = now_secs().wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ (std::process::id() as u64).wrapping_mul(0x517c_c1b7_2722_0a95);
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    (0..8)
        .map(|_| {
            n = n.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1);
            let idx = ((n >> 33) as usize) % CHARSET.len();
            CHARSET[idx] as char
        })
        .collect()
}

fn url_path(url: &str) -> &str {
    url.split('?').next().unwrap_or("/").split('#').next().unwrap_or("/")
}

fn url_query_param(url: &str, key: &str) -> Option<String> {
    let query = url.split_once('?')?.1.split('#').next()?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if parts.next()? == key {
            return Some(parts.next().unwrap_or("").to_string());
        }
    }
    None
}

fn cast_token_matches(url: &str, expected: &str) -> bool {
    if expected.is_empty() {
        return false;
    }
    match url_query_param(url, "token") {
        Some(got) => got == expected,
        None => false,
    }
}

fn cast_forbidden_response() -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string("Forbidden")
        .with_status_code(403)
        .with_header(Header::from_bytes("Content-Type", "text/plain").unwrap())
}

/// True when a cast mirror has polled `/state` recently (browser still open).
fn viewer_is_connected(running: bool, last_poll_at: u64) -> bool {
    if !running || last_poll_at == 0 {
        return false;
    }
    now_secs().saturating_sub(last_poll_at) <= VIEWER_POLL_TIMEOUT_SECS
}

/// Builds a scannable PNG QR code for the cast URL (served at `/qr.png`).
fn generate_qr_png(data: &str) -> Result<Vec<u8>, String> {
    let code = QrCode::new(data.as_bytes()).map_err(|e| e.to_string())?;
    let img = code
        .render::<Luma<u8>>()
        .quiet_zone(true)
        .min_dimensions(256, 256)
        .module_dimensions(8, 8)
        .build();

    let mut bytes = Vec::new();
    image::DynamicImage::ImageLuma8(img)
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Starts a background HTTP server on a random local port and returns connection info.
///
/// Serves:
/// - `/` and `/index.html`: embedded cast mirror HTML
/// - `/state`: JSON snapshot of [`CastContent`]
/// - `/qr.png`: scannable QR for the cast URL
/// - `/claimsclash.png`: app logo asset
#[tauri::command]
fn start_cast(state: tauri::State<Arc<Mutex<CastState>>>) -> Result<CastStartResponse, String> {
    let mut cast_state = state.lock().map_err(|e| e.to_string())?;

    if cast_state.running {
        return Err("Already casting".to_string());
    }

    let local_ip = local_ip_address::local_ip().map_err(|e| e.to_string())?;
    let ip = local_ip.to_string();
    let token = generate_cast_token();

    // Bind to LAN IP only (not 0.0.0.0) so the cast server is not exposed on all interfaces.
    let bind_addr = format!("{ip}:0");
    let server = Server::http(&bind_addr).map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().unwrap().port();
    let url = format!("http://{ip}:{port}/?token={token}");

    cast_state.cast_url = url.clone();
    cast_state.cast_ip = ip.clone();
    cast_state.cast_port = port;
    cast_state.cast_token = token.clone();
    *cast_state
        .last_viewer_poll_at
        .lock()
        .map_err(|e| e.to_string())? = 0;

    let content = cast_state.content.clone();
    let last_viewer_poll_at = cast_state.last_viewer_poll_at.clone();
    let qr_url = url.clone();
    let expected_token = token.clone();

    // Run HTTP server in a background thread
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let full_url = request.url().to_string();
            let path = url_path(&full_url).to_string();
            let authorized = cast_token_matches(&full_url, &expected_token);

            if path == "/state" {
                if !authorized {
                    let _ = request.respond(cast_forbidden_response());
                    continue;
                }
                if let Ok(mut last_poll) = last_viewer_poll_at.lock() {
                    *last_poll = now_secs();
                }
                let content = content.lock().unwrap();
                let json = serde_json::json!({
                    "question": content.question,
                    "main_answer": content.main_answer,
                    "current_player": content.current_player,
                    "answers": content.answers,
                    "bookmarks": content.bookmarks,
                    "selected_ais": content.selected_ais,
                    "primary_provider": content.primary_provider,
                    "jailbreak_mode": content.jailbreak_mode,
                    "app_version": content.app_version,
                    "rules_version": content.rules_version,
                    "scroll_fraction": content.scroll_fraction,
                    "question_scroll_fraction": content.question_scroll_fraction,
                    "answer_scroll_fraction": content.answer_scroll_fraction,
                    "ai_responses_scroll_fraction": content.ai_responses_scroll_fraction,
                    "updated_at": content.updated_at,
                });
                let response = Response::from_string(json.to_string())
                    .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
                    .with_header(Header::from_bytes("Cache-Control", "no-store, no-cache, must-revalidate").unwrap())
                    .with_header(Header::from_bytes("Pragma", "no-cache").unwrap());
                let _ = request.respond(response);
            } else if path == "/qr.png" {
                if !authorized {
                    let _ = request.respond(cast_forbidden_response());
                    continue;
                }
                let bytes = generate_qr_png(&qr_url).unwrap_or_default();
                let response = Response::from_data(bytes)
                    .with_header(Header::from_bytes("Content-Type", "image/png").unwrap())
                    .with_header(Header::from_bytes("Cache-Control", "no-store, no-cache, must-revalidate").unwrap());
                let _ = request.respond(response);
            } else if path == "/claimsclash.png" {
                if !authorized {
                    let _ = request.respond(cast_forbidden_response());
                    continue;
                }
                let bytes = include_bytes!("../../src/claimsclash.png");
                let response = Response::from_data(bytes.to_vec())
                    .with_header(Header::from_bytes("Content-Type", "image/png").unwrap());
                let _ = request.respond(response);
            } else if path == "/" || path == "/index.html" {
                let html = if authorized {
                    get_cast_receiver_html()
                } else {
                    get_cast_pairing_html().to_string()
                };
                let response = Response::from_string(html)
                    .with_header(Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap());
                let _ = request.respond(response);
            } else {
                let _ = request.respond(cast_forbidden_response());
            }
        }
    });

    cast_state.running = true;

    Ok(CastStartResponse {
        url,
        ip,
        port,
        token,
    })
}

/// Stops casting, clears synced content, and resets the TV-connected flag.
#[tauri::command]
fn stop_cast(state: tauri::State<Arc<Mutex<CastState>>>) -> Result<(), String> {
    let mut cast_state = state.lock().map_err(|e| e.to_string())?;
    cast_state.running = false;
    cast_state.cast_url.clear();
    cast_state.cast_ip.clear();
    cast_state.cast_port = 0;
    cast_state.cast_token.clear();
    if let Ok(mut last_poll) = cast_state.last_viewer_poll_at.lock() {
        *last_poll = 0;
    }
    // Clear content so the cast page shows nothing useful.
    let mut content = cast_state.content.lock().unwrap();
    *content = CastContent::default();
    Ok(())
}

/// Returns whether the cast server is running and connection details for the setup modal.
#[tauri::command]
fn get_cast_status(state: tauri::State<Arc<Mutex<CastState>>>) -> Result<CastStatus, String> {
    let cast_state = state.lock().map_err(|e| e.to_string())?;
    let last_poll_at = cast_state
        .last_viewer_poll_at
        .lock()
        .map_err(|e| e.to_string())?;
    Ok(CastStatus {
        running: cast_state.running,
        tv_connected: viewer_is_connected(cast_state.running, *last_poll_at),
        url: cast_state.cast_url.clone(),
        ip: cast_state.cast_ip.clone(),
        port: cast_state.cast_port,
        token: cast_state.cast_token.clone(),
    })
}

/// Updates the in-memory cast snapshot pushed to TVs polling `/state`.
///
/// Tauri 2 maps Rust `snake_case` parameters to JavaScript `camelCase` invoke args.
#[tauri::command]
fn update_cast_content(
    state: tauri::State<Arc<Mutex<CastState>>>,
    question: String,
    main_answer: String,
    current_player: String,
    answers: Vec<CastAnswer>,
    bookmarks: Vec<CastBookmark>,
    selected_ais: Vec<String>,
    primary_provider: String,
    jailbreak_mode: bool, // ARCHIVED: always false from frontend. See jailbreak-mode.archive.js
    app_version: String,
    rules_version: String,
    scroll_fraction: f64,
    question_scroll_fraction: f64,
    answer_scroll_fraction: f64,
    ai_responses_scroll_fraction: f64,
) -> Result<(), String> {
    let cast_state = state.lock().map_err(|e| e.to_string())?;
    let mut content = cast_state.content.lock().unwrap();
    content.question = question;
    content.main_answer = main_answer;
    content.current_player = current_player;
    content.answers = answers;
    content.bookmarks = bookmarks;
    content.selected_ais = selected_ais;
    content.primary_provider = primary_provider;
    content.jailbreak_mode = jailbreak_mode;
    content.app_version = app_version;
    content.rules_version = rules_version;
    content.scroll_fraction = scroll_fraction.clamp(0.0, 1.0);
    content.question_scroll_fraction = question_scroll_fraction.clamp(0.0, 1.0);
    content.answer_scroll_fraction = answer_scroll_fraction.clamp(0.0, 1.0);
    content.ai_responses_scroll_fraction = ai_responses_scroll_fraction.clamp(0.0, 1.0);
    content.updated_at = now_secs();
    Ok(())
}

/// Loads the TV mirror HTML bundled at compile time.
fn get_cast_receiver_html() -> String {
    include_str!("../../src/cast-mirror.html").to_string()
}

/// Pairing gate shown when the cast URL is opened without a valid token.
fn get_cast_pairing_html() -> &'static str {
    include_str!("../../src/cast-pairing.html")
}

/// Result of attempting to open a compose window with an attachment.
#[derive(serde::Serialize)]
struct ComposeEmailResult {
    method: String,
    path: String,
    message: String,
}

fn decode_export_bytes(bytes_base64: &str) -> Result<Vec<u8>, String> {
    STANDARD
        .decode(bytes_base64.trim())
        .map_err(|e| format!("Invalid export data encoding: {e}"))
}

const CLAIM_CLASH_DOCUMENTS_DIR: &str = "Claim Clash";
const LEGACY_SESSIONS_DIR: &str = "Claim Clash Sessions";

fn resolve_documents_dir() -> Result<std::path::PathBuf, String> {
    dirs::document_dir().ok_or_else(|| "Could not find your Documents folder.".into())
}

fn sanitize_export_filename(filename: &str) -> String {
    filename
        .chars()
        .map(|c| match c {
            '<' | '>' | '|' | ':' | '"' | '/' | '\\' | '*' | '?' => '_',
            _ => c,
        })
        .collect()
}


fn build_native_email_compose_script(
    path_literal: &str,
    body_literal: &str,
    to_literal: &str,
    subject_literal: &str,
) -> String {
    format!(
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
  exit 0
}} catch {{}}
try {{
  $tb = Get-Command thunderbird -ErrorAction Stop
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $attach = "attachment='file:///" + ($resolved -replace '\\','/') + "'"
  $args = @('-compose', "to={to_literal},subject={subject_literal},body=$body,$attach")
  Start-Process -FilePath $tb.Source -ArgumentList $args
  exit 0
}} catch {{}}
exit 1"#
    )
}

/// Launches Outlook/Thunderbird compose in a background process so the app UI never blocks.
fn spawn_native_email_with_attachment(
    file_path: &std::path::Path,
    to: &str,
    subject: &str,
    body: &str,
) -> Result<(), String> {
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
    let ps_script = build_native_email_compose_script(
        &path_literal,
        &body_literal,
        &to_literal,
        &subject_literal,
    );

    std::process::Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not launch email compose helper: {e}"))?;

    Ok(())
}

/// Writes a temp export file and opens a desktop mail app with the attachment when possible.
#[tauri::command]
fn compose_session_email_with_attachment(
    bytes_base64: String,
    filename: String,
    to: String,
    subject: String,
    body: String,
) -> Result<ComposeEmailResult, String> {
    let bytes = decode_export_bytes(&bytes_base64)?;
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
    spawn_native_email_with_attachment(&file_path, &to, &subject, &body)?;

    Ok(ComposeEmailResult {
        method: "spawned".to_string(),
        path: path_string,
        message: "Desktop mail compose is opening in the background. You can pick a different email provider anytime.".to_string(),
    })
}


#[derive(Clone, serde::Serialize)]
struct SessionBackupBookmark {
    concern: String,
    question: String,
    player: String,
}

#[derive(Clone, serde::Serialize)]
struct SessionBackupMeta {
    path: String,
    filename: String,
    conv: Option<u32>,
    topic: String,
    exported_at: String,
    turn_count: u32,
    bookmarks: Vec<SessionBackupBookmark>,
}

#[derive(serde::Serialize)]
struct SessionBackupSearchHit {
    meta: SessionBackupMeta,
    score: u32,
    snippet: String,
}

fn sessions_backup_dir() -> Result<std::path::PathBuf, String> {
    Ok(resolve_documents_dir()?.join(CLAIM_CLASH_DOCUMENTS_DIR))
}

fn legacy_sessions_backup_dir() -> Result<std::path::PathBuf, String> {
    Ok(resolve_documents_dir()?.join(LEGACY_SESSIONS_DIR))
}

fn session_backup_roots() -> Result<Vec<std::path::PathBuf>, String> {
    let primary = sessions_backup_dir()?;
    let mut roots = vec![primary.clone()];
    let legacy = legacy_sessions_backup_dir()?;
    if legacy != primary && legacy.is_dir() {
        roots.push(legacy);
    }
    Ok(roots)
}

fn path_is_under_session_roots(path: &std::path::Path) -> Result<bool, String> {
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("Invalid session path: {e}"))?;
    for root in session_backup_roots()? {
        let canonical_base = root.canonicalize().unwrap_or(root);
        if canonical_path.starts_with(&canonical_base) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Creates Documents/Claim Clash/ if missing; returns the folder path.
#[tauri::command]
fn ensure_claim_clash_documents_folder() -> Result<String, String> {
    let dir = sessions_backup_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

fn file_stem_name(filename: &str) -> String {
    std::path::Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename)
        .to_string()
}

fn parse_conv_topic_from_filename(filename: &str) -> (Option<u32>, String) {
    let stem = file_stem_name(filename);
    if let Some(rest) = stem.strip_prefix("ClaimsClash v") {
        let parts: Vec<&str> = rest.splitn(4, ' ').collect();
        if parts.len() >= 4 {
            if let Ok(conv) = parts[2].parse::<u32>() {
                let topic = parts[3].trim().to_string();
                return (Some(conv), topic);
            }
        }
    }
    if let Some(rest) = stem.strip_prefix("conv ") {
        if let Some(dash_idx) = rest.find(" - ") {
            let conv_part = rest[..dash_idx].trim();
            let mut topic = rest[dash_idx + 3..].trim().to_string();
            if topic.starts_with('[') && topic.ends_with(']') && topic.len() >= 2 {
                topic = topic[1..topic.len() - 1].trim().to_string();
            }
            if let Ok(conv) = conv_part.parse::<u32>() {
                return (Some(conv), topic);
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
}

fn unquote_yaml_value(value: &str) -> String {
    let trimmed = value.trim();
    if (trimmed.starts_with('"') && trimmed.ends_with('"'))
        || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
    {
        trimmed[1..trimmed.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    } else {
        trimmed.to_string()
    }
}

fn parse_frontmatter(content: &str) -> (Option<u32>, String, String, u32, Vec<SessionBackupBookmark>) {
    let mut conv = None;
    let mut topic = String::new();
    let mut exported_at = String::new();
    let mut turn_count = 0u32;
    let mut bookmarks: Vec<SessionBackupBookmark> = Vec::new();

    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (conv, topic, exported_at, turn_count, bookmarks);
    }

    let after = &trimmed[3..];
    let end = after.find("\n---");
    if end.is_none() {
        return (conv, topic, exported_at, turn_count, bookmarks);
    }
    let block = &after[..end.unwrap()];

    let mut current_bookmark: Option<SessionBackupBookmark> = None;
    for line in block.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        if line.starts_with("  - concern:") {
            if let Some(b) = current_bookmark.take() {
                bookmarks.push(b);
            }
            current_bookmark = Some(SessionBackupBookmark {
                concern: unquote_yaml_value(line.split_once(':').map(|(_, v)| v).unwrap_or("")),
                question: String::new(),
                player: String::new(),
            });
            continue;
        }
        if let Some(rest) = line.strip_prefix("    question:") {
            if let Some(ref mut b) = current_bookmark {
                b.question = unquote_yaml_value(rest);
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("    player:") {
            if let Some(ref mut b) = current_bookmark {
                b.player = unquote_yaml_value(rest);
            }
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = unquote_yaml_value(value);
            match key {
                "conv" => conv = value.parse().ok(),
                "topic" => topic = value,
                "exportedAt" => exported_at = value,
                "turnCount" => turn_count = value.parse().unwrap_or(0),
                _ => {}
            }
        }
    }
    if let Some(b) = current_bookmark.take() {
        bookmarks.push(b);
    }

    (conv, topic, exported_at, turn_count, bookmarks)
}

fn load_session_backup_meta(path: &std::path::Path) -> Result<SessionBackupMeta, String> {
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    if !filename.to_ascii_lowercase().ends_with(".md") {
        return Err("Not a Markdown session backup.".into());
    }

    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let (mut conv, mut topic, exported_at, turn_count, bookmarks) = parse_frontmatter(&content);
    if topic.is_empty() || conv.is_none() {
        let (file_conv, file_topic) = parse_conv_topic_from_filename(&filename);
        if conv.is_none() {
            conv = file_conv;
        }
        if topic.is_empty() {
            topic = file_topic;
        }
    }

    Ok(SessionBackupMeta {
        path: path.to_string_lossy().into_owned(),
        filename,
        conv,
        topic,
        exported_at,
        turn_count,
        bookmarks,
    })
}

fn tokenize_query(query: &str) -> Vec<String> {
    const STOP: &[&str] = &[
        "the", "and", "for", "that", "this", "with", "from", "about", "have", "did", "was", "were",
        "our", "your", "what", "when", "where", "which", "who", "how", "can", "you", "ask", "asked",
        "other", "day", "time", "last", "recall", "remember", "session", "bookmark", "question",
    ];
    query
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3 && !STOP.contains(w))
        .map(|w| w.to_string())
        .collect()
}

fn score_backup_for_query(meta: &SessionBackupMeta, body: &str, tokens: &[String]) -> (u32, String) {
    if tokens.is_empty() {
        return (0, String::new());
    }

    let mut score = 0u32;
    let topic_lc = meta.topic.to_lowercase();
    let filename_lc = meta.filename.to_lowercase();
    let body_lc = body.to_lowercase();
    let mut snippet = String::new();

    for token in tokens {
        let mut matched = false;
        if topic_lc.contains(token) {
            score += 6;
            matched = true;
            if snippet.is_empty() {
                snippet = format!("Topic: {}", meta.topic);
            }
        }
        if filename_lc.contains(token) {
            score += 4;
            matched = true;
        }
        for b in &meta.bookmarks {
            let concern_lc = b.concern.to_lowercase();
            let question_lc = b.question.to_lowercase();
            if concern_lc.contains(token) || question_lc.contains(token) {
                score += 5;
                matched = true;
                if snippet.is_empty() {
                    snippet = format!("Bookmark \"{}\": {}", b.concern, b.question);
                }
            }
        }
        if body_lc.contains(token) {
            score += 1;
            matched = true;
            if snippet.is_empty() {
                if let Some(pos) = body_lc.find(token) {
                    let start = pos.saturating_sub(40);
                    let end = (pos + token.len() + 80).min(body.len());
                    snippet = body[start..end].replace("\n", " ");
                }
            }
        }
        if !matched {
            score = score.saturating_sub(1);
        }
    }

    if snippet.is_empty() && !meta.topic.is_empty() {
        snippet = format!("Topic: {}", meta.topic);
    }

    (score, snippet)
}

/// Lists Markdown session backups saved in Documents/Claim Clash/.
#[tauri::command]
fn list_session_backups() -> Result<Vec<SessionBackupMeta>, String> {
    let mut items = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();

    for backup_dir in session_backup_roots()? {
        if !backup_dir.is_dir() {
            continue;
        }
        let entries = std::fs::read_dir(&backup_dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let path_key = path
                .canonicalize()
                .unwrap_or(path.clone())
                .to_string_lossy()
                .into_owned();
            if !seen_paths.insert(path_key) {
                continue;
            }
            if let Ok(meta) = load_session_backup_meta(&path) {
                items.push(meta);
            }
        }
    }

    items.sort_by(|a, b| {
        b.exported_at
            .cmp(&a.exported_at)
            .then(b.conv.unwrap_or(0).cmp(&a.conv.unwrap_or(0)))
    });
    Ok(items)
}

/// Reads a Markdown session backup by path (must be under Documents/Claim Clash/).
#[tauri::command]
fn read_session_backup(path: String) -> Result<String, String> {
    let requested = std::path::PathBuf::from(path.trim());
    if !path_is_under_session_roots(&requested)? {
        return Err("Session path is outside Documents\\Claim Clash.".into());
    }
    let canonical_path = requested
        .canonicalize()
        .map_err(|e| format!("Invalid session path: {e}"))?;
    std::fs::read_to_string(&canonical_path).map_err(|e| e.to_string())
}

/// Keyword search over saved session backups.
#[tauri::command]
fn search_session_backups(query: String, limit: Option<u32>) -> Result<Vec<SessionBackupSearchHit>, String> {
    let tokens = tokenize_query(&query);
    if tokens.is_empty() {
        return Ok(Vec::new());
    }

    let max_hits = limit.unwrap_or(8).clamp(1, 20) as usize;
    let mut hits = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();

    for backup_dir in session_backup_roots()? {
        if !backup_dir.is_dir() {
            continue;
        }
        let entries = std::fs::read_dir(&backup_dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let path_key = path
                .canonicalize()
                .unwrap_or(path.clone())
                .to_string_lossy()
                .into_owned();
            if !seen_paths.insert(path_key) {
                continue;
            }
            let meta = match load_session_backup_meta(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };
            let body = std::fs::read_to_string(&path).unwrap_or_default();
            let (score, snippet) = score_backup_for_query(&meta, &body, &tokens);
            if score > 0 {
                hits.push(SessionBackupSearchHit {
                    meta,
                    score,
                    snippet,
                });
            }
        }
    }

    hits.sort_by(|a, b| b.score.cmp(&a.score).then(b.meta.exported_at.cmp(&a.meta.exported_at)));
    hits.truncate(max_hits);
    Ok(hits)
}

/// Exits the application after the frontend has saved session state and stopped services.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Writes a Markdown session backup to Documents/Claim Clash/.
#[tauri::command]
fn save_session_md_backup(bytes_base64: String, filename: String) -> Result<String, String> {
    let bytes = decode_export_bytes(&bytes_base64)?;
    let backup_dir = sessions_backup_dir()?;
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let safe_name = sanitize_export_filename(filename.trim());
    if safe_name.is_empty() {
        return Err("Invalid backup filename.".into());
    }

    let path = backup_dir.join(&safe_name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}



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
    spawn_native_email_with_attachment(&path, &to, &subject, &body)?;
    Ok(ComposeEmailResult {
        method: "spawned".to_string(),
        path: path_string,
        message: "Desktop mail compose is opening in the background. You can pick a different email provider anytime.".to_string(),
    })
}

/// Shows a native save dialog and writes exported session bytes to the chosen path.
#[tauri::command]
fn save_session_export(
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
        format!("ClaimsClash v1 01 [topic].{ext}")
    } else {
        dialog_name
    };

    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let mut dialog = app.dialog().file();
    dialog = dialog
        .set_title(if save_to_documents.unwrap_or(false) {
            "Save session export to Documents\\Claim Clash"
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
        });

    let file_path = rx.recv().map_err(|e| e.to_string())?;
    let Some(file_path) = file_path else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|e| format!("Invalid save path: {e}"))?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Fetches and verifies the creator-signed Brain feed (server-side control only).
#[tauri::command]
fn fetch_brain_feed() -> Result<brain_feed::BrainFeedResponse, String> {
    brain_feed::fetch_verified_brain_feed()
}

/// Lists filenames in the export scan folder (Documents/Claim Clash by default).
#[tauri::command]
fn list_export_folder_filenames(directory: Option<String>) -> Result<Vec<String>, String> {
    let roots = match directory {
        Some(path) if !path.trim().is_empty() => vec![std::path::PathBuf::from(path.trim())],
        _ => session_backup_roots()?,
    };

    let mut names = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for dir in roots {
        if !dir.is_dir() {
            continue;
        }
        for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry
                .file_type()
                .map(|t| t.is_file())
                .unwrap_or(false)
            {
                if let Some(name) = entry.file_name().to_str() {
                    if seen.insert(name.to_string()) {
                        names.push(name.to_string());
                    }
                }
            }
        }
    }
    names.sort();
    Ok(names)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cast_state = Arc::new(Mutex::new(CastState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(cast_state)
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let window_for_emit = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_for_emit.emit("session-close-requested", ());
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            start_cast,
            stop_cast,
            get_cast_status,
            update_cast_content,
            save_session_export,
            save_session_md_backup,
            ensure_claim_clash_documents_folder,
            quit_app,
            compose_session_email_with_attachment,
            compose_session_email_from_path,
            list_session_backups,
            read_session_backup,
            search_session_backups,
            fetch_brain_feed,
            list_export_folder_filenames
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}