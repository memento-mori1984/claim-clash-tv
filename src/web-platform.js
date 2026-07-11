// Copyright (c) 2026 Arcana Veritas LLC. All rights reserved.
// Web platform shim: replaces Tauri invoke + AI CORS proxy for Claim-Clash.com.

(function () {
    'use strict';

    const AI_PROVIDER_HOSTS = [
        'generativelanguage.googleapis.com',
        'api.openai.com',
        'api.anthropic.com',
        'api.groq.com',
        'openrouter.ai',
        'api.x.ai'
    ];

    function webConfig() {
        return window.CLAIM_CLASH_WEB_CONFIG || {};
    }

    function isWebPlatform() {
        return !window.__TAURI__ && !!(webConfig().platform === 'web' || webConfig().siteUrl);
    }

    function isAiProviderUrl(url) {
        try {
            const host = new URL(url).hostname.toLowerCase();
            return AI_PROVIDER_HOSTS.some(h => host === h || host.endsWith('.' + h));
        } catch (e) {
            return false;
        }
    }

    function base64ToBytes(b64) {
        const binary = atob(String(b64 || ''));
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    }

    function triggerDownload(bytes, filename, mime) {
        const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function mimeForExtension(ext) {
        const e = String(ext || '').toLowerCase();
        if (e === 'pdf') return 'application/pdf';
        if (e === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (e === 'md') return 'text/markdown;charset=utf-8';
        return 'application/octet-stream';
    }

    async function fetchBrainFeed() {
        if (!window.ClaimClashBrainFeed || typeof window.ClaimClashBrainFeed.fetchVerifiedBrainFeed !== 'function') {
            return null;
        }
        try {
            return await window.ClaimClashBrainFeed.fetchVerifiedBrainFeed();
        } catch (e) {
            console.warn('Brain feed (web) failed', e);
            return null;
        }
    }

    async function aiFetch(url, options) {
        const cfg = webConfig();
        const useProxy = cfg.useAiProxy !== false;
        const proxyPath = String(cfg.aiProxyPath || '/api/ai').trim();

        if (!useProxy || !isAiProviderUrl(url)) {
            return fetch(url, options);
        }

        const headers = {};
        if (options && options.headers) {
            if (options.headers instanceof Headers) {
                options.headers.forEach((v, k) => { headers[k] = v; });
            } else if (typeof options.headers === 'object') {
                Object.assign(headers, options.headers);
            }
        }

        let body = options && options.body;
        if (body != null && typeof body !== 'string') {
            body = String(body);
        }

        const proxyRes = await fetch(proxyPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                url,
                method: (options && options.method) || 'GET',
                headers,
                body: body || null
            }),
            signal: options && options.signal
        });

        const proxyJson = await proxyRes.json().catch(() => ({}));
        if (!proxyRes.ok) {
            if (proxyRes.status === 401) {
                throw new Error('Your site session expired. Reload the page, accept the beta tester agreement if prompted, and log in again.');
            }
            const msg = proxyJson.error || proxyJson.message || `AI proxy error (${proxyRes.status})`;
            throw new Error(msg);
        }

        const responseHeaders = new Headers(proxyJson.headers || {});
        return new Response(proxyJson.body != null ? proxyJson.body : '', {
            status: proxyJson.status || 200,
            statusText: proxyJson.statusText || 'OK',
            headers: responseHeaders
        });
    }

    async function invoke(cmd, args) {
        args = args || {};
        switch (cmd) {
            case 'fetch_brain_feed':
                return fetchBrainFeed();

            case 'save_session_export': {
                const bytes = base64ToBytes(args.bytesBase64);
                const name = args.defaultName || 'Claim-Clash-Session.md';
                triggerDownload(bytes, name, mimeForExtension(args.extension));
                return 'browser-download';
            }

            case 'save_session_md_backup':
                return null;

            case 'ensure_claim_clash_documents_folder':
            case 'quit_app':
                return true;

            case 'list_export_folder_filenames':
            case 'list_session_backups':
            case 'search_session_backups':
                return [];

            case 'read_session_backup':
                return '';

            case 'compose_session_email_from_path':
                throw new Error('Native email is not available in the browser. Use Gmail or Outlook web compose from Export.');

            case 'start_cast':
            case 'stop_cast':
            case 'get_cast_status':
            case 'update_cast_content':
                throw new Error('Cast to TV is available in the desktop app only. Play in your browser or on a tablet at Claim-Clash.com.');

            case 'is_app_fullscreen':
                return !!document.fullscreenElement;

            case 'set_app_fullscreen': {
                const enabled = !!args.fullscreen;
                if (enabled) {
                    const el = document.documentElement;
                    if (el.requestFullscreen) await el.requestFullscreen();
                } else if (document.exitFullscreen) {
                    await document.exitFullscreen();
                }
                return true;
            }

            case 'maximize_app_window':
                return true;

            default:
                throw new Error('Unsupported web command: ' + cmd);
        }
    }

    function applyWebPlatformUi() {
        if (!isWebPlatform()) return;

        const castGroup = document.getElementById('cast-toolbar-group');
        if (castGroup) castGroup.classList.add('hidden');

        const aboutPlatform = document.getElementById('about-platform-line');
        if (aboutPlatform) aboutPlatform.classList.remove('hidden');

        const aboutDesktop = document.getElementById('about-desktop-line');
        if (aboutDesktop) aboutDesktop.classList.add('hidden');

        const aboutDesktopSecurity = document.getElementById('about-desktop-security');
        if (aboutDesktopSecurity) aboutDesktopSecurity.classList.add('hidden');

        const headerPhase = document.getElementById('header-phase');
        const setupPhase = document.getElementById('setup-phase');
        const phase = webConfig().appPhase || 'Web';
        if (headerPhase) headerPhase.textContent = phase;
        if (setupPhase) setupPhase.textContent = phase;

        document.title = 'Claim Clash — Evidence Game for Political Claims';
    }

    window.ClaimClashWeb = {
        isWebPlatform,
        invoke,
        aiFetch,
        fetchBrainFeed,
        applyWebPlatformUi
    };

    window.isWebPlatform = isWebPlatform;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyWebPlatformUi);
    } else {
        applyWebPlatformUi();
    }
})();