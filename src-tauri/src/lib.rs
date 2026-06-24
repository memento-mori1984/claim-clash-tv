// Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
// "Claim Clash" is a trademark of Zachary H. Roberts.
//
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Response, Server};

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CastBookmark {
    pub concern: String,
    pub player: String,
}

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CastAnswer {
    pub name: String,
    pub text: String,
}

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CastContent {
    pub question: String,
    pub main_answer: String,
    pub current_player: String,
    pub answers: Vec<CastAnswer>,
    pub bookmarks: Vec<CastBookmark>,
    pub selected_ais: Vec<String>,
    pub jailbreak_mode: bool,
    pub app_version: String,
    pub rules_version: String,
    pub updated_at: u64,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Default)]
struct CastState {
    content: Arc<Mutex<CastContent>>,
    running: bool,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn start_cast(state: tauri::State<Arc<Mutex<CastState>>>) -> Result<String, String> {
    let mut cast_state = state.lock().map_err(|e| e.to_string())?;

    if cast_state.running {
        return Err("Already casting".to_string());
    }

    let local_ip = local_ip_address::local_ip().map_err(|e| e.to_string())?;

    // Bind to random port on all interfaces
    let server = Server::http("0.0.0.0:0").map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().unwrap().port();
    let url = format!("http://{}:{}", local_ip, port);

    let content = cast_state.content.clone();

    // Run HTTP server in a background thread
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let url_path = request.url().split('?').next().unwrap_or("/").to_string();

            if url_path == "/state" {
                let content = content.lock().unwrap();
                let json = serde_json::json!({
                    "question": content.question,
                    "main_answer": content.main_answer,
                    "current_player": content.current_player,
                    "answers": content.answers,
                    "bookmarks": content.bookmarks,
                    "selected_ais": content.selected_ais,
                    "jailbreak_mode": content.jailbreak_mode,
                    "app_version": content.app_version,
                    "rules_version": content.rules_version,
                    "updated_at": content.updated_at,
                });
                let response = Response::from_string(json.to_string())
                    .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
                    .with_header(Header::from_bytes("Cache-Control", "no-store, no-cache, must-revalidate").unwrap())
                    .with_header(Header::from_bytes("Pragma", "no-cache").unwrap())
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

    Ok(url)
}

#[tauri::command]
fn stop_cast(state: tauri::State<Arc<Mutex<CastState>>>) -> Result<(), String> {
    let mut cast_state = state.lock().map_err(|e| e.to_string())?;
    cast_state.running = false;
    // Clear content so the cast page shows nothing useful.
    let mut content = cast_state.content.lock().unwrap();
    *content = CastContent::default();
    Ok(())
}

#[tauri::command]
fn update_cast_content(
    state: tauri::State<Arc<Mutex<CastState>>>,
    question: String,
    main_answer: String,
    current_player: String,
    answers: Vec<CastAnswer>,
    bookmarks: Vec<CastBookmark>,
    selected_ais: Vec<String>,
    jailbreak_mode: bool,
    app_version: String,
    rules_version: String,
) -> Result<(), String> {
    let cast_state = state.lock().map_err(|e| e.to_string())?;
    let mut content = cast_state.content.lock().unwrap();
    content.question = question;
    content.main_answer = main_answer;
    content.current_player = current_player;
    content.answers = answers;
    content.bookmarks = bookmarks;
    content.selected_ais = selected_ais;
    content.jailbreak_mode = jailbreak_mode;
    content.app_version = app_version;
    content.rules_version = rules_version;
    content.updated_at = now_secs();
    Ok(())
}

fn get_cast_receiver_html() -> String {
    include_str!("../../src/cast-mirror.html").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cast_state = Arc::new(Mutex::new(CastState {
        content: Arc::new(Mutex::new(CastContent::default())),
        running: false,
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(cast_state)
        .invoke_handler(tauri::generate_handler![greet, start_cast, stop_cast, update_cast_content])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
