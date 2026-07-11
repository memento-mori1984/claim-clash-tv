// Copyright (c) 2026 Arcana Veritas LLC. All rights reserved.
// US school grade expectations + international-to-US mapping for academic use.
// Hidden facilitator directives adjust primary AI vocabulary/complexity only.

(function () {
    'use strict';

    const STORAGE_KEY = 'claimClashGradeLevel';

    const REFERENCE_LINKS = {
        isced: {
            label: 'UNESCO ISCED (international grade classification)',
            url: 'https://uis.unesco.org/en/topic/international-standard-classification-education-isced'
        },
        commonCore: {
            label: 'Common Core State Standards (US ELA/literacy)',
            url: 'http://www.corestandards.org/'
        },
        c3: {
            label: 'NCSS C3 Framework (US social studies inquiry)',
            url: 'https://www.socialstudies.org/standards/c3'
        },
        naep: {
            label: 'NAEP reading framework (US grade bands)',
            url: 'https://www.nationsreportcard.gov/'
        }
    };

    const COUNTRY_REFERENCE_LINKS = {
        US: [REFERENCE_LINKS.commonCore, REFERENCE_LINKS.c3, REFERENCE_LINKS.naep],
        GB: [{ label: 'UK national curriculum overview', url: 'https://www.gov.uk/national-curriculum' }, REFERENCE_LINKS.isced],
        CA: [{ label: 'Council of Ministers of Education, Canada', url: 'https://www.cmec.ca/' }, REFERENCE_LINKS.isced],
        AU: [{ label: 'Australian Curriculum (ACARA)', url: 'https://www.australiancurriculum.edu.au/' }, REFERENCE_LINKS.isced],
        IN: [{ label: 'India NCERT overview', url: 'https://ncert.nic.in/' }, REFERENCE_LINKS.isced],
        JP: [{ label: 'Japan MEXT school system', url: 'https://www.mext.go.jp/en/policy/education/' }, REFERENCE_LINKS.isced],
        DE: [{ label: 'Germany KMK education structure', url: 'https://www.kmk.org/' }, REFERENCE_LINKS.isced],
        FR: [{ label: 'France education system (government)', url: 'https://www.education.gouv.fr/' }, REFERENCE_LINKS.isced],
        OTHER: [REFERENCE_LINKS.isced]
    };

    /** US instructional bands keyed for mapping and AI directives. */
    const US_BANDS = {
        us_k: {
            label: 'US Kindergarten',
            ages: '5-6',
            reading: 'Short sentences; high-frequency words; read-aloud friendly phrasing.',
            inquiry: 'Concrete who/what/when questions; one idea per answer chunk.',
            standards: 'Approx. CCSS K-1 listening/reading foundations; pre-inquiry social studies (self/community).',
            isced: 'ISCED 0 (early childhood)'
        },
        us_1_2: {
            label: 'US Grades 1-2',
            ages: '6-8',
            reading: 'Simple paragraphs; define new terms in kid-friendly language.',
            inquiry: 'Clear claim vs. opinion distinction introduced with examples.',
            standards: 'CCSS.ELA grades 1-2; NCSS elementary inquiry with adult guidance.',
            isced: 'ISCED 1 (primary)'
        },
        us_3_5: {
            label: 'US Grades 3-5',
            ages: '8-11',
            reading: 'Upper-elementary vocabulary; bullet lists; short sourced summaries.',
            inquiry: 'Ask for evidence types (documents, data, experts); compare two simple sources.',
            standards: 'CCSS.ELA grades 3-5; C3 elementary inquiry (questions, sources, evidence).',
            isced: 'ISCED 1 (primary, upper)'
        },
        us_6_8: {
            label: 'US Grades 6-8',
            ages: '11-14',
            reading: 'Middle-school prose; define academic words on first use.',
            inquiry: 'Corroboration, bias awareness, claim/evidence/reasoning structure.',
            standards: 'CCSS.ELA grades 6-8; C3 middle grades disciplinary inquiry.',
            isced: 'ISCED 2 (lower secondary)'
        },
        us_9_10: {
            label: 'US Grades 9-10',
            ages: '14-16',
            reading: 'High-school freshman/sophomore density; primary-source excerpts when possible.',
            inquiry: 'Evaluate sourcing, perspective, and limits of evidence; counterarguments.',
            standards: 'CCSS.ELA grades 9-10; C3 high school developing arguments with evidence.',
            isced: 'ISCED 3 (upper secondary, early)'
        },
        us_11_12: {
            label: 'US Grades 11-12',
            ages: '16-18',
            reading: 'Advanced high-school / intro-college vocabulary with precision.',
            inquiry: 'Sustained argumentation, policy tradeoffs, methodological caveats.',
            standards: 'CCSS.ELA grades 11-12; AP/civics-style document-based reasoning.',
            isced: 'ISCED 3 (upper secondary, late)'
        },
        us_undergrad: {
            label: 'US College undergraduate',
            ages: '18-22',
            reading: 'Introductory academic tone; cite types of sources and uncertainty.',
            inquiry: 'Multi-source synthesis; assumptions and competing frameworks named explicitly.',
            standards: 'Lower-division college inquiry; aligns with intro political science / composition.',
            isced: 'ISCED 6 (bachelor or equivalent)'
        },
        us_grad: {
            label: 'US Graduate / professional',
            ages: '22+',
            reading: 'Full academic register; nuance, limitations, and literature-aware claims.',
            inquiry: 'Methodology, epistemic limits, and qualified conclusions.',
            standards: 'Graduate seminar / professional policy analysis depth.',
            isced: 'ISCED 7-8 (master/doctoral)'
        },
        us_adult: {
            label: 'General adult (no grade adjustment)',
            ages: '18+',
            reading: 'Clear general-audience prose; avoid unnecessary jargon.',
            inquiry: 'Balanced evidence review suitable for educated lay readers.',
            standards: 'No specific US grade band; default Claim Clash audience.',
            isced: 'N/A'
        }
    };

    function localGrade(countryCode, localLabel, usBand, iscedNote) {
        return { countryCode, localLabel, usBand, iscedNote: iscedNote || '' };
    }

    const COUNTRIES = [
        {
            code: 'US',
            name: 'United States',
            grades: [
                localGrade('US', 'Kindergarten', 'us_k'),
                localGrade('US', 'Grade 1', 'us_1_2'),
                localGrade('US', 'Grade 2', 'us_1_2'),
                localGrade('US', 'Grade 3', 'us_3_5'),
                localGrade('US', 'Grade 4', 'us_3_5'),
                localGrade('US', 'Grade 5', 'us_3_5'),
                localGrade('US', 'Grade 6', 'us_6_8'),
                localGrade('US', 'Grade 7', 'us_6_8'),
                localGrade('US', 'Grade 8', 'us_6_8'),
                localGrade('US', 'Grade 9', 'us_9_10'),
                localGrade('US', 'Grade 10', 'us_9_10'),
                localGrade('US', 'Grade 11', 'us_11_12'),
                localGrade('US', 'Grade 12', 'us_11_12'),
                localGrade('US', 'College freshman / sophomore', 'us_undergrad'),
                localGrade('US', 'College junior / senior', 'us_undergrad'),
                localGrade('US', 'Graduate or professional school', 'us_grad'),
                localGrade('US', 'Adult: no grade adjustment', 'us_adult')
            ]
        },
        {
            code: 'GB',
            name: 'United Kingdom',
            grades: [
                localGrade('GB', 'Reception', 'us_k', 'ISCED 0'),
                localGrade('GB', 'Year 1', 'us_1_2'),
                localGrade('GB', 'Year 2', 'us_1_2'),
                localGrade('GB', 'Year 3', 'us_3_5'),
                localGrade('GB', 'Year 4', 'us_3_5'),
                localGrade('GB', 'Year 5', 'us_3_5'),
                localGrade('GB', 'Year 6', 'us_3_5'),
                localGrade('GB', 'Year 7', 'us_6_8'),
                localGrade('GB', 'Year 8', 'us_6_8'),
                localGrade('GB', 'Year 9', 'us_6_8'),
                localGrade('GB', 'Year 10 (GCSE)', 'us_9_10'),
                localGrade('GB', 'Year 11 (GCSE)', 'us_9_10'),
                localGrade('GB', 'Year 12 (A Level / Lower Sixth)', 'us_11_12'),
                localGrade('GB', 'Year 13 (A Level / Upper Sixth)', 'us_11_12'),
                localGrade('GB', 'University undergraduate', 'us_undergrad', 'ISCED 6'),
                localGrade('GB', 'University postgraduate', 'us_grad', 'ISCED 7-8')
            ]
        },
        {
            code: 'CA',
            name: 'Canada',
            grades: [
                localGrade('CA', 'Kindergarten', 'us_k'),
                localGrade('CA', 'Grade 1', 'us_1_2'),
                localGrade('CA', 'Grade 2', 'us_1_2'),
                localGrade('CA', 'Grade 3', 'us_3_5'),
                localGrade('CA', 'Grade 4', 'us_3_5'),
                localGrade('CA', 'Grade 5', 'us_3_5'),
                localGrade('CA', 'Grade 6', 'us_6_8'),
                localGrade('CA', 'Grade 7', 'us_6_8'),
                localGrade('CA', 'Grade 8', 'us_6_8'),
                localGrade('CA', 'Grade 9', 'us_9_10'),
                localGrade('CA', 'Grade 10', 'us_9_10'),
                localGrade('CA', 'Grade 11', 'us_11_12'),
                localGrade('CA', 'Grade 12', 'us_11_12'),
                localGrade('CA', 'University undergraduate', 'us_undergrad'),
                localGrade('CA', 'University graduate', 'us_grad')
            ]
        },
        {
            code: 'AU',
            name: 'Australia',
            grades: [
                localGrade('AU', 'Foundation / Prep', 'us_k'),
                localGrade('AU', 'Year 1', 'us_1_2'),
                localGrade('AU', 'Year 2', 'us_1_2'),
                localGrade('AU', 'Year 3', 'us_3_5'),
                localGrade('AU', 'Year 4', 'us_3_5'),
                localGrade('AU', 'Year 5', 'us_3_5'),
                localGrade('AU', 'Year 6', 'us_3_5'),
                localGrade('AU', 'Year 7', 'us_6_8'),
                localGrade('AU', 'Year 8', 'us_6_8'),
                localGrade('AU', 'Year 9', 'us_6_8'),
                localGrade('AU', 'Year 10', 'us_9_10'),
                localGrade('AU', 'Year 11', 'us_9_10'),
                localGrade('AU', 'Year 12', 'us_11_12'),
                localGrade('AU', 'University undergraduate', 'us_undergrad'),
                localGrade('AU', 'University postgraduate', 'us_grad')
            ]
        },
        {
            code: 'IN',
            name: 'India',
            grades: [
                localGrade('IN', 'Class 1', 'us_1_2'),
                localGrade('IN', 'Class 2', 'us_1_2'),
                localGrade('IN', 'Class 3', 'us_3_5'),
                localGrade('IN', 'Class 4', 'us_3_5'),
                localGrade('IN', 'Class 5', 'us_3_5'),
                localGrade('IN', 'Class 6', 'us_6_8'),
                localGrade('IN', 'Class 7', 'us_6_8'),
                localGrade('IN', 'Class 8', 'us_6_8'),
                localGrade('IN', 'Class 9', 'us_9_10'),
                localGrade('IN', 'Class 10 (secondary)', 'us_9_10'),
                localGrade('IN', 'Class 11', 'us_11_12'),
                localGrade('IN', 'Class 12 (senior secondary)', 'us_11_12'),
                localGrade('IN', 'University undergraduate', 'us_undergrad'),
                localGrade('IN', 'University postgraduate', 'us_grad')
            ]
        },
        {
            code: 'JP',
            name: 'Japan',
            grades: [
                localGrade('JP', '小学1年生 (Elementary 1)', 'us_1_2'),
                localGrade('JP', '小学2年生 (Elementary 2)', 'us_1_2'),
                localGrade('JP', '小学3年生 (Elementary 3)', 'us_3_5'),
                localGrade('JP', '小学4年生 (Elementary 4)', 'us_3_5'),
                localGrade('JP', '小学5年生 (Elementary 5)', 'us_3_5'),
                localGrade('JP', '小学6年生 (Elementary 6)', 'us_3_5'),
                localGrade('JP', '中学1年生 (Lower secondary 1)', 'us_6_8'),
                localGrade('JP', '中学2年生 (Lower secondary 2)', 'us_6_8'),
                localGrade('JP', '中学3年生 (Lower secondary 3)', 'us_6_8'),
                localGrade('JP', '高校1年生 (Upper secondary 1)', 'us_9_10'),
                localGrade('JP', '高校2年生 (Upper secondary 2)', 'us_9_10'),
                localGrade('JP', '高校3年生 (Upper secondary 3)', 'us_11_12'),
                localGrade('JP', '大学学部 (Undergraduate)', 'us_undergrad'),
                localGrade('JP', '大学院 (Graduate)', 'us_grad')
            ]
        },
        {
            code: 'DE',
            name: 'Germany',
            grades: [
                localGrade('DE', 'Klasse 1', 'us_1_2'),
                localGrade('DE', 'Klasse 2', 'us_1_2'),
                localGrade('DE', 'Klasse 3', 'us_3_5'),
                localGrade('DE', 'Klasse 4', 'us_3_5'),
                localGrade('DE', 'Klasse 5', 'us_6_8'),
                localGrade('DE', 'Klasse 6', 'us_6_8'),
                localGrade('DE', 'Klasse 7', 'us_6_8'),
                localGrade('DE', 'Klasse 8', 'us_6_8'),
                localGrade('DE', 'Klasse 9', 'us_9_10'),
                localGrade('DE', 'Klasse 10', 'us_9_10'),
                localGrade('DE', 'Klasse 11', 'us_11_12'),
                localGrade('DE', 'Klasse 12', 'us_11_12'),
                localGrade('DE', 'Klasse 13 (where applicable)', 'us_11_12'),
                localGrade('DE', 'Universität (undergraduate)', 'us_undergrad'),
                localGrade('DE', 'Universität (graduate)', 'us_grad')
            ]
        },
        {
            code: 'FR',
            name: 'France',
            grades: [
                localGrade('FR', 'CP / CE1', 'us_1_2'),
                localGrade('FR', 'CE2 / CM1', 'us_3_5'),
                localGrade('FR', 'CM2', 'us_3_5'),
                localGrade('FR', '6ème', 'us_6_8'),
                localGrade('FR', '5ème', 'us_6_8'),
                localGrade('FR', '4ème', 'us_6_8'),
                localGrade('FR', '3ème', 'us_6_8'),
                localGrade('FR', 'Seconde', 'us_9_10'),
                localGrade('FR', 'Première', 'us_11_12'),
                localGrade('FR', 'Terminale', 'us_11_12'),
                localGrade('FR', 'Licence (undergraduate)', 'us_undergrad'),
                localGrade('FR', 'Master / Doctorat', 'us_grad')
            ]
        },
        {
            code: 'BR',
            name: 'Brazil',
            grades: [
                localGrade('BR', '1º ano (fundamental)', 'us_1_2'),
                localGrade('BR', '2º-5º ano (fundamental)', 'us_3_5'),
                localGrade('BR', '6º-9º ano (fundamental)', 'us_6_8'),
                localGrade('BR', '1º-3º ano (ensino médio)', 'us_9_10'),
                localGrade('BR', '3º ano (ensino médio, final)', 'us_11_12'),
                localGrade('BR', 'Graduação', 'us_undergrad'),
                localGrade('BR', 'Pós-graduação', 'us_grad')
            ]
        },
        {
            code: 'MX',
            name: 'Mexico',
            grades: [
                localGrade('MX', 'Primaria 1°-3°', 'us_3_5'),
                localGrade('MX', 'Primaria 4°-6°', 'us_3_5'),
                localGrade('MX', 'Secundaria 1°-3°', 'us_6_8'),
                localGrade('MX', 'Preparatoria 1°-2°', 'us_9_10'),
                localGrade('MX', 'Preparatoria 3°', 'us_11_12'),
                localGrade('MX', 'Licenciatura', 'us_undergrad'),
                localGrade('MX', 'Posgrado', 'us_grad')
            ]
        },
        {
            code: 'SG',
            name: 'Singapore',
            grades: [
                localGrade('SG', 'Primary 1-2', 'us_1_2'),
                localGrade('SG', 'Primary 3-6', 'us_3_5'),
                localGrade('SG', 'Secondary 1-2', 'us_6_8'),
                localGrade('SG', 'Secondary 3-4', 'us_9_10'),
                localGrade('SG', 'Junior College / Polytechnic (pre-university)', 'us_11_12'),
                localGrade('SG', 'University undergraduate', 'us_undergrad'),
                localGrade('SG', 'University postgraduate', 'us_grad')
            ]
        },
        {
            code: 'OTHER',
            name: 'Other country (ISCED bands)',
            grades: [
                localGrade('OTHER', 'Early childhood (ISCED 0)', 'us_k', 'ISCED 0'),
                localGrade('OTHER', 'Primary education (ISCED 1)', 'us_3_5', 'ISCED 1'),
                localGrade('OTHER', 'Lower secondary (ISCED 2)', 'us_6_8', 'ISCED 2'),
                localGrade('OTHER', 'Upper secondary (ISCED 3)', 'us_11_12', 'ISCED 3'),
                localGrade('OTHER', 'Post-secondary non-tertiary (ISCED 4)', 'us_11_12', 'ISCED 4'),
                localGrade('OTHER', 'Short-cycle tertiary (ISCED 5)', 'us_undergrad', 'ISCED 5'),
                localGrade('OTHER', 'Bachelor level (ISCED 6)', 'us_undergrad', 'ISCED 6'),
                localGrade('OTHER', 'Master or equivalent (ISCED 7)', 'us_grad', 'ISCED 7'),
                localGrade('OTHER', 'Doctoral or equivalent (ISCED 8)', 'us_grad', 'ISCED 8'),
                localGrade('OTHER', 'Adult general audience', 'us_adult', 'N/A')
            ]
        }
    ];

    let state = {
        enabled: false,
        countryCode: 'US',
        localGradeIndex: 8
    };

    function getCountry(code) {
        return COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
    }

    function getResolvedSelection() {
        const country = getCountry(state.countryCode);
        const idx = Math.max(0, Math.min(state.localGradeIndex, country.grades.length - 1));
        const grade = country.grades[idx];
        const usBand = US_BANDS[grade.usBand] || US_BANDS.us_adult;
        return { country, grade, idx, usBand };
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (typeof parsed.enabled === 'boolean') state.enabled = parsed.enabled;
            if (parsed.countryCode) state.countryCode = parsed.countryCode;
            if (Number.isFinite(parsed.localGradeIndex)) state.localGradeIndex = parsed.localGradeIndex;
        } catch (e) { /* ignore */ }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* ignore */ }
    }

    function prefixIds(prefix) {
        return {
            enabled: prefix + '-grade-enabled',
            country: prefix + '-grade-country',
            local: prefix + '-grade-local',
            summary: prefix + '-grade-summary',
            refs: prefix + '-grade-refs',
            panel: prefix + '-grade-panel'
        };
    }

    function populateCountrySelect(selectEl) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        COUNTRIES.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.code;
            opt.textContent = c.name;
            selectEl.appendChild(opt);
        });
    }

    function populateLocalSelect(selectEl, countryCode, selectedIndex) {
        if (!selectEl) return;
        const country = getCountry(countryCode);
        selectEl.innerHTML = '';
        country.grades.forEach((g, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = g.localLabel;
            selectEl.appendChild(opt);
        });
        selectEl.value = String(Math.max(0, Math.min(selectedIndex, country.grades.length - 1)));
    }

    function renderSummary(summaryEl, prefix) {
        if (!summaryEl) return;
        const ids = prefixIds(prefix);
        const enabledEl = document.getElementById(ids.enabled);
        if (enabledEl && !enabledEl.checked) {
            summaryEl.textContent = 'Grade adjustment is off. Enable above to align AI responses with US school expectations.';
            return;
        }
        const sel = getResolvedSelection();
        const equiv = sel.grade.countryCode === 'US'
            ? sel.usBand.label
            : sel.usBand.label + ' (US equivalent for ' + sel.country.name + ' ' + sel.grade.localLabel + ')';
        summaryEl.innerHTML = [
            '<strong class="text-zinc-300">US expectation band:</strong> ' + escapeHtml(equiv),
            '<span class="text-zinc-500"> · Typical ages ' + escapeHtml(sel.usBand.ages) + '</span>',
            '<br><span class="text-zinc-500">' + escapeHtml(sel.usBand.standards) + '</span>'
        ].join('');
    }

    function renderReferences(refsEl, countryCode) {
        if (!refsEl) return;
        const links = COUNTRY_REFERENCE_LINKS[countryCode] || COUNTRY_REFERENCE_LINKS.OTHER;
        refsEl.innerHTML = links.map(link => {
            return '<button type="button" class="block text-left text-amber-400/90 hover:text-amber-300 text-[11px] mb-1 underline" data-grade-ref-url="' +
                escapeAttr(link.url) + '">' + escapeHtml(link.label) + '</button>';
        }).join('') +
            '<button type="button" class="block text-left text-amber-400/90 hover:text-amber-300 text-[11px] underline" data-grade-ref-url="' +
            escapeAttr(REFERENCE_LINKS.isced.url) + '">' + escapeHtml(REFERENCE_LINKS.isced.label) + '</button>';
        refsEl.querySelectorAll('[data-grade-ref-url]').forEach(btn => {
            btn.onclick = () => {
                const url = btn.getAttribute('data-grade-ref-url');
                if (url && typeof openExternalUrl === 'function') openExternalUrl(url);
                else if (url) window.open(url, '_blank', 'noopener,noreferrer');
            };
        });
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(text) {
        return escapeHtml(text).replace(/'/g, '&#39;');
    }

    function readFromDom(prefix) {
        const ids = prefixIds(prefix);
        const enabledEl = document.getElementById(ids.enabled);
        const countryEl = document.getElementById(ids.country);
        const localEl = document.getElementById(ids.local);
        if (enabledEl) state.enabled = !!enabledEl.checked;
        if (countryEl) state.countryCode = countryEl.value || 'US';
        if (localEl) state.localGradeIndex = parseInt(localEl.value, 10) || 0;
        saveState();
        renderSummary(document.getElementById(ids.summary), prefix);
        renderReferences(document.getElementById(ids.refs), state.countryCode);
    }

    function syncToDom(prefix) {
        const ids = prefixIds(prefix);
        const enabledEl = document.getElementById(ids.enabled);
        const countryEl = document.getElementById(ids.country);
        const localEl = document.getElementById(ids.local);
        if (enabledEl) enabledEl.checked = !!state.enabled;
        if (countryEl) {
            countryEl.value = state.countryCode;
            populateLocalSelect(localEl, state.countryCode, state.localGradeIndex);
        }
        renderSummary(document.getElementById(ids.summary), prefix);
        renderReferences(document.getElementById(ids.refs), state.countryCode);
        const panel = document.getElementById(ids.panel);
        if (panel) panel.classList.toggle('opacity-60', !state.enabled);
    }

    function bindPanel(prefix) {
        const ids = prefixIds(prefix);
        const enabledEl = document.getElementById(ids.enabled);
        const countryEl = document.getElementById(ids.country);
        const localEl = document.getElementById(ids.local);
        if (!enabledEl || !countryEl || !localEl) return;

        populateCountrySelect(countryEl);
        syncToDom(prefix);

        enabledEl.addEventListener('change', () => readFromDom(prefix));
        countryEl.addEventListener('change', () => {
            state.localGradeIndex = 0;
            readFromDom(prefix);
            populateLocalSelect(localEl, state.countryCode, 0);
        });
        localEl.addEventListener('change', () => readFromDom(prefix));
    }

    function buildPanelHtml(prefix) {
        const ids = prefixIds(prefix);
        return (
            '<div id="' + ids.panel + '" class="space-y-3">' +
            '<label class="flex items-start gap-2 cursor-pointer">' +
            '<input type="checkbox" id="' + ids.enabled + '" class="mt-1 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500" />' +
            '<span><span class="text-sm text-zinc-200">Grade-level AI responses (academic)</span>' +
            '<span class="block text-[11px] text-zinc-500 mt-0.5">Align vocabulary and inquiry depth to US school expectations. International students: choose your country and local grade; we map to the nearest US band.</span></span></label>' +
            '<div class="grid sm:grid-cols-2 gap-3">' +
            '<div><label class="block text-[11px] text-zinc-400 mb-1" for="' + ids.country + '">Country / school system</label>' +
            '<select id="' + ids.country + '" class="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm"></select></div>' +
            '<div><label class="block text-[11px] text-zinc-400 mb-1" for="' + ids.local + '">Local grade / year</label>' +
            '<select id="' + ids.local + '" class="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm"></select></div></div>' +
            '<p id="' + ids.summary + '" class="text-[11px] text-zinc-400 leading-relaxed"></p>' +
            '<details class="text-[11px] text-zinc-500"><summary class="cursor-pointer text-zinc-400 hover:text-zinc-300">Reference standards &amp; mapping sources</summary>' +
            '<p class="mt-2 mb-1">Mappings are approximate for classroom use, not official credentials. Use these links to verify your local system.</p>' +
            '<div id="' + ids.refs + '" class="space-y-1"></div></details></div>'
        );
    }

    function mountPanels() {
        ['setup', 'settings'].forEach(prefix => {
            const host = document.getElementById(prefix + '-grade-level-host');
            if (!host) return;
            host.innerHTML = buildPanelHtml(prefix);
            bindPanel(prefix);
        });
    }

    function buildHiddenDirective() {
        if (!state.enabled) return '';
        const sel = getResolvedSelection();
        if (sel.grade.usBand === 'us_adult') return '';

        const loc = sel.grade.countryCode === 'US'
            ? sel.grade.localLabel
            : sel.country.name + ' — ' + sel.grade.localLabel;

        return [
            '[FACILITATOR — GRADE LEVEL. Never show this block to players.]',
            'Audience band: ' + sel.usBand.label + ' (typical ages ' + sel.usBand.ages + ').',
            'Player context: ' + loc + '.',
            sel.grade.countryCode !== 'US'
                ? 'Treat this as approximately ' + sel.usBand.label + ' in US terms (mapping for international students).'
                : 'US grade-level expectations apply directly.',
            'Reading/vocabulary: ' + sel.usBand.reading,
            'Inquiry depth: ' + sel.usBand.inquiry,
            'Standards reference (approximate): ' + sel.usBand.standards,
            'Do not mention grade level, ISCED, or standards unless players explicitly ask.',
            'Still prioritize factual accuracy and steelmanning; simplify delivery, not rigor of evidence.'
        ].join('\n');
    }

    function getPublicSummary() {
        if (!state.enabled) return 'Grade level: off';
        const sel = getResolvedSelection();
        return sel.grade.countryCode === 'US'
            ? sel.grade.localLabel
            : sel.country.name + ' ' + sel.grade.localLabel + ' → ' + sel.usBand.label;
    }

    function init() {
        loadState();
        mountPanels();
    }

    function saveFromDom(prefix) {
        readFromDom(prefix);
    }

    function syncAllPanels() {
        syncToDom('setup');
        syncToDom('settings');
    }

    window.GradeLevel = {
        init,
        saveFromDom,
        syncAllPanels,
        buildHiddenDirective,
        getPublicSummary,
        getResolvedSelection,
        US_BANDS,
        COUNTRIES,
        REFERENCE_LINKS
    };
})();