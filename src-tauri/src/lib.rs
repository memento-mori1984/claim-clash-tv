// Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
// "Claim Clash" is a trademark of Zachary H. Roberts.
//
//! Claim Clash Tauri backend: local HTTP server for Smart TV casting.
//!
//! The desktop app pushes live game state via [`update_cast_content`]. A TV browser
//! opens the URL returned by [`start_cast`] and polls `/state` for JSON updates.
//! The mirror page HTML is embedded from `src/cast-mirror.html` via [`get_cast_receiver_html`].

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
}

/// Status returned to the frontend for the cast button indicator dot.
#[derive(serde::Serialize)]
pub struct CastStatus {
    pub running: bool,
    pub tv_connected: bool,
    pub url: String,
    pub ip: String,
    pub port: u16,
}

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
    tv_connected: Arc<Mutex<bool>>,
    cast_url: String,
    cast_ip: String,
    cast_port: u16,
}

impl Default for CastState {
    fn default() -> Self {
        Self {
            content: Arc::new(Mutex::new(CastContent::default())),
            running: false,
            tv_connected: Arc::new(Mutex::new(false)),
            cast_url: String::new(),
            cast_ip: String::new(),
            cast_port: 0,
        }
    }
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

    // Bind to random port on all interfaces
    let server = Server::http("0.0.0.0:0").map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().unwrap().port();
    let url = format!("http://{}:{}", ip, port);

    cast_state.cast_url = url.clone();
    cast_state.cast_ip = ip.clone();
    cast_state.cast_port = port;
    *cast_state.tv_connected.lock().map_err(|e| e.to_string())? = false;

    let content = cast_state.content.clone();
    let tv_connected = cast_state.tv_connected.clone();
    let qr_url = url.clone();

    // Run HTTP server in a background thread
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let url_path = request.url().split('?').next().unwrap_or("/").to_string();

            if url_path == "/" || url_path == "/index.html" || url_path == "/state" {
                if let Ok(mut seen) = tv_connected.lock() {
                    *seen = true;
                }
            }

            if url_path == "/state" {
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
                    .with_header(Header::from_bytes("Pragma", "no-cache").unwrap())
                    .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap());
                let _ = request.respond(response);
            } else if url_path == "/qr.png" {
                let bytes = generate_qr_png(&qr_url).unwrap_or_default();
                let response = Response::from_data(bytes)
                    .with_header(Header::from_bytes("Content-Type", "image/png").unwrap())
                    .with_header(Header::from_bytes("Cache-Control", "no-store, no-cache, must-revalidate").unwrap())
                    .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap());
                let _ = request.respond(response);
            } else if url_path == "/claimsclash.png" {
                let bytes = include_bytes!("../../src/claimsclash.png");
                let response = Response::from_data(bytes.to_vec())
                    .with_header(Header::from_bytes("Content-Type", "image/png").unwrap())
                    .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap());
                let _ = request.respond(response);
            } else {
                let html = get_cast_receiver_html();
                let response = Response::from_string(html)
                    .with_header(Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap())
                    .with_header(Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap());
                let _ = request.respond(response);
            }
        }
    });

    cast_state.running = true;

    Ok(CastStartResponse { url, ip, port })
}

/// Stops casting, clears synced content, and resets the TV-connected flag.
#[tauri::command]
fn stop_cast(state: tauri::State<Arc<Mutex<CastState>>>) -> Result<(), String> {
    let mut cast_state = state.lock().map_err(|e| e.to_string())?;
    cast_state.running = false;
    cast_state.cast_url.clear();
    cast_state.cast_ip.clear();
    cast_state.cast_port = 0;
    if let Ok(mut seen) = cast_state.tv_connected.lock() {
        *seen = false;
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
    let tv_connected = cast_state.tv_connected.lock().map_err(|e| e.to_string())?;
    Ok(CastStatus {
        running: cast_state.running,
        tv_connected: *tv_connected,
        url: cast_state.cast_url.clone(),
        ip: cast_state.cast_ip.clone(),
        port: cast_state.cast_port,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cast_state = Arc::new(Mutex::new(CastState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(cast_state)
        .invoke_handler(tauri::generate_handler![greet, start_cast, stop_cast, get_cast_status, update_cast_content])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}