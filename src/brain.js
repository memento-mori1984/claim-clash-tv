// Copyright (c) 2026 Zachary H. Roberts. All rights reserved.
// The Brain: hidden background subsystem (internal name only; never shown in UI).
// Daily questions and pool updates come only from a creator-signed server feed (Rust-verified).

(function () {
    'use strict';

    const POOL_KEY = 'brainQuestionPool';
    const DAILY_QUESTION_KEY = 'brainDailyQuestion';
    const DAILY_DATE_KEY = 'brainDailyDate';
    const FEED_ISSUED_KEY = 'brainFeedIssuedAt';
    const INTEGRITY_KEY = 'brainDataIntegrity';
    const INTEGRITY_VERSION = 2;
    const INTEGRITY_SALT = 'claimClashBrainIntegrity_v2';
    const POOL_MAX = 300;
    const QUESTION_MIN_LEN = 40;
    const QUESTION_MAX_LEN = 520;

    const BRAIN_INJECTION_PATTERNS = [
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
    const FALLBACK_ORDER = ['gemini', 'groq', 'openrouter', 'grok'];

    const EXAMPLE_FLOW_BRAIN_INTERVAL = 2;

    let brainAvailable = false;
    let exampleFlowClickCount = 0;
    let exampleFlowTimelyServedThisSession = false;
    let exampleFlowStockQueue = [];
    let dailyFetchInFlight = false;
    let brainQuestionPool = [];
    let brainDailyQuestion = '';
    let brainDailyDate = '';
    let brainFeedIssuedAt = 0;
    let initialized = false;

    function todayYmd() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function stripHtml(value) {
        const tmp = document.createElement('div');
        tmp.innerHTML = String(value || '');
        return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    }

    function hasInjectionPattern(text) {
        return BRAIN_INJECTION_PATTERNS.some(pattern => pattern.test(String(text || '')));
    }

    function isValidBrainDate(date) {
        return /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''));
    }

    function sanitizeBrainQuestion(text) {
        let clean = stripHtml(text).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
        if (!clean || clean.length < QUESTION_MIN_LEN || clean.length > QUESTION_MAX_LEN) return null;
        if (hasInjectionPattern(clean)) return null;
        if (!/[?.!]/.test(clean)) clean = clean + '?';
        return clean;
    }

    function normalizePoolEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const text = sanitizeBrainQuestion(entry.text);
        if (!text) return null;
        const date = isValidBrainDate(entry.date) ? entry.date : todayYmd();
        const addedAt = Number.isFinite(entry.addedAt) ? entry.addedAt : Date.now();
        return { text, addedAt, date };
    }

    function fnv1aHash(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    function canonicalIntegrityPayload() {
        return JSON.stringify({
            v: INTEGRITY_VERSION,
            pool: brainQuestionPool.map(e => ({ text: e.text, addedAt: e.addedAt, date: e.date })),
            daily: brainDailyQuestion,
            dailyDate: brainDailyDate,
            feedIssuedAt: brainFeedIssuedAt
        });
    }

    function computeIntegrityHash() {
        return fnv1aHash(INTEGRITY_SALT + canonicalIntegrityPayload());
    }

    function persistIntegrity() {
        try {
            localStorage.setItem(INTEGRITY_KEY, computeIntegrityHash());
        } catch (e) { /* silent */ }
    }

    function clearBrainStorage() {
        brainQuestionPool = [];
        brainDailyQuestion = '';
        brainDailyDate = '';
        brainFeedIssuedAt = 0;
        try {
            localStorage.removeItem(POOL_KEY);
            localStorage.removeItem(DAILY_QUESTION_KEY);
            localStorage.removeItem(DAILY_DATE_KEY);
            localStorage.removeItem(FEED_ISSUED_KEY);
            localStorage.removeItem(INTEGRITY_KEY);
            localStorage.removeItem('brainSessionMessages');
        } catch (e) { /* silent */ }
    }

    function validatePersistedBrainData() {
        brainQuestionPool = (brainQuestionPool || []).map(normalizePoolEntry).filter(Boolean);
        while (brainQuestionPool.length > POOL_MAX) brainQuestionPool.shift();

        const daily = sanitizeBrainQuestion(brainDailyQuestion);
        brainDailyQuestion = daily || '';
        if (!isValidBrainDate(brainDailyDate)) brainDailyDate = '';
        if (!Number.isFinite(brainFeedIssuedAt) || brainFeedIssuedAt < 0) brainFeedIssuedAt = 0;
    }

    function loadPersisted() {
        let pool = [];
        let daily = '';
        let dailyDate = '';
        let feedIssuedAt = 0;
        try {
            pool = JSON.parse(localStorage.getItem(POOL_KEY) || '[]');
            if (!Array.isArray(pool)) pool = [];
        } catch (e) {
            pool = [];
        }
        daily = (localStorage.getItem(DAILY_QUESTION_KEY) || '').trim();
        dailyDate = (localStorage.getItem(DAILY_DATE_KEY) || '').trim();
        feedIssuedAt = Number(localStorage.getItem(FEED_ISSUED_KEY) || '0');

        brainQuestionPool = pool;
        brainDailyQuestion = daily;
        brainDailyDate = dailyDate;
        brainFeedIssuedAt = feedIssuedAt;

        const storedIntegrity = (localStorage.getItem(INTEGRITY_KEY) || '').trim();
        if (storedIntegrity && computeIntegrityHash() !== storedIntegrity) {
            clearBrainStorage();
            return;
        }

        validatePersistedBrainData();
        persistIntegrity();
    }

    function savePool() {
        try {
            localStorage.setItem(POOL_KEY, JSON.stringify(brainQuestionPool));
            persistIntegrity();
        } catch (e) { /* silent */ }
    }

    function saveDaily() {
        try {
            if (brainDailyQuestion) localStorage.setItem(DAILY_QUESTION_KEY, brainDailyQuestion);
            else localStorage.removeItem(DAILY_QUESTION_KEY);
            if (brainDailyDate) localStorage.setItem(DAILY_DATE_KEY, brainDailyDate);
            else localStorage.removeItem(DAILY_DATE_KEY);
            if (brainFeedIssuedAt) localStorage.setItem(FEED_ISSUED_KEY, String(brainFeedIssuedAt));
            else localStorage.removeItem(FEED_ISSUED_KEY);
            persistIntegrity();
        } catch (e) { /* silent */ }
    }

    function applySignedFeed(feed) {
        if (!feed || typeof feed !== 'object') return false;
        const daily = sanitizeBrainQuestion(feed.daily);
        if (!daily || !isValidBrainDate(feed.date)) return false;

        brainDailyQuestion = daily;
        brainDailyDate = feed.date;
        brainFeedIssuedAt = Number.isFinite(feed.issued_at) ? feed.issued_at : 0;

        const now = Date.now();
        const normalized = (Array.isArray(feed.pool) ? feed.pool : [])
            .map(entry => normalizePoolEntry({ text: entry.text, date: entry.date, addedAt: now }))
            .filter(Boolean);
        if (normalized.length) {
            brainQuestionPool = normalized.slice(-POOL_MAX);
        } else {
            brainQuestionPool = [{ text: daily, addedAt: now, date: feed.date }];
        }

        savePool();
        saveDaily();
        return true;
    }

    async function invokeBrainFeed() {
        if (!window.__TAURI__) return null;
        try {
            const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;
            if (typeof invoke !== 'function') return null;
            return await invoke('fetch_brain_feed');
        } catch (e) {
            return null;
        }
    }

    function resolveProviderId() {
        if (typeof providerIsConfigured !== 'function' || typeof grokUsesBrowserOnly !== 'function') return null;

        const tryId = (id) => {
            if (!id || !providerIsConfigured(id)) return false;
            if (id === 'grok' && grokUsesBrowserOnly()) return false;
            const keyFn = typeof getApiKeyForProvider === 'function' ? getApiKeyForProvider(id) : '';
            return !!(keyFn && String(keyFn).trim());
        };

        if (typeof primaryProviderId !== 'undefined' && tryId(primaryProviderId)) {
            return primaryProviderId;
        }
        for (const id of FALLBACK_ORDER) {
            if (tryId(id)) return id;
        }
        return null;
    }

    const SETUP_API_STATUS_META = {
        checking: {
            color: 'bg-amber-500',
            title: 'Checking whether your primary AI API is reachable…',
            label: 'Checking primary AI API connection'
        },
        available: {
            color: 'bg-emerald-500',
            title: 'Primary AI API is reachable',
            label: 'Primary AI API reachable'
        },
        unavailable: {
            color: 'bg-red-500',
            title: 'Cannot reach your primary AI API. Check the key, quota, or try another provider',
            label: 'Primary AI API not reachable'
        },
        browser: {
            color: 'bg-sky-500',
            title: 'Grok opens in your browser (no in-app API test)',
            label: 'Grok browser mode'
        }
    };

    let checkDebounceTimer = null;

    function updateStatusDot(state) {
        document.querySelectorAll('#setup-provider-list .setup-api-status-dot').forEach(el => el.remove());

        const legend = document.getElementById('setup-api-status-legend');
        const pid = typeof primaryProviderId !== 'undefined' ? primaryProviderId : null;
        if (!pid || state === 'hidden') {
            if (legend) legend.classList.add('hidden');
            brainAvailable = false;
            return;
        }

        const row = document.querySelector(`#setup-provider-list [data-provider-id="${pid}"]`);
        const label = row && row.querySelector('label');
        if (!label) return;

        if (legend) legend.classList.remove('hidden');

        const meta = SETUP_API_STATUS_META[state] || SETUP_API_STATUS_META.unavailable;
        brainAvailable = state === 'available' || state === 'browser';

        const dot = document.createElement('span');
        dot.className = 'setup-api-status-dot inline-block w-2.5 h-2.5 rounded-full ml-2 align-middle flex-shrink-0 ' + meta.color;
        dot.title = meta.title;
        dot.setAttribute('role', 'status');
        dot.setAttribute('aria-label', meta.label);
        label.appendChild(dot);
    }

    function scheduleCheckAvailability() {
        const pid = typeof primaryProviderId !== 'undefined' ? primaryProviderId : null;
        if (!pid || typeof providerIsConfigured !== 'function' || !providerIsConfigured(pid)) {
            updateStatusDot('hidden');
            return;
        }
        if (pid === 'grok' && typeof grokUsesBrowserOnly === 'function' && grokUsesBrowserOnly()) {
            updateStatusDot('browser');
            return;
        }

        updateStatusDot('checking');
        clearTimeout(checkDebounceTimer);
        checkDebounceTimer = setTimeout(() => {
            checkAvailability();
        }, 650);
    }

    function refreshSetupApiStatus() {
        scheduleCheckAvailability();
    }

    async function checkAvailability() {
        const providerId = typeof primaryProviderId !== 'undefined' ? primaryProviderId : null;
        if (!providerId || typeof providerIsConfigured !== 'function' || !providerIsConfigured(providerId)) {
            updateStatusDot('hidden');
            return false;
        }
        if (providerId === 'grok' && typeof grokUsesBrowserOnly === 'function' && grokUsesBrowserOnly()) {
            updateStatusDot('browser');
            return true;
        }

        try {
            const pingMessages = [{ role: 'user', text: 'Reply with exactly: OK' }];
            if (providerId === 'gemini' && typeof callGemini === 'function' && typeof sessionToGeminiContents === 'function') {
                const result = await callGemini(sessionToGeminiContents(pingMessages));
                if (!result.success) throw new Error(result.error || 'Gemini ping failed');
            } else if (typeof callAIProvider === 'function') {
                await callAIProvider(providerId, 'Reply with exactly: OK', pingMessages);
            } else {
                throw new Error('AI helpers unavailable');
            }
            updateStatusDot('available');
            return true;
        } catch (e) {
            updateStatusDot('unavailable');
            return false;
        }
    }

    async function fetchDailyControversy(options) {
        const force = !!(options && options.force);
        const today = todayYmd();
        if (!force && brainDailyDate === today && brainDailyQuestion) return brainDailyQuestion;
        if (dailyFetchInFlight) {
            while (dailyFetchInFlight) {
                await new Promise(resolve => setTimeout(resolve, 120));
            }
            if (brainDailyDate === today && brainDailyQuestion) return brainDailyQuestion;
            return null;
        }
        dailyFetchInFlight = true;

        try {
            const feed = await invokeBrainFeed();
            if (!feed) return null;
            if (feed.date !== today) return null;
            if (!applySignedFeed(feed)) return null;
            return brainDailyQuestion;
        } catch (e) {
            return null;
        } finally {
            dailyFetchInFlight = false;
        }
    }

    async function waitForBrainDaily(maxMs) {
        const deadline = Date.now() + (maxMs || 4500);
        while (Date.now() < deadline) {
            await fetchDailyControversy();
            const daily = sanitizeBrainQuestion(brainDailyQuestion);
            if (daily && brainDailyDate === todayYmd()) return daily;
            await new Promise(resolve => setTimeout(resolve, 350));
        }
        return null;
    }

    function updateLoadExampleHint(meta) {
        const hint = document.getElementById('load-example-hint');
        const btn = document.getElementById('load-example-btn');
        const clickNumber = meta && meta.clickNumber ? meta.clickNumber : 0;
        const usedDaily = !!(meta && meta.usedDaily);
        const timelyAvailable = !!(meta && meta.timelyAvailable);

        if (hint) {
            if (usedDaily) {
                hint.textContent = 'Click 2: loaded today\'s current events question.';
            } else if (clickNumber === EXAMPLE_FLOW_BRAIN_INTERVAL && !usedDaily) {
                hint.textContent = 'Click 2: current events question not ready yet, used a stock example.';
            } else if (!timelyAvailable) {
                hint.textContent = 'Preloaded examples only (current events question already used this session).';
            } else {
                hint.textContent = 'Rule of 2: click 1 = example; click 2 = today\'s current events question (once per session).';
            }
        }
        if (btn) {
            btn.textContent = usedDaily ? 'Load Example (current events)' : 'Load Example';
        }
    }

    function resetExampleFlowSession() {
        exampleFlowClickCount = 0;
        exampleFlowTimelyServedThisSession = false;
        exampleFlowStockQueue = [];
        updateLoadExampleHint({ clickNumber: 0, usedDaily: false, timelyAvailable: true });
    }

    function applyExampleQuestion(question) {
        const text = String(question || '').trim();
        if (!text) return;

        if (typeof window.setQuestionBoxText === 'function') {
            window.setQuestionBoxText(text);
        } else {
            const qbox = document.getElementById('question-box');
            if (qbox) {
                qbox.innerHTML = '';
                qbox.textContent = text;
            }
        }

        if (typeof window.setAnswerBoxText === 'function') {
            window.setAnswerBoxText('');
        } else {
            const abox = document.getElementById('answer-box');
            if (abox) {
                abox.innerHTML = '';
                abox.textContent = '';
            }
        }

        if (typeof currentPlayer !== 'undefined') currentPlayer = 'Team A';
        if (typeof resetPrimarySession === 'function') resetPrimarySession(false);
        if (typeof updatePlayerBadge === 'function') updatePlayerBadge();
        if (typeof scheduleCastPush === 'function') scheduleCastPush();
    }

    function staticExamplePool() {
        const pool = (typeof window !== 'undefined' && window.EXAMPLE_FLOW_QUESTIONS && window.EXAMPLE_FLOW_QUESTIONS.length)
            ? window.EXAMPLE_FLOW_QUESTIONS
            : null;
        if (pool && pool.length) return pool;
        return ['Did U.S. inflation peak above 9% year-over-year in 2022, and what did the CPI show when it began falling?'];
    }

    function shuffleStockPool(pool) {
        const copy = pool.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = copy[i];
            copy[i] = copy[j];
            copy[j] = tmp;
        }
        return copy;
    }

    function resetExampleFlowStockQueue() {
        exampleFlowStockQueue = shuffleStockPool(staticExamplePool());
    }

    function pickStockExampleQuestion() {
        if (!exampleFlowStockQueue.length) {
            resetExampleFlowStockQueue();
        }
        const question = exampleFlowStockQueue.shift();
        if (question) return question;
        const pool = staticExamplePool();
        return pool[Math.floor(Math.random() * pool.length)];
    }

    async function handleLoadExampleFlow() {
        try {
            exampleFlowClickCount++;
            const clickNumber = exampleFlowClickCount;
            let question = '';
            let usedDaily = false;
            const timelySlot = !exampleFlowTimelyServedThisSession && clickNumber === EXAMPLE_FLOW_BRAIN_INTERVAL;

            // Rule of 2 (once per session): click 1 = stock; click 2 = today's current events question; then stock only.
            if (timelySlot) {
                exampleFlowTimelyServedThisSession = true;
                let daily = sanitizeBrainQuestion(brainDailyQuestion);
                if (!daily || brainDailyDate !== todayYmd()) {
                    daily = sanitizeBrainQuestion(await fetchDailyControversy({ force: true }));
                }
                if (!daily) {
                    daily = await waitForBrainDaily(6000);
                }
                if (daily) {
                    resetExampleFlowStockQueue();
                    question = daily;
                    usedDaily = true;
                } else {
                    question = pickStockExampleQuestion();
                }
            } else {
                question = pickStockExampleQuestion();
            }

            if (!question) {
                question = staticExamplePool()[0];
            }
            updateLoadExampleHint({
                clickNumber,
                usedDaily,
                timelyAvailable: !exampleFlowTimelyServedThisSession
            });
            applyExampleQuestion(question);
        } catch (e) {
            console.warn('Load Example Flow failed', e);
            applyExampleQuestion(staticExamplePool()[0]);
        }
    }

    function init() {
        if (initialized) return;
        initialized = true;
        loadPersisted();

        const today = todayYmd();
        if (brainDailyDate !== today) {
            brainDailyQuestion = '';
            brainDailyDate = '';
            saveDaily();
        }

        scheduleCheckAvailability();
        fetchDailyControversy();
    }

    window.Brain = {
        init,
        checkAvailability,
        scheduleCheckAvailability,
        refreshSetupApiStatus,
        fetchDailyControversy,
        handleLoadExampleFlow,
        resetExampleFlowSession,
        resolveProviderId,
        updateStatusDot
    };
})();