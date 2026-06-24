// Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
// "Claim Clash" is a trademark of Zachary H. Roberts.
//
// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::{Arc, Mutex};
use tiny_http::{Server, Response, Header};

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct CastContent {
    pub question: String,
    pub answers: Vec<(String, String)>, // (ai_name, response)
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
            let url_path = request.url().to_string();

            if url_path == "/state" {
                let content = content.lock().unwrap();
                let json = serde_json::json!({
                    "question": content.question,
                    "answers": content.answers.iter().map(|(name, text)| {
                        serde_json::json!({ "name": name, "text": text })
                    }).collect::<Vec<_>>()
                });
                let response = Response::from_string(json.to_string())
                    .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
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
    answers: Vec<(String, String)>,
) -> Result<(), String> {
    let cast_state = state.lock().map_err(|e| e.to_string())?;
    let mut content = cast_state.content.lock().unwrap();
    content.question = question;
    content.answers = answers;
    Ok(())
}

fn get_cast_receiver_html() -> String {
    r#"<!-- Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
"Claim Clash" is a trademark of Zachary H. Roberts. -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claim Clash - Cast</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #111; color: #eee; margin: 0; padding: 40px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { font-size: 3rem; margin-bottom: 0.2em; }
        .question { font-size: 2rem; background: #222; padding: 20px; border-radius: 12px; margin-bottom: 30px; }
        .answer { background: #1a1a1a; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
        .model { font-weight: bold; color: #0af; margin-bottom: 8px; }
        .text { line-height: 1.5; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Claim Clash</h1>
        <div id="question" class="question">Loading...</div>
        <div id="answers"></div>
        <footer style="margin-top:40px;text-align:center;font-size:0.75rem;color:#666;">
            Copyright &copy; 2026 Zachary H. Roberts. All rights reserved.<br>
            &ldquo;Claim Clash&rdquo; is a trademark of Zachary H. Roberts.
        </footer>
    </div>

    <script>
        async function fetchState() {
            try {
                const res = await fetch('/state');
                const data = await res.json();
                document.getElementById('question').innerHTML = data.question || 'No question';
                
                const answersEl = document.getElementById('answers');
                answersEl.innerHTML = '';
                if (data.answers && data.answers.length > 0) {
                    data.answers.forEach(a => {
                        const div = document.createElement('div');
                        div.className = 'answer';
                        div.innerHTML = `<div class="model">${a.name}</div><div class="text">${a.text}</div>`;
                        answersEl.appendChild(div);
                    });
                } else {
                    answersEl.innerHTML = '<div class="answer">Waiting for responses...</div>';
                }
            } catch(e) {
                console.error(e);
            }
        }
        
        setInterval(fetchState, 2000);
        fetchState();
    </script>
</body>
</html>"#.to_string()
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
