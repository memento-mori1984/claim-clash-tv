// Developer login page for password-gated Claim-Clash.com preview.

import { betaAgreementBodyHtml, escapeHtml } from './beta-agreement.js';

/**
 * @param {string | { errorMessage?: string }} options
 */
export function loginPageHtml(options = '') {
  const opts = typeof options === 'string' ? { errorMessage: options } : (options || {});
  const errorMessage = opts.errorMessage || '';

  const errorHtml = errorMessage
    ? `<div id="error" class="error show" role="alert">${escapeHtml(errorMessage)}</div>`
    : '<div id="error" class="error" role="alert"></div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Claim Clash — Beta Tester Access</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #09090b;
      color: #e4e4e7;
      padding: 1.5rem;
    }
    .card {
      width: 100%;
      max-width: 42rem;
      background: #18181b;
      border: 1px solid #3f3f46;
      border-radius: 1.25rem;
      padding: 2rem;
      box-shadow: 0 20px 50px rgba(0,0,0,0.45);
    }
    h1 {
      margin: 0 0 0.35rem;
      font-size: 1.5rem;
      color: #fbbf24;
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
      color: #f4f4f5;
    }
    h3 {
      margin: 1rem 0 0.35rem;
      font-size: 0.95rem;
      color: #f4f4f5;
    }
    p, li {
      color: #a1a1aa;
      font-size: 0.9rem;
      line-height: 1.55;
    }
    p { margin: 0 0 1rem; }
    .lead { margin-bottom: 1rem; }
    ul {
      margin: 0 0 0.75rem;
      padding-left: 1.25rem;
    }
    label {
      display: block;
      margin-bottom: 0.4rem;
      font-size: 0.85rem;
      color: #d4d4d8;
    }
    input[type="password"], input[type="text"] {
      width: 100%;
      padding: 0.75rem 0.9rem;
      border-radius: 0.75rem;
      border: 1px solid #52525b;
      background: #09090b;
      color: #fafafa;
      font-size: 1rem;
    }
    input:focus {
      outline: 2px solid #b45309;
      outline-offset: 1px;
      border-color: #b45309;
    }
    button {
      width: 100%;
      margin-top: 1rem;
      padding: 0.8rem 1rem;
      border: none;
      border-radius: 0.75rem;
      background: #b45309;
      color: #fff;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #92400e; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error {
      margin-top: 1rem;
      padding: 0.75rem 0.9rem;
      border-radius: 0.75rem;
      background: rgba(127, 29, 29, 0.35);
      border: 1px solid #991b1b;
      color: #fecaca;
      font-size: 0.9rem;
      display: none;
    }
    .error.show { display: block; }
    .footer, .contact {
      margin-top: 1.25rem;
      font-size: 0.75rem;
      color: #71717a;
      text-align: center;
    }
    .install-block {
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid #3f3f46;
    }
    .install-block p {
      margin: 0 0 0.75rem;
      font-size: 0.85rem;
      color: #a1a1aa;
    }
    .install-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      margin-top: 0;
      padding: 0.75rem 1rem;
      border-radius: 0.75rem;
      background: #27272a;
      border: 1px solid #52525b;
      color: #e4e4e7;
      font-size: 0.95rem;
      font-weight: 600;
      text-decoration: none;
      box-sizing: border-box;
    }
    .install-btn:hover {
      background: #3f3f46;
      border-color: #71717a;
      color: #fafafa;
    }
    .install-note {
      margin-top: 0.65rem;
      font-size: 0.72rem;
      color: #71717a;
      line-height: 1.45;
      text-align: center;
    }
    .login-hint {
      margin: 0.35rem 0 0;
      font-size: 0.72rem;
      color: #71717a;
      line-height: 1.4;
    }
    .toggle-password-btn {
      width: 100%;
      margin-top: 0.5rem;
      padding: 0.55rem 1rem;
      border: 1px solid #52525b;
      border-radius: 0.75rem;
      background: #27272a;
      color: #d4d4d8;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .toggle-password-btn:hover { background: #3f3f46; }
    .agreement-scroll {
      max-height: 16rem;
      overflow-y: auto;
      padding: 1rem 1.1rem;
      border-radius: 0.85rem;
      border: 1px solid #3f3f46;
      background: #09090b;
      margin-bottom: 1rem;
    }
    .agree-label {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      font-size: 0.85rem;
      color: #d4d4d8;
      cursor: pointer;
      margin-bottom: 0.75rem;
    }
    .agree-label input {
      margin-top: 0.2rem;
      flex-shrink: 0;
    }
    .login-block {
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid #3f3f46;
    }
    .scroll-hint {
      font-size: 0.72rem;
      color: #71717a;
      margin: -0.5rem 0 0.75rem;
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Claim Clash</h1>
    <p class="lead">Private beta preview. Read the agreement, accept the terms, then enter the site password.</p>

    <h2>Beta tester agreement</h2>
    <div id="agreement-scroll" class="agreement-scroll" tabindex="0">${betaAgreementBodyHtml()}</div>
    <p id="scroll-hint" class="scroll-hint">Scroll through the full agreement to enable the checkbox.</p>

    <form id="login-form" method="POST" action="/api/auth/login" autocomplete="off">
      <label class="agree-label">
        <input id="agree-checkbox" name="agreed" type="checkbox" value="1" required disabled autocomplete="off">
        <span>I have read the beta tester agreement and agree to all terms, including confidentiality and breach remedies.</span>
      </label>

      <div class="login-block">
        <label for="password">Beta tester password</label>
        <input id="password" name="password" type="password" required minlength="8" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
        <p class="login-hint">Case-sensitive. No spaces. Paste from your invite message if typing fails.</p>
        <button id="submit-btn" type="submit" disabled>Enter Claim Clash</button>
        <button id="toggle-password" type="button" class="toggle-password-btn">Show password</button>
      </div>
    </form>

    ${errorHtml}

    <div class="install-block">
      <p>Prefer the Windows app? Download the <strong>consumer</strong> installer — no site password, no pre-filled API keys.</p>
      <a class="install-btn" id="consumer-install-btn" href="/download/Claim-Clash-Setup.exe" download="Claim-Clash-Setup.exe">
        <span aria-hidden="true">⬇</span> <span id="consumer-install-btn-label">Install on my computer (Windows)</span>
      </a>
      <p class="install-note">Official Release build — no site password, no pre-filled API keys. You add your own in the app. <a href="/download/HOW-TO-INSTALL.txt" style="color:#a1a1aa;">Install guide</a></p>
      <script>
        (function () {
          fetch('/download/manifest.json', { cache: 'no-store' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (manifest) {
              if (!manifest || !manifest.available || !manifest.primaryUrl) return;
              var btn = document.getElementById('consumer-install-btn');
              if (!btn) return;
              btn.href = manifest.primaryUrl;
              var file = manifest.primaryUrl.split('/').pop() || 'Claim-Clash-Setup.exe';
              btn.setAttribute('download', file);
              var label = document.getElementById('consumer-install-btn-label');
              if (label && manifest.kind === 'portable') {
                label.textContent = 'Download for Windows (portable app)';
              }
            })
            .catch(function () { /* keep default setup link */ });
        })();
      </script>
    </div>

    <p class="footer">Private web preview. Not indexed.</p>
  </div>
  <script>
    (function () {
      var scroll = document.getElementById('agreement-scroll');
      var cb = document.getElementById('agree-checkbox');
      var btn = document.getElementById('submit-btn');
      var hint = document.getElementById('scroll-hint');
      var password = document.getElementById('password');
      var toggle = document.getElementById('toggle-password');
      if (!scroll || !cb || !btn) return;

      var hasEngaged = false;

      function needsScroll() {
        return scroll.scrollHeight > scroll.clientHeight + 8;
      }

      function atBottom() {
        return scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 12;
      }

      function markEngaged() {
        hasEngaged = true;
        updateState();
      }

      function agreementReady() {
        if (!hasEngaged) return false;
        return needsScroll() ? atBottom() : true;
      }

      function updateState() {
        var ready = agreementReady();
        cb.disabled = !ready;
        if (!ready) cb.checked = false;
        if (hint) {
          hint.textContent = needsScroll()
            ? 'Scroll through the full agreement to enable the checkbox.'
            : 'Click inside the agreement box to confirm you have read it.';
          hint.style.display = ready ? 'none' : 'block';
        }
        btn.disabled = !cb.checked;
      }

      cb.checked = false;
      scroll.addEventListener('scroll', function () {
        if (scroll.scrollTop > 0) hasEngaged = true;
        updateState();
      }, { passive: true });
      scroll.addEventListener('click', markEngaged);
      scroll.addEventListener('wheel', markEngaged, { passive: true });
      scroll.addEventListener('touchmove', markEngaged, { passive: true });
      scroll.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'End' || e.key === ' ') markEngaged();
      });
      cb.addEventListener('change', updateState);
      updateState();

      if (toggle && password) {
        toggle.addEventListener('click', function () {
          var show = password.type === 'password';
          password.type = show ? 'text' : 'password';
          toggle.textContent = show ? 'Hide password' : 'Show password';
        });
      }
    })();
  </script>
</body>
</html>`;
}

/** @deprecated Use loginPageHtml() */
export const LOGIN_PAGE_HTML = loginPageHtml();