// Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
//! Creator-signed Brain feed verification (server-side control).

use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::brain_config::{BRAIN_FEED_URL, BRAIN_VERIFY_PUBLIC_KEY_HEX};

const QUESTION_MIN_LEN: usize = 40;
const QUESTION_MAX_LEN: usize = 520;
const POOL_MAX: usize = 300;

#[derive(Debug, Deserialize)]
struct BrainFeedSigned {
    v: u32,
    date: String,
    daily: String,
    pool: Vec<BrainPoolItemRaw>,
    issued_at: u64,
    sig: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct BrainPoolItemRaw {
    text: String,
    date: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BrainPoolItem {
    pub text: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BrainFeedResponse {
    pub date: String,
    pub daily: String,
    pub pool: Vec<BrainPoolItem>,
    pub issued_at: u64,
}

fn brain_feed_configured() -> bool {
    !BRAIN_FEED_URL.trim().is_empty()
        && !BRAIN_VERIFY_PUBLIC_KEY_HEX.trim().is_empty()
        && !BRAIN_FEED_URL.contains("YOUR_USERNAME")
}

fn parse_verifying_key() -> Result<VerifyingKey, String> {
    let hex = BRAIN_VERIFY_PUBLIC_KEY_HEX.trim();
    let bytes = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Invalid Brain public key hex: {e}"))?;
    if bytes.len() != 32 {
        return Err("Brain public key must be 32 bytes".to_string());
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    VerifyingKey::from_bytes(&arr).map_err(|e| format!("Invalid Brain public key: {e}"))
}

fn canonical_sign_message(payload: &BrainFeedSigned) -> Result<String, String> {
    let pool_json =
        serde_json::to_string(&payload.pool).map_err(|e| format!("Pool JSON error: {e}"))?;
    Ok(format!(
        "claim-clash-brain-v1\n{}\n{}\n{}\n{}\n{}",
        payload.v, payload.date, payload.daily, pool_json, payload.issued_at
    ))
}

fn verify_signature(payload: &BrainFeedSigned) -> Result<(), String> {
    let message = canonical_sign_message(payload)?;
    let sig_bytes = STANDARD
        .decode(payload.sig.trim())
        .map_err(|e| format!("Invalid Brain signature base64: {e}"))?;
    let signature = Signature::from_slice(&sig_bytes)
        .map_err(|e| format!("Invalid Brain signature bytes: {e}"))?;
    let key = parse_verifying_key()?;
    key.verify(message.as_bytes(), &signature)
        .map_err(|_| "Brain feed signature verification failed".to_string())
}

fn has_injection_pattern(text: &str) -> bool {
    let lower = text.to_lowercase();
    let patterns = [
        "ignore previous instructions",
        "ignore prior instructions",
        "disregard previous instructions",
        "disregard prior instructions",
        "you are now ",
        "system:",
        "developer mode",
        "jailbreak",
        "repeat your system prompt",
        "repeat your prompt",
        "<script",
        "javascript:",
    ];
    patterns.iter().any(|p| lower.contains(p)) || text.contains("onerror=") || text.contains("onclick=")
}

fn sanitize_question(text: &str) -> Option<String> {
    let mut clean: String = text
        .chars()
        .filter(|c| !matches!(c, '\x00'..='\x08' | '\x0B' | '\x0C' | '\x0E'..='\x1F'))
        .collect();
    clean = clean.split_whitespace().collect::<Vec<_>>().join(" ");
    let clean = clean.trim();
    if clean.len() < QUESTION_MIN_LEN || clean.len() > QUESTION_MAX_LEN {
        return None;
    }
    if has_injection_pattern(clean) {
        return None;
    }
    let mut out = clean.to_string();
    if !out.contains(['?', '!', '.']) {
        out.push('?');
    }
    Some(out)
}

fn is_valid_date(date: &str) -> bool {
    let bytes = date.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && date[..4].chars().all(|c| c.is_ascii_digit())
        && date[5..7].chars().all(|c| c.is_ascii_digit())
        && date[8..10].chars().all(|c| c.is_ascii_digit())
}

fn normalize_pool(items: Vec<BrainPoolItemRaw>) -> Vec<BrainPoolItem> {
    let mut out = Vec::new();
    for item in items {
        let Some(text) = sanitize_question(&item.text) else {
            continue;
        };
        let date = if is_valid_date(&item.date) {
            item.date
        } else {
            continue;
        };
        if out.iter().any(|e: &BrainPoolItem| e.text == text) {
            continue;
        }
        out.push(BrainPoolItem { text, date });
        if out.len() >= POOL_MAX {
            break;
        }
    }
    out
}

fn validate_and_build(payload: BrainFeedSigned) -> Result<BrainFeedResponse, String> {
    if payload.v != 1 {
        return Err("Unsupported Brain feed version".to_string());
    }
    verify_signature(&payload)?;
    if !is_valid_date(&payload.date) {
        return Err("Invalid Brain feed date".to_string());
    }
    let daily = sanitize_question(&payload.daily)
        .ok_or_else(|| "Invalid Brain daily question".to_string())?;
    let pool = normalize_pool(payload.pool);
    Ok(BrainFeedResponse {
        date: payload.date,
        daily,
        pool,
        issued_at: payload.issued_at,
    })
}

pub fn fetch_verified_brain_feed() -> Result<BrainFeedResponse, String> {
    if !brain_feed_configured() {
        return Err("Brain feed not configured".to_string());
    }
    let url = BRAIN_FEED_URL.trim();
    if !url.starts_with("https://") {
        return Err("Brain feed URL must use HTTPS".to_string());
    }

    let body = ureq::get(url)
        .set("User-Agent", "ClaimClash Brain Feed")
        .call()
        .map_err(|e| format!("Brain feed fetch failed: {e}"))?
        .into_string()
        .map_err(|e| format!("Brain feed read failed: {e}"))?;

    let payload: BrainFeedSigned =
        serde_json::from_str(&body).map_err(|e| format!("Brain feed JSON invalid: {e}"))?;
    validate_and_build(payload)
}