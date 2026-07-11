// Copyright (c) 2026 Arcana Veritas LLC. All rights reserved.
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
    let exampleFlowUseBlendedPool = false;
    let exampleFlowStockQueue = [];
    let lastLoadedExampleQuestion = '';
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
        purgeRetiredBrainPoolEntries();
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

    function mergeFeedPool(feed) {
        if (!feed || typeof feed !== 'object') return false;
        const daily = sanitizeBrainQuestion(feed.daily);
        if (!daily || !isValidBrainDate(feed.date)) return false;

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
        return true;
    }

    function applySignedFeed(feed) {
        if (!mergeFeedPool(feed)) return false;

        const daily = sanitizeBrainQuestion(feed.daily);
        brainDailyQuestion = daily;
        brainDailyDate = feed.date;
        brainFeedIssuedAt = Number.isFinite(feed.issued_at) ? feed.issued_at : 0;
        saveDaily();
        return true;
    }

    async function invokeBrainFeed() {
        if (window.ClaimClashWeb && typeof window.ClaimClashWeb.fetchBrainFeed === 'function') {
            return await window.ClaimClashWeb.fetchBrainFeed();
        }
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
            if (id === 'supergrok') return false;
            if (id === 'grok' && typeof grokUsesBrowserOnly === 'function' && grokUsesBrowserOnly()) return false;
            const key = typeof getApiKeyForProvider === 'function' ? getApiKeyForProvider(id) : '';
            return !!(key && String(key).trim());
        };

        if (typeof primaryProviderId !== 'undefined' && tryId(primaryProviderId)) {
            return primaryProviderId;
        }
        for (const id of FALLBACK_ORDER) {
            if (tryId(id)) return id;
        }
        return null;
    }

    const NETWORK_UNAVAILABLE_MSG =
        'No internet connection. Claim Clash needs internet to reach AI services. Check your Wi-Fi or Ethernet, then try again.';

    const REQUEST_TIMEOUT_MSG =
        'Request timed out. The AI took too long to respond. Try again or switch to another provider.';

    const CONNECTIVITY_PROBE_URL = 'https://connectivitycheck.gstatic.com/generate_204';
    const CONNECTIVITY_PROBE_TIMEOUT_MS = 4500;
    const CONNECTIVITY_POLL_MS = 12000;

    let internetReachable = null;
    let connectivityProbeInFlight = null;
    let connectivityMonitorStarted = false;
    let connectivityPollTimer = null;

    function isNavigatorOffline() {
        return typeof navigator !== 'undefined' && navigator.onLine === false;
    }

    function normalizeErrorText(err) {
        return String(err && err.message !== undefined ? err.message : err).trim();
    }

    function isTimeoutError(err) {
        const name = String(err && err.name ? err.name : '').toLowerCase();
        if (name === 'aborterror') return true;
        const msg = normalizeErrorText(err).toLowerCase();
        return msg.includes('timed out') || msg.includes('took too long to respond');
    }

    function isDeviceOrProbeOffline() {
        if (isNavigatorOffline()) return true;
        return internetReachable === false;
    }

    function isOfflineOrNetworkError(err) {
        if (isDeviceOrProbeOffline()) return true;
        if (isTimeoutError(err)) return false;
        const msg = normalizeErrorText(err).toLowerCase();
        return (
            msg.includes('err_internet_disconnected') ||
            msg.includes('the internet connection appears to be offline') ||
            (msg.includes('no internet connection') && msg.includes('claim clash needs internet'))
        );
    }

    async function probeInternetReachable(timeoutMs) {
        if (isNavigatorOffline()) return false;
        const ms = timeoutMs || CONNECTIVITY_PROBE_TIMEOUT_MS;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try {
            await fetch(CONNECTIVITY_PROBE_URL, {
                method: 'GET',
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timer);
            return true;
        } catch (e) {
            clearTimeout(timer);
            return false;
        }
    }

    function setInternetReachable(reachable) {
        internetReachable = !!reachable;
        updateOfflineBanner();
    }

    function updateOfflineBanner() {
        const offline = isNavigatorOffline() || internetReachable === false;
        const banner = document.getElementById('offline-banner');
        if (banner) banner.classList.toggle('hidden', !offline);
        if (document.body) document.body.classList.toggle('offline-banner-visible', offline);
    }

    async function refreshInternetReachable(forceProbe) {
        if (isNavigatorOffline()) {
            setInternetReachable(false);
            return false;
        }
        if (!forceProbe && internetReachable === true) return true;
        if (!forceProbe && internetReachable === false) return false;

        if (!connectivityProbeInFlight) {
            connectivityProbeInFlight = probeInternetReachable().then(ok => {
                setInternetReachable(ok);
                return ok;
            }).finally(() => {
                connectivityProbeInFlight = null;
            });
        }
        return connectivityProbeInFlight;
    }

    async function assertInternetAvailable() {
        if (isNavigatorOffline()) {
            setInternetReachable(false);
            throw new Error(NETWORK_UNAVAILABLE_MSG);
        }
        if (internetReachable === false) {
            throw new Error(NETWORK_UNAVAILABLE_MSG);
        }
        const ok = await refreshInternetReachable(internetReachable !== true);
        if (!ok) throw new Error(NETWORK_UNAVAILABLE_MSG);
        return true;
    }

    function handleBrowserOffline() {
        setInternetReachable(false);
        const pid = typeof primaryProviderId !== 'undefined' ? primaryProviderId : null;
        if (pid && typeof providerIsConfigured === 'function' && providerIsConfigured(pid) && pid !== 'supergrok') {
            updateStatusDot('offline');
        }
    }

    function handleBrowserOnline() {
        internetReachable = null;
        updateOfflineBanner();
        void refreshInternetReachable(true).then(() => {
            scheduleCheckAvailability();
            const today = todayYmd();
            if (!isTodayDailyReady()) {
                ruleOfTwoDailyReady = false;
                dailyPrefetchPromise = null;
                void prepareRuleOfTwoDaily();
            }
        });
    }

    function startConnectivityMonitor() {
        if (connectivityMonitorStarted) return;
        connectivityMonitorStarted = true;

        window.addEventListener('offline', handleBrowserOffline);
        window.addEventListener('online', handleBrowserOnline);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void refreshInternetReachable(true);
        });

        void refreshInternetReachable(true);
        connectivityPollTimer = setInterval(() => {
            void refreshInternetReachable(true);
        }, CONNECTIVITY_POLL_MS);
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
        offline: {
            color: 'bg-red-500',
            title: NETWORK_UNAVAILABLE_MSG,
            label: 'No internet connection'
        },
        unavailable: {
            color: 'bg-red-500',
            title: 'Cannot reach your primary AI API. Check the key, quota, or try another provider',
            label: 'Primary AI API not reachable'
        },
        browser: {
            color: 'bg-sky-500',
            title: 'SuperGrok opens in your browser (no in-app API test)',
            label: 'SuperGrok browser mode'
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
        if (pid === 'supergrok') {
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
        if (providerId === 'supergrok') {
            updateStatusDot('browser');
            return true;
        }

        if (isNavigatorOffline()) {
            setInternetReachable(false);
            updateStatusDot('offline');
            return false;
        }

        const reachable = await refreshInternetReachable(internetReachable !== true);
        if (!reachable) {
            updateStatusDot('offline');
            return false;
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
            updateStatusDot(isDeviceOrProbeOffline() ? 'offline' : 'unavailable');
            return false;
        }
    }

    function isCachedDailyCurrent(today) {
        const daily = sanitizeBrainQuestion(brainDailyQuestion);
        return !!(daily && brainDailyDate === today && brainFeedIssuedAt > 0);
    }

    function shouldReplaceCachedDaily(feed, today) {
        if (!feed || feed.date !== today) return false;
        const serverIssued = Number.isFinite(feed.issued_at) ? feed.issued_at : 0;
        const serverDaily = sanitizeBrainQuestion(feed.daily);
        const cachedDaily = sanitizeBrainQuestion(brainDailyQuestion);
        if (!isCachedDailyCurrent(today)) return true;
        if (serverDaily && cachedDaily && serverDaily !== cachedDaily) return true;
        if (serverIssued > 0 && brainFeedIssuedAt <= 0) return true;
        return serverIssued > brainFeedIssuedAt;
    }

    function purgeRetiredBrainPoolEntries() {
        const retired = [
            /park squirrels to wear tiny, reflective safety helmets/i,
            /allowed which state to require age verification/i,
            /which state to require age verification for mobile apps/i,
            /^did microsoft today announce companywide cuts/i,
            /^today, the supreme court allowed which state/i
        ];
        const before = brainQuestionPool.length;
        brainQuestionPool = (brainQuestionPool || []).filter(entry => {
            const text = String(entry && entry.text ? entry.text : '');
            return !retired.some(pattern => pattern.test(text));
        });
        if (brainQuestionPool.length !== before) savePool();
        const cachedDaily = sanitizeBrainQuestion(brainDailyQuestion);
        if (cachedDaily && retired.some(pattern => pattern.test(cachedDaily))) {
            brainDailyQuestion = '';
            brainDailyDate = '';
            brainFeedIssuedAt = 0;
            ruleOfTwoDailyReady = false;
            saveDaily();
        }
    }

    async function fetchDailyControversy(options) {
        const force = !!(options && options.force);
        const today = todayYmd();
        if (dailyFetchInFlight) {
            while (dailyFetchInFlight) {
                await new Promise(resolve => setTimeout(resolve, 120));
            }
            if (isCachedDailyCurrent(today)) return brainDailyQuestion;
            return null;
        }
        dailyFetchInFlight = true;

        try {
            const feed = await invokeBrainFeed();
            if (!feed) {
                setDailyFetchStatus('feed-unavailable');
                return null;
            }
            if (feed.date !== today) {
                mergeFeedPool(feed);
                setDailyFetchStatus(`feed-stale:${feed.date}`);
                return null;
            }
            if (!force && isCachedDailyCurrent(today) && !shouldReplaceCachedDaily(feed, today)) {
                setDailyFetchStatus('ready');
                return brainDailyQuestion;
            }
            if (!applySignedFeed(feed)) {
                setDailyFetchStatus('feed-invalid');
                return null;
            }
            setDailyFetchStatus('ready');
            return brainDailyQuestion;
        } catch (e) {
            setDailyFetchStatus('feed-error');
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

        const blendedActive = !!(meta && meta.blendedActive);
        const archivedCount = Number(meta && meta.archivedCount) || 0;

        const usedArchived = !!(meta && meta.usedArchived);

        if (hint) {
            if (usedDaily) {
                hint.textContent = 'Click 2: today\'s current events question. Next clicks shuffle stock examples with past current events.';
            } else if (usedArchived && clickNumber === EXAMPLE_FLOW_BRAIN_INTERVAL) {
                hint.textContent = 'Click 2: latest current events question from the feed. Next clicks shuffle stock examples with past current events.';
            } else if (usedArchived) {
                hint.textContent = 'Past current events question from the feed.';
            } else if (clickNumber === EXAMPLE_FLOW_BRAIN_INTERVAL) {
                hint.textContent = 'Click 2: today\'s current events question (loading if not shown yet).';
            } else if (blendedActive && archivedCount > 0) {
                hint.textContent = 'Stock examples and past current events questions (shuffled).';
            } else if (!timelyAvailable && blendedActive) {
                hint.textContent = 'Preloaded stock examples (past current events will appear as the feed pool grows).';
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

    function pickRandomAvoidingRepeat(pool) {
        const list = (pool || []).filter(Boolean);
        if (!list.length) return '';
        if (list.length === 1) return list[0];
        let pick = list[Math.floor(Math.random() * list.length)];
        let attempts = 0;
        while (pick === lastLoadedExampleQuestion && attempts < 10) {
            pick = list[Math.floor(Math.random() * list.length)];
            attempts++;
        }
        return pick;
    }

    function resetExampleFlowSession() {
        exampleFlowClickCount = 0;
        exampleFlowTimelyServedThisSession = false;
        exampleFlowUseBlendedPool = false;
        exampleFlowStockQueue = [];
        updateLoadExampleHint({ clickNumber: 0, usedDaily: false, timelyAvailable: true, blendedActive: false, archivedCount: 0 });
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

    function archivedCurrentEventsPool() {
        const today = todayYmd();
        const dailyToday = (brainDailyDate === today) ? sanitizeBrainQuestion(brainDailyQuestion) : null;
        const seen = new Set();
        const archived = [];

        (brainQuestionPool || []).forEach(entry => {
            const text = sanitizeBrainQuestion(entry && entry.text);
            if (!text) return;
            if (dailyToday && text === dailyToday) return;
            const key = text.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            archived.push(text);
        });

        return archived;
    }

    function blendedExamplePool() {
        const staticPool = staticExamplePool();
        const archived = archivedCurrentEventsPool();
        if (!archived.length) return staticPool;

        const seen = new Set();
        const merged = [];
        staticPool.forEach(question => {
            const key = String(question || '').trim().toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(String(question).trim());
        });
        archived.forEach(question => {
            const key = String(question || '').trim().toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            merged.push(String(question).trim());
        });
        return merged.length ? merged : staticPool;
    }

    function activeExamplePool() {
        return exampleFlowUseBlendedPool ? blendedExamplePool() : staticExamplePool();
    }

    function resetExampleFlowStockQueue() {
        exampleFlowStockQueue = shuffleStockPool(activeExamplePool());
    }

    function pickStockExampleQuestion() {
        if (!exampleFlowStockQueue.length) {
            resetExampleFlowStockQueue();
        }
        let question = exampleFlowStockQueue.shift() || '';
        if (question && question === lastLoadedExampleQuestion && exampleFlowStockQueue.length) {
            exampleFlowStockQueue.push(question);
            question = exampleFlowStockQueue.shift() || question;
        }
        if (!question) {
            question = pickRandomAvoidingRepeat(activeExamplePool());
        }
        return question;
    }

    function rememberLoadedExampleQuestion(question) {
        lastLoadedExampleQuestion = String(question || '').trim();
    }

    function pickLatestCurrentEventsFromPool() {
        const today = todayYmd();
        const entries = (brainQuestionPool || [])
            .map(normalizePoolEntry)
            .filter(Boolean)
            .sort((a, b) => b.date.localeCompare(a.date) || (Number(b.addedAt) - Number(a.addedAt)));
        if (!entries.length) return '';
        const todayEntry = entries.find(entry => entry.date === today);
        if (todayEntry) return todayEntry.text;
        return entries[0].text;
    }

    async function resolveTimelyExampleQuestion() {
        await fetchDailyControversy({ force: true });
        const today = todayYmd();
        let daily = sanitizeBrainQuestion(brainDailyQuestion);
        if (daily && brainDailyDate === today) {
            return { question: daily, usedDaily: true, usedArchived: false };
        }

        if (!daily) {
            daily = sanitizeBrainQuestion(await ensureRuleOfTwoDailyReady());
        }
        if (!daily) {
            daily = sanitizeBrainQuestion(await waitForBrainDaily(15000));
        }
        if (daily && brainDailyDate === today) {
            return { question: daily, usedDaily: true, usedArchived: false };
        }

        const archived = sanitizeBrainQuestion(pickLatestCurrentEventsFromPool());
        if (archived) {
            return { question: archived, usedDaily: false, usedArchived: true };
        }
        return null;
    }

    function publishExampleFlowState(meta) {
        updateLoadExampleHint({
            clickNumber: meta.clickNumber,
            usedDaily: !!meta.usedDaily,
            usedArchived: !!meta.usedArchived,
            timelyAvailable: !exampleFlowTimelyServedThisSession,
            blendedActive: exampleFlowUseBlendedPool,
            archivedCount: archivedCurrentEventsPool().length
        });
    }

    function markTimelyExampleServed(resolved) {
        exampleFlowTimelyServedThisSession = true;
        exampleFlowUseBlendedPool = true;
        resetExampleFlowStockQueue();
        return {
            question: resolved.question,
            usedDaily: !!resolved.usedDaily,
            usedArchived: !!resolved.usedArchived
        };
    }

    async function handleLoadExampleFlow() {
        const clickNumber = exampleFlowClickCount + 1;
        const timelySlot = !exampleFlowTimelyServedThisSession && clickNumber === EXAMPLE_FLOW_BRAIN_INTERVAL;

        try {
            let question = '';
            let usedDaily = false;
            let usedArchived = false;

            // Rule of 2 (once per app session): click 1 = stock; click 2 = today's current events; click 3+ = stock + past current events (shuffled).
            if (timelySlot) {
                const resolved = await resolveTimelyExampleQuestion();
                if (!resolved || !resolved.question) {
                    throw new Error('Rule-of-2 daily question is not ready');
                }
                const served = markTimelyExampleServed(resolved);
                question = served.question;
                usedDaily = served.usedDaily;
                usedArchived = served.usedArchived;
            } else {
                exampleFlowClickCount = clickNumber;
                question = pickStockExampleQuestion();
            }

            if (!question) {
                question = activeExamplePool()[0] || staticExamplePool()[0];
            }

            if (timelySlot) {
                exampleFlowClickCount = clickNumber;
            }

            rememberLoadedExampleQuestion(question);
            publishExampleFlowState({ clickNumber, usedDaily, usedArchived });
            applyExampleQuestion(question);
        } catch (e) {
            console.warn('Load Example Flow failed', e);

            if (timelySlot) {
                const archived = sanitizeBrainQuestion(pickLatestCurrentEventsFromPool());
                if (archived) {
                    exampleFlowClickCount = clickNumber;
                    const served = markTimelyExampleServed({ question: archived, usedDaily: false, usedArchived: true });
                    rememberLoadedExampleQuestion(served.question);
                    publishExampleFlowState({
                        clickNumber,
                        usedDaily: served.usedDaily,
                        usedArchived: served.usedArchived
                    });
                    applyExampleQuestion(served.question);
                    return;
                }

                // Click 2 failed before any current-events question loaded — keep the slot open.
                publishExampleFlowState({
                    clickNumber: Math.max(0, clickNumber - 1),
                    usedDaily: false,
                    usedArchived: false
                });
                const hint = document.getElementById('load-example-hint');
                if (hint) {
                    hint.textContent = 'Could not load today\'s current events question yet. Check your connection, then click Load Example again for click 2.';
                }
                return;
            }

            exampleFlowClickCount = clickNumber;
            const fallback = pickStockExampleQuestion() || staticExamplePool()[0];
            rememberLoadedExampleQuestion(fallback);
            publishExampleFlowState({ clickNumber, usedDaily: false, usedArchived: false });
            applyExampleQuestion(fallback);
        }
    }

    let securityBootstrapped = false;
    let dailyPrefetchStarted = false;
    let dailyPrefetchPromise = null;
    let ruleOfTwoDailyReady = false;
    let dailyFeedSyncedThisSession = false;
    let lastDailyFetchStatus = 'starting';
    const ruleOfTwoReadyListeners = [];

    function setDailyFetchStatus(status) {
        lastDailyFetchStatus = String(status || '').trim() || 'unknown';
        if (typeof window.updateSetupStartState === 'function') {
            window.updateSetupStartState();
        }
    }

    function getRuleOfTwoDailyStatus() {
        return lastDailyFetchStatus;
    }

    function isTodayDailyReady() {
        const daily = sanitizeBrainQuestion(brainDailyQuestion);
        return !!(daily && brainDailyDate === todayYmd());
    }

    function notifyRuleOfTwoReady() {
        if (!isTodayDailyReady()) return;
        dailyFeedSyncedThisSession = true;
        ruleOfTwoDailyReady = true;
        const listeners = ruleOfTwoReadyListeners.splice(0, ruleOfTwoReadyListeners.length);
        listeners.forEach(fn => {
            try { fn(); } catch (e) { /* silent */ }
        });
        if (typeof window.updateSetupStartState === 'function') {
            window.updateSetupStartState();
        }
    }

    function onRuleOfTwoDailyReady(listener) {
        if (typeof listener !== 'function') return;
        if (ruleOfTwoDailyReady && isTodayDailyReady()) {
            try { listener(); } catch (e) { /* silent */ }
            return;
        }
        ruleOfTwoReadyListeners.push(listener);
    }

    function isRuleOfTwoDailyReady() {
        return ruleOfTwoDailyReady && isTodayDailyReady();
    }

    /** Integrity check + persisted Brain data validation (runs before setup UI is ready). */
    function runSecurityBootstrap() {
        if (securityBootstrapped) return;
        securityBootstrapped = true;
        loadPersisted();

        const today = todayYmd();
        if (brainDailyDate !== today) {
            brainDailyQuestion = '';
            brainDailyDate = '';
            brainFeedIssuedAt = 0;
            ruleOfTwoDailyReady = false;
            saveDaily();
        } else if (!brainFeedIssuedAt) {
            ruleOfTwoDailyReady = false;
        }
        dailyFeedSyncedThisSession = false;
        ruleOfTwoDailyReady = false;
    }

    const RULE_OF_TWO_PREFETCH_MAX_ATTEMPTS = 8;
    const RULE_OF_TWO_BACKGROUND_RETRY_MS = 90000;

    function scheduleRuleOfTwoBackgroundRetry() {
        if (isTodayDailyReady()) return;
        setTimeout(() => {
            if (isTodayDailyReady()) return;
            dailyPrefetchPromise = null;
            void prepareRuleOfTwoDaily({ background: true });
        }, RULE_OF_TWO_BACKGROUND_RETRY_MS);
    }

    /**
     * Prefetch today's Rule-of-2 question on setup. Retries with backoff; does not block setup forever.
     */
    function prepareRuleOfTwoDaily(options) {
        const background = !!(options && options.background);
        if (isRuleOfTwoDailyReady() && dailyFeedSyncedThisSession) {
            return Promise.resolve(brainDailyQuestion);
        }
        if (dailyPrefetchPromise) return dailyPrefetchPromise;

        dailyPrefetchStarted = true;
        setDailyFetchStatus('loading');
        dailyPrefetchPromise = (async () => {
            let attempt = 0;
            while (attempt < RULE_OF_TWO_PREFETCH_MAX_ATTEMPTS) {
                if (isTodayDailyReady()) {
                    notifyRuleOfTwoReady();
                    return brainDailyQuestion;
                }

                if (isNavigatorOffline()) {
                    setDailyFetchStatus('offline');
                } else {
                    await refreshInternetReachable(internetReachable !== true);
                    if (internetReachable === false) {
                        setDailyFetchStatus('offline');
                    } else {
                        setDailyFetchStatus(attempt === 0 ? 'loading' : `retry-${attempt}`);
                        const daily = await fetchDailyControversy({ force: true });
                        if (daily && isTodayDailyReady()) {
                            notifyRuleOfTwoReady();
                            return daily;
                        }
                    }
                }

                attempt += 1;
                const delay = Math.min(350 + attempt * 250, 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            if (!isTodayDailyReady()) {
                scheduleRuleOfTwoBackgroundRetry();
            }
            return isTodayDailyReady() ? brainDailyQuestion : null;
        })().finally(() => {
            if (!background) dailyPrefetchPromise = null;
        });
        return dailyPrefetchPromise;
    }

    async function ensureRuleOfTwoDailyReady() {
        if (isRuleOfTwoDailyReady()) return brainDailyQuestion;
        return prepareRuleOfTwoDaily();
    }

    /** Connectivity + security + daily prefetch (safe before API keys are configured). */
    function warmupDuringSetup() {
        runSecurityBootstrap();
        startConnectivityMonitor();
        void prepareRuleOfTwoDaily();
    }

    /** Full Brain init after setup keys are in memory/DOM (API status dot). */
    function init() {
        warmupDuringSetup();
        if (initialized) {
            scheduleCheckAvailability();
            return;
        }
        initialized = true;
        scheduleCheckAvailability();
    }

    function bootWhenReady() {
        try {
            runSecurityBootstrap();
            startConnectivityMonitor();
            void prepareRuleOfTwoDaily();
        } catch (e) {
            console.warn('Brain early boot failed', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootWhenReady);
    } else {
        bootWhenReady();
    }

    window.Brain = {
        init,
        warmupDuringSetup,
        runSecurityBootstrap,
        prepareRuleOfTwoDaily,
        ensureRuleOfTwoDailyReady,
        isRuleOfTwoDailyReady,
        getRuleOfTwoDailyStatus,
        onRuleOfTwoDailyReady,
        checkAvailability,
        scheduleCheckAvailability,
        refreshSetupApiStatus,
        fetchDailyControversy,
        handleLoadExampleFlow,
        resetExampleFlowSession,
        resolveProviderId,
        updateStatusDot,
        isOfflineOrNetworkError,
        isDeviceOrProbeOffline,
        isTimeoutError,
        networkUnavailableMessage: () => NETWORK_UNAVAILABLE_MSG,
        requestTimeoutMessage: () => REQUEST_TIMEOUT_MSG,
        getInternetReachable: () => internetReachable,
        assertInternetAvailable,
        refreshInternetReachable,
        startConnectivityMonitor,
        isDailyPrefetchStarted: () => dailyPrefetchStarted
    };
})();