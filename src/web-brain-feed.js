// Copyright (c) 2026 Arcana Veritas LLC. All rights reserved.
// Browser Brain feed fetch + Ed25519 verify (ports brain_feed.rs for static web).

(function () {
    'use strict';

    const QUESTION_MIN_LEN = 40;
    const QUESTION_MAX_LEN = 520;
    const POOL_MAX = 300;

    const INJECTION_PATTERNS = [
        /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
        /disregard\s+(all\s+)?(previous|prior)\s+instructions/i,
        /you\s+are\s+now\s+/i,
        /^system\s*:/i,
        /developer\s+mode/i,
        /jailbreak/i,
        /repeat\s+your\s+(system\s+)?prompt/i,
        /<\s*script/i,
        /javascript\s*:/i,
        /on\w+\s*=/i
    ];

    function config() {
        return window.CLAIM_CLASH_WEB_CONFIG || {};
    }

    function hexToBytes(hex) {
        const clean = String(hex || '').trim();
        if (clean.length !== 64) throw new Error('Brain public key must be 32 bytes hex');
        const out = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    function base64ToBytes(b64) {
        const binary = atob(String(b64 || '').trim());
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    }

    function isValidDate(date) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''));
    }

    function hasInjectionPattern(text) {
        return INJECTION_PATTERNS.some(pattern => pattern.test(String(text || '')));
    }

    function sanitizeQuestion(text) {
        let clean = String(text || '')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!clean || clean.length < QUESTION_MIN_LEN || clean.length > QUESTION_MAX_LEN) return null;
        if (hasInjectionPattern(clean)) return null;
        if (!/[?.!]/.test(clean)) clean += '?';
        return clean;
    }

    function canonicalSignMessage(payload) {
        const poolJson = JSON.stringify(payload.pool || []);
        return [
            'claim-clash-brain-v1',
            String(payload.v),
            payload.date,
            payload.daily,
            poolJson,
            String(payload.issued_at)
        ].join('\n');
    }

    async function verifySignature(payload, publicKeyHex) {
        if (!crypto.subtle || !crypto.subtle.verify) {
            throw new Error('This browser cannot verify Brain feed signatures (Web Crypto Ed25519 required).');
        }
        const keyBytes = hexToBytes(publicKeyHex);
        const sigBytes = base64ToBytes(payload.sig);
        const message = new TextEncoder().encode(canonicalSignMessage(payload));
        const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'Ed25519' }, false, ['verify']);
        const ok = await crypto.subtle.verify('Ed25519', key, sigBytes, message);
        if (!ok) throw new Error('Brain feed signature verification failed');
    }

    function normalizePool(items) {
        const out = [];
        for (const item of Array.isArray(items) ? items : []) {
            const text = sanitizeQuestion(item && item.text);
            const date = item && isValidDate(item.date) ? item.date : null;
            if (!text || !date) continue;
            if (out.some(entry => entry.text === text)) continue;
            out.push({ text, date });
            if (out.length >= POOL_MAX) break;
        }
        return out;
    }

    function resolveFeedUrl(raw) {
        const configured = String(raw || '').trim();
        if (!configured) return '';
        if (configured.startsWith('/')) {
            return new URL(configured, window.location.origin).href;
        }
        return configured;
    }

    async function fetchVerifiedBrainFeed() {
        const cfg = config();
        const feedUrl = resolveFeedUrl(cfg.brainFeedUrl);
        const publicKeyHex = String(cfg.brainVerifyPublicKeyHex || '').trim();
        if (!feedUrl || !publicKeyHex || feedUrl.includes('YOUR_USERNAME')) {
            throw new Error('Brain feed not configured');
        }
        if (!feedUrl.startsWith('https://')) {
            throw new Error('Brain feed URL must use HTTPS');
        }

        const cacheBust = Math.floor(Date.now() / 1000);
        const url = feedUrl.includes('?') ? `${feedUrl}&cc=${cacheBust}` : `${feedUrl}?cc=${cacheBust}`;
        const res = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`Brain feed fetch failed (${res.status})`);
        const contentType = String(res.headers.get('Content-Type') || '').toLowerCase();
        if (contentType.includes('text/html')) {
            throw new Error('Brain feed returned HTML instead of JSON (check login or feed URL host)');
        }
        const payload = await res.json();
        if (payload.v !== 1) throw new Error('Unsupported Brain feed version');
        await verifySignature(payload, publicKeyHex);
        if (!isValidDate(payload.date)) throw new Error('Invalid Brain feed date');

        const daily = sanitizeQuestion(payload.daily);
        if (!daily) throw new Error('Invalid Brain daily question');

        return {
            date: payload.date,
            daily,
            pool: normalizePool(payload.pool),
            issued_at: Number(payload.issued_at) || 0
        };
    }

    window.ClaimClashBrainFeed = {
        fetchVerifiedBrainFeed
    };
})();