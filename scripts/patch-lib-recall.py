import pathlib

p = pathlib.Path(r"C:\Windows\System32\claim-clash-tv\src-tauri\src\lib.rs")
text = p.read_text(encoding="utf-8")

insert = r'''
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
    let docs = resolve_documents_dir()?;
    Ok(docs.join("Claim Clash Sessions"))
}

fn parse_conv_topic_from_filename(filename: &str) -> (Option<u32>, String) {
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
                    snippet = body[start..end].replace('\n', ' ');
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

/// Lists Markdown session backups saved in Documents/Claim Clash Sessions/.
#[tauri::command]
fn list_session_backups() -> Result<Vec<SessionBackupMeta>, String> {
    let backup_dir = sessions_backup_dir()?;
    if !backup_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    let entries = std::fs::read_dir(&backup_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Ok(meta) = load_session_backup_meta(&path) {
            items.push(meta);
        }
    }

    items.sort_by(|a, b| {
        b.exported_at
            .cmp(&a.exported_at)
            .then(b.conv.unwrap_or(0).cmp(&a.conv.unwrap_or(0)))
    });
    Ok(items)
}

/// Reads a Markdown session backup by path (must be under Claim Clash Sessions/).
#[tauri::command]
fn read_session_backup(path: String) -> Result<String, String> {
    let backup_dir = sessions_backup_dir()?;
    let requested = std::path::PathBuf::from(path.trim());
    let canonical_base = backup_dir.canonicalize().unwrap_or(backup_dir.clone());
    let canonical_path = requested
        .canonicalize()
        .map_err(|e| format!("Invalid session path: {e}"))?;
    if !canonical_path.starts_with(&canonical_base) {
        return Err("Session path is outside Claim Clash Sessions.".into());
    }
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
    let backup_dir = sessions_backup_dir()?;
    if !backup_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut hits = Vec::new();
    let entries = std::fs::read_dir(&backup_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
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

    hits.sort_by(|a, b| b.score.cmp(&a.score).then(b.meta.exported_at.cmp(&a.meta.exported_at)));
    hits.truncate(max_hits);
    Ok(hits)
}

'''

anchor = '/// Writes a Markdown session backup to Documents/Claim Clash Sessions/.'
if insert.strip() in text:
    print('lib.rs already patched')
elif anchor not in text:
    raise SystemExit('lib.rs anchor not found')
else:
    text = text.replace(anchor, insert + anchor, 1)

handler_old = """            compose_session_email_with_attachment
        ])"""
handler_new = """            compose_session_email_with_attachment,
            list_session_backups,
            read_session_backup,
            search_session_backups
        ])"""
if handler_new not in text:
    if handler_old not in text:
        raise SystemExit('handler anchor not found')
    text = text.replace(handler_old, handler_new, 1)

p.write_text(text, encoding='utf-8')
print('lib.rs patched')
