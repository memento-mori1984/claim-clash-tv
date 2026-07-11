// Copyright (c) 2026 Arcana Veritas LLC. All rights reserved.
// Detects browser, OS, and form factor (phone / tablet / desktop) for responsive UI.

(function () {
    'use strict';

    function parseBrowser(ua) {
        ua = ua || '';
        if (/CriOS/i.test(ua)) return { label: 'Chrome (iOS)', key: 'chrome-ios' };
        if (/FxiOS/i.test(ua)) return { label: 'Firefox (iOS)', key: 'firefox-ios' };
        if (/EdgiOS/i.test(ua)) return { label: 'Edge (iOS)', key: 'edge-ios' };
        if (/Edg\//i.test(ua)) return { label: 'Edge', key: 'edge' };
        if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return { label: 'Opera', key: 'opera' };
        if (/SamsungBrowser/i.test(ua)) return { label: 'Samsung Internet', key: 'samsung' };
        if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return { label: 'Chrome', key: 'chrome' };
        if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return { label: 'Safari', key: 'safari' };
        if (/Firefox/i.test(ua)) return { label: 'Firefox', key: 'firefox' };
        return { label: 'Other', key: 'other' };
    }

    function parseOs(ua) {
        ua = ua || '';
        if (/iPhone|iPad|iPod/i.test(ua)) return { label: 'iOS', key: 'ios' };
        if (/Android/i.test(ua)) return { label: 'Android', key: 'android' };
        if (/Windows/i.test(ua)) return { label: 'Windows', key: 'windows' };
        if (/Mac OS X|Macintosh/i.test(ua)) return { label: 'macOS', key: 'macos' };
        if (/CrOS/i.test(ua)) return { label: 'ChromeOS', key: 'chromeos' };
        if (/Linux/i.test(ua)) return { label: 'Linux', key: 'linux' };
        return { label: 'Other', key: 'other' };
    }

    function isTouchDevice() {
        return ('ontouchstart' in window) || ((navigator.maxTouchPoints || 0) > 0);
    }

    function detectClientEnvironment() {
        const ua = String(navigator.userAgent || '');
        const touch = isTouchDevice();
        const w = window.innerWidth || 0;
        const h = window.innerHeight || 0;
        const coarse = window.matchMedia('(pointer: coarse)').matches;
        const narrow = window.matchMedia('(max-width: 640px)').matches;
        const mobileUa = /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);
        const tabletUa = /iPad|Android(?!.*Mobile)|Tablet/i.test(ua);

        const isPhone = narrow || (mobileUa && w <= 768) || (touch && coarse && w <= 640);
        const isTablet = !isPhone && (tabletUa || (touch && w > 640 && w <= 1024));
        const isMobile = isPhone || isTablet;
        const isDesktop = !isMobile;

        const browser = parseBrowser(ua);
        const os = parseOs(ua);

        return {
            userAgent: ua,
            browser: browser.label,
            browserKey: browser.key,
            os: os.label,
            osKey: os.key,
            touch: touch,
            coarsePointer: coarse,
            width: w,
            height: h,
            isPhone: isPhone,
            isTablet: isTablet,
            isMobile: isMobile,
            isDesktop: isDesktop,
            formFactor: isPhone ? 'phone' : (isTablet ? 'tablet' : 'desktop')
        };
    }

    let current = detectClientEnvironment();

    function stripEnvClasses(root) {
        const remove = [];
        root.classList.forEach(function (cls) {
            if (cls === 'cc-env-ready' ||
                cls === 'cc-phone' || cls === 'cc-not-phone' ||
                cls === 'cc-tablet' || cls === 'cc-not-tablet' ||
                cls === 'cc-mobile' || cls === 'cc-desktop' ||
                cls.indexOf('cc-os-') === 0 ||
                cls.indexOf('cc-browser-') === 0) {
                remove.push(cls);
            }
        });
        remove.forEach(function (cls) { root.classList.remove(cls); });
    }

    function applyClientEnvironmentClasses(env) {
        env = env || current;
        const root = document.documentElement;
        stripEnvClasses(root);
        root.classList.add('cc-env-ready');
        root.classList.add(env.isPhone ? 'cc-phone' : 'cc-not-phone');
        root.classList.add(env.isTablet ? 'cc-tablet' : 'cc-not-tablet');
        root.classList.add(env.isMobile ? 'cc-mobile' : 'cc-desktop');
        root.classList.add('cc-os-' + env.osKey);
        root.classList.add('cc-browser-' + env.browserKey);
    }

    function updateAboutClientLine(env) {
        const el = document.getElementById('about-client-env');
        if (!el) return;
        env = env || current;
        el.textContent = env.browser + ' on ' + env.os + ' (' + env.formFactor + ', ' + env.width + '\u00d7' + env.height + ')';
        el.classList.remove('hidden');
    }

    function scheduleRefresh() {
        current = detectClientEnvironment();
        applyClientEnvironmentClasses(current);
        updateAboutClientLine(current);
    }

    function bindResize() {
        let timer;
        window.addEventListener('resize', function () {
            clearTimeout(timer);
            timer = setTimeout(scheduleRefresh, 150);
        });
        window.addEventListener('orientationchange', function () {
            setTimeout(scheduleRefresh, 320);
        });
    }

    function apply() {
        scheduleRefresh();
        return current;
    }

    window.ClaimClashClient = {
        detect: detectClientEnvironment,
        get: function () { return current; },
        apply: apply,
        refresh: scheduleRefresh,
        isPhone: function () { return current.isPhone; },
        isMobile: function () { return current.isMobile; },
        isDesktop: function () { return current.isDesktop; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            apply();
            bindResize();
        });
    } else {
        apply();
        bindResize();
    }
})();