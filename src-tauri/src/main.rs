// Copyright (c) 2026 Arcana Veritas LLC. All rights reserved.
// "Claim Clash" is a trademark of Arcana Veritas LLC.
//
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    claim_clash_tv_lib::run()
}
