// Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
// "Claim Clash" is a trademark of Zachary H. Roberts.
//
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    claim_clash_tv_lib::run()
}
