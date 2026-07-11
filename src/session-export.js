/**
 * Claim Clash session export: Markdown, PDF, and Word (.docx).
 * Loaded before index.html inline script; exposes window.SessionExport.
 */
(function () {
    'use strict';

    const PDF_LINE_WRAP_CHARS = 92;
    const PDF_YIELD_EVERY_LINES = 30;
    const PDF_BUILD_TIMEOUT_MS = 18000;
    const EMAIL_CHARS_PER_ATTACHMENT_PART = 22000;

    function yieldToUi() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    function paintUi() {
        return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }

    async function withBuildTimeout(task, timeoutMs) {
        const ms = timeoutMs || PDF_BUILD_TIMEOUT_MS;
        let timer = null;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Export timed out. Try Markdown or Text only.')), ms);
        });
        try {
            return await Promise.race([task(), timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    function wrapPlainLines(text, maxChars) {
        const limit = maxChars || PDF_LINE_WRAP_CHARS;
        const lines = [];
        const paragraphs = sanitizeExportText(text).split('\n');
        paragraphs.forEach((paragraph, idx) => {
            if (idx > 0) lines.push('');
            if (!paragraph) return;
            let remaining = paragraph;
            while (remaining.length > limit) {
                let cut = remaining.lastIndexOf(' ', limit);
                if (cut < limit * 0.45) cut = limit;
                lines.push(remaining.slice(0, cut).trimEnd());
                remaining = remaining.slice(cut).trimStart();
            }
            if (remaining) lines.push(remaining);
        });
        return lines.length ? lines : [''];
    }

    function expandTurnsForPlanning(turns, charBudget) {
        const expanded = [];
        turns.forEach(turn => {
            const text = sanitizeExportText(turn.text);
            if (text.length <= charBudget) {
                expanded.push(turn);
                return;
            }
            const slices = chunkLongText(text, charBudget);
            slices.forEach((slice, sliceIndex) => {
                expanded.push(Object.assign({}, turn, {
                    text: slice,
                    label: sliceIndex === 0
                        ? turn.label
                        : `${turn.label} (continued ${sliceIndex + 1}/${slices.length})`
                }));
            });
        });
        return expanded;
    }

    function sanitizeExportText(text) {
        return String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
            .trim();
    }

    function chunkLongText(text, maxChunk) {
        const clean = sanitizeExportText(text);
        const limit = maxChunk || PDF_TEXT_CHUNK_SIZE;
        if (!clean) return [''];
        if (clean.length <= limit) return [clean];

        const parts = [];
        let remaining = clean;
        while (remaining.length > 0) {
            if (remaining.length <= limit) {
                parts.push(remaining);
                break;
            }
            let cut = remaining.lastIndexOf('\n\n', limit);
            if (cut < limit * 0.4) cut = remaining.lastIndexOf('\n', limit);
            if (cut < limit * 0.4) cut = limit;
            parts.push(remaining.slice(0, cut).trimEnd());
            remaining = remaining.slice(cut).trimStart();
        }
        return parts;
    }

    function escapeXml(text) {
        return sanitizeExportText(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function estimateDataChars(data) {
        let total = 400;
        (data.turns || []).forEach(turn => { total += sanitizeExportText(turn.text).length + 48; });
        (data.bookmarks || []).forEach(b => { total += sanitizeExportText(b.concern).length + sanitizeExportText(b.question).length + 24; });
        total += sanitizeExportText(data.currentQuestion).length + sanitizeExportText(data.currentAnswer).length;
        (data.comparison || []).forEach(entry => { total += sanitizeExportText(entry.text).length + sanitizeExportText(entry.name).length + 32; });
        return total;
    }

    function groupTurnsByCharBudget(turns, charBudget) {
        if (!turns.length) return [[]];
        const groups = [];
        let current = [];
        let currentChars = 0;

        turns.forEach(turn => {
            const turnChars = sanitizeExportText(turn.text).length + 48;
            if (current.length && currentChars + turnChars > charBudget) {
                groups.push(current);
                current = [];
                currentChars = 0;
            }
            current.push(turn);
            currentChars += turnChars;
        });
        if (current.length) groups.push(current);
        return groups;
    }

    function formatExportDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d} ${hh}:${mm}`;
    }

    function formatFileDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function turnLabel(turn, primaryName) {
        if (turn.role === 'user') return 'Question';
        return `Answer (${primaryName})`;
    }

    function collectSessionExportData(ctx) {
        const exportedAt = new Date();
        const primary = ctx.getProviderById(ctx.primaryProviderId);
        const primaryName = primary ? primary.name : 'Primary AI';
        const turns = (ctx.primarySessionMessages || []).map((msg, index) => ({
            index: index + 1,
            role: msg.role,
            label: turnLabel(msg, primaryName),
            text: String(msg.text || '').trim()
        })).filter(t => t.text);

        const bookmarks = (ctx.bookmarks || []).map(b => ({
            concern: String(b.concern || '').trim(),
            question: String(b.question || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            player: String(b.player || '').trim()
        })).filter(b => b.concern || b.question);

        const questionBox = document.getElementById('question-box');
        const answerBox = document.getElementById('answer-box');
        const currentQuestion = questionBox
            ? (ctx.getElementAnswerText ? ctx.getElementAnswerText(questionBox) : (questionBox.innerText || '').trim())
            : '';
        const currentAnswer = answerBox
            ? (ctx.getElementAnswerText ? ctx.getElementAnswerText(answerBox) : (answerBox.innerText || '').trim())
            : '';

        const comparison = [];
        document.querySelectorAll('.ai-response[data-provider]').forEach(div => {
            const id = div.getAttribute('data-provider');
            const provider = ctx.getProviderById(id);
            const text = ctx.getElementAnswerText ? ctx.getElementAnswerText(div) : (div.innerText || '').trim();
            if (text) {
                comparison.push({
                    name: provider ? provider.name : id,
                    text: text
                });
            }
        });

        const mode = ctx.singlePlayerInterrogationMode
            ? 'Single Player Interrogation Mode'
            : 'Team play';

        return {
            exportedAt,
            exportedAtDisplay: formatExportDate(exportedAt),
            fileDate: formatFileDate(exportedAt),
            appVersion: ctx.APP_VERSION || '',
            appPhase: ctx.APP_PHASE || '',
            rulesVersion: ctx.RULES_VERSION || '',
            mode,
            currentPlayer: ctx.currentPlayer || '',
            primaryName,
            turns,
            bookmarks,
            currentQuestion,
            currentAnswer,
            comparison
        };
    }

    function sessionHasExportableContent(data) {
        return data.turns.length > 0 ||
            data.bookmarks.length > 0 ||
            data.currentQuestion ||
            data.currentAnswer ||
            data.comparison.length > 0;
    }

    function buildMetadataLines(data) {
        const lines = [
            `Session: ${resolveExportBasename(data)}`,
            `Date: ${data.exportedAtDisplay}`,
            `Version: ${data.appVersion} ${data.appPhase}`.trim(),
            `Rules: v${data.rulesVersion}`,
            `Mode: ${data.mode}`,
            `Primary AI: ${data.primaryName}`
        ];
        if (!data.mode.includes('Single') && data.currentPlayer) {
            lines.push(`Active player at export: ${data.currentPlayer}`);
        }
        return lines;
    }

    function escapeYamlString(text) {
        return String(text || '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\r?\n/g, ' ');
    }

    function buildSessionFingerprint(data) {
        if (!data) return '';
        const turns = data.turns || [];
        const bookmarks = data.bookmarks || [];
        const comparison = data.comparison || [];
        return [
            turns.length,
            turns.map(t => String(t.text || '')).join('\x00'),
            bookmarks.map(b => `${b.concern || ''}\x01${b.question || ''}`).join('\x00'),
            String(data.currentQuestion || ''),
            String(data.currentAnswer || ''),
            comparison.map(c => String(c.text || '')).join('\x00')
        ].join('\x1e');
    }

    function buildFrontmatter(data) {
        const topic = data.convTopic || deriveConversationTopic(data);
        const lines = [
            '---',
            `conv: ${data.convNumber || 1}`,
            `exportVersion: ${data.exportVersion || 1}`,
            `fileDate: "${escapeYamlString(data.fileDate || formatFileDate(new Date()))}"`,
            `topic: "${escapeYamlString(topic)}"`,
            `exportedAt: "${escapeYamlString(data.exportedAtDisplay)}"`,
            `turnCount: ${(data.turns || []).length}`,
            'bookmarks:'
        ];
        if (data.sessionRef) {
            lines.splice(lines.length - 1, 0, `sessionRef: "${escapeYamlString(data.sessionRef)}"`);
        }
        if (data.autoSave) {
            lines.splice(lines.length - 1, 0, 'autoSave: true');
            if (data.autoSaveReason) {
                lines.splice(lines.length - 1, 0, `autoSaveReason: "${escapeYamlString(data.autoSaveReason)}"`);
            }
        }
        const bookmarks = data.bookmarks || [];
        if (!bookmarks.length) {
            lines.push('  []');
        } else {
            bookmarks.forEach(b => {
                lines.push(`  - concern: "${escapeYamlString(b.concern)}"`);
                if (b.question) lines.push(`    question: "${escapeYamlString(b.question)}"`);
                if (b.player) lines.push(`    player: "${escapeYamlString(b.player)}"`);
            });
        }
        lines.push('---', '');
        return lines.join('\n');
    }

    function buildMarkdown(data) {
        const parts = [buildFrontmatter(data), `# ${resolveExportBasename(data)}`, ''];
        buildMetadataLines(data).forEach(line => parts.push(line));
        parts.push('');

        if (data.turns.length) {
            parts.push('## Conversation');
            parts.push('');
            data.turns.forEach(turn => {
                parts.push(`### Turn ${turn.index}: ${turn.label}`);
                parts.push('');
                parts.push(turn.text);
                parts.push('');
            });
        }

        if (data.currentQuestion || data.currentAnswer) {
            parts.push('## Current screen (not yet in session memory)');
            parts.push('');
            if (data.currentQuestion) {
                parts.push('**Question:**');
                parts.push(data.currentQuestion);
                parts.push('');
            }
            if (data.currentAnswer) {
                parts.push(`**Answer (${data.primaryName}):**`);
                parts.push(data.currentAnswer);
                parts.push('');
            }
        }

        if (data.comparison.length) {
            parts.push('## Other AI responses (latest comparison)');
            parts.push('');
            data.comparison.forEach(entry => {
                parts.push(`### ${entry.name}`);
                parts.push('');
                parts.push(entry.text);
                parts.push('');
            });
        }

        if (data.bookmarks.length) {
            parts.push('## Bookmarks');
            parts.push('');
            data.bookmarks.forEach(b => {
                const player = b.player ? ` (${b.player})` : '';
                parts.push(`- **${b.concern}**${player}`);
                if (b.question) parts.push(`  - Question: ${b.question}`);
            });
            parts.push('');
        }

        parts.push('---');
        parts.push('Exported from Claim Clash. AI answers may change over time; verify important claims with primary sources.');
        return parts.join('\n');
    }

    function wordParagraph(text, opts) {
        const options = opts || {};
        const escaped = escapeXml(text || ' ');
        let rPr = '';
        if (options.heading) {
            rPr = '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>';
        } else if (options.bold) {
            rPr = '<w:rPr><w:b/></w:rPr>';
        }
        return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
    }

    function buildDocxBytes(data) {
        if (typeof JSZip === 'undefined') {
            return Promise.reject(new Error('JSZip is not loaded.'));
        }

        const bodyParts = [];
        bodyParts.push(wordParagraph(resolveExportBasename(data), { heading: true }));
        bodyParts.push(wordParagraph(''));
        buildMetadataLines(data).forEach(line => bodyParts.push(wordParagraph(line)));
        bodyParts.push(wordParagraph(''));

        if (data.turns.length) {
            bodyParts.push(wordParagraph('Conversation', { heading: true }));
            data.turns.forEach(turn => {
                bodyParts.push(wordParagraph(`Turn ${turn.index}: ${turn.label}`, { bold: true }));
                chunkLongText(turn.text, 8000).forEach(chunk => {
                    chunk.split(/\r?\n/).forEach(line => bodyParts.push(wordParagraph(line)));
                });
                bodyParts.push(wordParagraph(''));
            });
        }

        if (data.currentQuestion || data.currentAnswer) {
            bodyParts.push(wordParagraph('Current screen (not yet in session memory)', { heading: true }));
            if (data.currentQuestion) {
                bodyParts.push(wordParagraph('Question:', { bold: true }));
                String(data.currentQuestion).split(/\r?\n/).forEach(line => bodyParts.push(wordParagraph(line)));
            }
            if (data.currentAnswer) {
                bodyParts.push(wordParagraph(`Answer (${data.primaryName}):`, { bold: true }));
                String(data.currentAnswer).split(/\r?\n/).forEach(line => bodyParts.push(wordParagraph(line)));
            }
            bodyParts.push(wordParagraph(''));
        }

        if (data.comparison.length) {
            bodyParts.push(wordParagraph('Other AI responses (latest comparison)', { heading: true }));
            data.comparison.forEach(entry => {
                bodyParts.push(wordParagraph(entry.name, { bold: true }));
                String(entry.text).split(/\r?\n/).forEach(line => bodyParts.push(wordParagraph(line)));
                bodyParts.push(wordParagraph(''));
            });
        }

        if (data.bookmarks.length) {
            bodyParts.push(wordParagraph('Bookmarks', { heading: true }));
            data.bookmarks.forEach(b => {
                const player = b.player ? ` (${b.player})` : '';
                bodyParts.push(wordParagraph(`${b.concern}${player}`, { bold: true }));
                if (b.question) bodyParts.push(wordParagraph(`Question: ${b.question}`));
            });
            bodyParts.push(wordParagraph(''));
        }

        bodyParts.push(wordParagraph('Exported from Claim Clash. AI answers may change over time; verify important claims with primary sources.'));

        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${bodyParts.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;

        const zip = new JSZip();
        zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
        zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
        zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
        zip.folder('word').file('document.xml', documentXml);

        return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    }

    async function buildPdfBytes(data) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF is not loaded.');
        }

        await paintUi();

        const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'letter', compress: true });
        const margin = 15;
        const pageHeight = doc.internal.pageSize.getHeight();
        let y = margin;
        let lineCounter = 0;

        function ensureSpace(height) {
            if (y + height > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }
        }

        async function addText(text, fontSize, style) {
            const size = fontSize || 11;
            doc.setFontSize(size);
            if (style === 'bold') doc.setFont('helvetica', 'bold');
            else doc.setFont('helvetica', 'normal');

            const lineHeight = size * 0.45;
            const lines = wrapPlainLines(text, PDF_LINE_WRAP_CHARS);
            for (let i = 0; i < lines.length; i++) {
                if (lineCounter % PDF_YIELD_EVERY_LINES === 0) await yieldToUi();
                lineCounter++;
                ensureSpace(lineHeight);
                doc.text(lines[i] || ' ', margin, y);
                y += lineHeight;
            }
            y += 2;
        }

        await addText(resolveExportBasename(data), 16, 'bold');
        y += 2;
        for (const line of buildMetadataLines(data)) {
            await addText(line, 11);
        }
        y += 2;

        if (data.turns.length) {
            await addText('Conversation', 14, 'bold');
            for (const turn of data.turns) {
                await addText(`Turn ${turn.index}: ${turn.label}`, 12, 'bold');
                await addText(turn.text, 11);
                y += 2;
            }
        }

        if (data.currentQuestion || data.currentAnswer) {
            await addText('Current screen (not yet in session memory)', 14, 'bold');
            if (data.currentQuestion) {
                await addText('Question:', 12, 'bold');
                await addText(data.currentQuestion, 11);
            }
            if (data.currentAnswer) {
                await addText(`Answer (${data.primaryName}):`, 12, 'bold');
                await addText(data.currentAnswer, 11);
            }
        }

        if (data.comparison.length) {
            await addText('Other AI responses (latest comparison)', 14, 'bold');
            for (const entry of data.comparison) {
                await addText(entry.name, 12, 'bold');
                await addText(entry.text, 11);
            }
        }

        if (data.bookmarks.length) {
            await addText('Bookmarks', 14, 'bold');
            for (const b of data.bookmarks) {
                const player = b.player ? ` (${b.player})` : '';
                await addText(`${b.concern}${player}`, 12, 'bold');
                if (b.question) await addText(`Question: ${b.question}`, 11);
            }
        }

        await addText('Exported from Claim Clash. AI answers may change over time; verify important claims with primary sources.', 9);

        await yieldToUi();
        const arrayBuffer = doc.output('arraybuffer');
        return new Uint8Array(arrayBuffer);
    }

    function sanitizeFilenameTopic(text) {
        return String(text || 'session')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            .replace(/\s+/g, ' ')
            .trim() || 'session';
    }

    function stripHtmlForTopic(text) {
        return String(text || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
    }


    const EXPORT_NAME_PREFIX = 'ClaimClash';
    const EXPORT_FILENAME_RE = /^ClaimClash v(\d+) (\d{4}-\d{2}-\d{2}) (\d{2}) (.+)$/i;
    const LEGACY_CLAIMS_EXPORT_FILENAME_RE = /^ClaimsClash v(\d+) (\d{4}-\d{2}-\d{2}) (\d{2}) (.+)$/i;
    const LEGACY_EXPORT_FILENAME_RE = /^conv (\d+) - (.+)$/i;

    function formatConvoDayNumber(n) {
        const num = Math.max(1, parseInt(n, 10) || 1);
        return String(num).padStart(2, '0');
    }

    function formatExportVersion(n) {
        const num = Math.max(1, parseInt(n, 10) || 1);
        return 'v' + num;
    }

    function formatTopicForFilename(topic) {
        const raw = sanitizeFilenameTopic(topic);
        if (!raw || raw === 'session') return '[topic]';
        return raw;
    }

    function normalizeTopicKey(topic) {
        return String(topic || '')
            .replace(/^\[|\]$/g, '')
            .trim()
            .toLowerCase();
    }

    function stripPartSuffix(stem) {
        return String(stem || '').replace(/ part \d+ of \d+$/i, '').trim();
    }

    function parseExportFilename(filename) {
        const stem = stripPartSuffix(
            String(filename || '')
                .replace(/\.(md|pdf|docx)$/i, '')
                .trim()
        );
        if (!stem) return null;

        let match = stem.match(EXPORT_FILENAME_RE);
        if (match) {
            return {
                version: parseInt(match[1], 10) || 1,
                date: match[2],
                convo: parseInt(match[3], 10) || 1,
                topic: match[4].trim()
            };
        }

        match = stem.match(LEGACY_CLAIMS_EXPORT_FILENAME_RE);
        if (match) {
            return {
                version: parseInt(match[1], 10) || 1,
                date: match[2],
                convo: parseInt(match[3], 10) || 1,
                topic: match[4].trim()
            };
        }

        match = stem.match(LEGACY_EXPORT_FILENAME_RE);
        if (match) {
            let topic = match[2].trim();
            if (topic.startsWith('[') && topic.endsWith(']')) {
                topic = topic.slice(1, -1).trim() || '[topic]';
            }
            return {
                version: 1,
                date: '',
                convo: parseInt(match[1], 10) || 1,
                topic: topic
            };
        }
        return null;
    }

    function scanFolderForDate(filenames, fileDate) {
        return (filenames || [])
            .map(parseExportFilename)
            .filter(entry => entry && entry.date === fileDate);
    }

    function nextConvoForDate(entries, fileDate) {
        let max = 0;
        entries.forEach(entry => {
            if (entry.date === fileDate && entry.convo > max) max = entry.convo;
        });
        return max + 1;
    }

    function maxVersionForSlot(entries, fileDate, convo, topicKey) {
        let max = 0;
        entries.forEach(entry => {
            if (
                entry.date === fileDate &&
                entry.convo === convo &&
                normalizeTopicKey(entry.topic) === topicKey &&
                entry.version > max
            ) {
                max = entry.version;
            }
        });
        return max;
    }

    function resolveExportNaming(options) {
        const fileDate = options.fileDate || formatFileDate(new Date());
        const topic = options.topic || 'session';
        const topicDisplay = formatTopicForFilename(topic);
        const topicKey = normalizeTopicKey(topicDisplay);
        const entries = scanFolderForDate(options.filenames || [], fileDate);

        let convoNum = options.sessionConvoNum;
        if (!convoNum) {
            convoNum = nextConvoForDate(entries, fileDate);
        }

        const exportVersion = maxVersionForSlot(entries, fileDate, convoNum, topicKey) + 1;

        return {
            convoNum,
            exportVersion,
            topicDisplay,
            fileDate
        };
    }

    function deriveConversationTopic(data) {
        const firstUser = (data.turns || []).find(t => t.role === 'user');
        let raw = firstUser ? firstUser.text : (data.currentQuestion || '');
        raw = stripHtmlForTopic(sanitizeExportText(raw));
        if (!raw) return 'session';
        if (raw.length > 50) {
            let cut = raw.lastIndexOf(' ', 50);
            if (cut < 20) cut = 50;
            raw = raw.slice(0, cut).trim();
        }
        return sanitizeFilenameTopic(raw);
    }

    function resolveExportBasename(data) {
        const version = formatExportVersion(data.exportVersion || 1);
        const date = data.fileDate || formatFileDate(new Date());
        const convo = formatConvoDayNumber(data.convNumber || 1);
        const topic = formatTopicForFilename(data.convTopic || deriveConversationTopic(data));
        return `${EXPORT_NAME_PREFIX} ${version} ${date} ${convo} ${topic}`;
    }

    function buildConvBasename(data) {
        return resolveExportBasename(data);
    }

    function defaultFilename(data, extension) {
        const ext = String(extension || 'md').replace(/^\./, '');
        return `${resolveExportBasename(data)}.${ext}`;
    }

    function previewExportFilename(data, extension) {
        return defaultFilename(data, extension);
    }

    function emailSaveDefaultFilename(data, extension) {
        return defaultFilename(data, extension);
    }

    function formatFilterLabel(format) {
        if (format === 'md') return 'Markdown';
        if (format === 'pdf') return 'PDF';
        if (format === 'docx') return 'Word Document';
        return 'Export';
    }

    async function buildExportBytes(data, format) {
        const fmt = String(format || 'md').toLowerCase();
        if (fmt === 'md') {
            const text = buildMarkdown(data);
            return new TextEncoder().encode(text);
        }
        if (fmt === 'pdf') return buildPdfBytes(data);
        if (fmt === 'docx') return buildDocxBytes(data);
        throw new Error('Unsupported export format: ' + format);
    }

    async function buildExportBytesSafe(data, format, allowFallback) {
        const fmt = String(format || 'md').toLowerCase();
        const run = () => buildExportBytes(data, fmt);
        try {
            const bytes = fmt === 'pdf'
                ? await withBuildTimeout(run, PDF_BUILD_TIMEOUT_MS)
                : await run();
            return { bytes: bytes, formatUsed: fmt, fallback: false };
        } catch (err) {
            if (!allowFallback || fmt === 'md') throw err;
            const bytes = await buildExportBytes(data, 'md');
            return { bytes: bytes, formatUsed: 'md', fallback: true };
        }
    }

    function buildEmailTextBody(data) {
        return buildMarkdown(data);
    }

    function partFilename(data, format, partNum, partCount) {
        const ext = String(format || 'md').replace(/^\./, '');
        return `${buildConvBasename(data)} part ${partNum} of ${partCount}.${ext}`;
    }

    function cloneDataWithTurns(data, turns, includeExtras) {
        return {
            exportedAt: data.exportedAt,
            exportedAtDisplay: data.exportedAtDisplay,
            fileDate: data.fileDate,
            convNumber: data.convNumber,
            convTopic: data.convTopic,
            appVersion: data.appVersion,
            appPhase: data.appPhase,
            rulesVersion: data.rulesVersion,
            mode: data.mode,
            currentPlayer: data.currentPlayer,
            primaryName: data.primaryName,
            turns: turns,
            bookmarks: includeExtras ? data.bookmarks : [],
            currentQuestion: includeExtras ? data.currentQuestion : '',
            currentAnswer: includeExtras ? data.currentAnswer : '',
            comparison: includeExtras ? data.comparison : []
        };
    }

    function splitTextIntoEmailParts(fullText, maxLen, headerText) {
        const header = String(headerText || '').trim();
        const limit = Math.max(500, maxLen - 120);
        const chunks = [];
        let remaining = String(fullText || '').trim();

        if (!remaining) {
            return [{ body: header, partIndex: 0, partCount: 1, partLabel: '' }];
        }

        while (remaining.length > 0) {
            if (remaining.length <= limit) {
                chunks.push(remaining);
                break;
            }
            let cut = remaining.lastIndexOf('\n\n', limit);
            if (cut < limit * 0.4) cut = remaining.lastIndexOf('\n', limit);
            if (cut < limit * 0.4) cut = limit;
            chunks.push(remaining.slice(0, cut).trimEnd());
            remaining = remaining.slice(cut).trimStart();
        }

        const partCount = chunks.length;
        return chunks.map((chunk, index) => {
            const partLabel = partCount > 1 ? `(Part ${index + 1} of ${partCount})` : '';
            const partHeader = partCount > 1
                ? `${header}\r\n\r\nPart ${index + 1} of ${partCount}\r\n\r\n`
                : `${header}\r\n\r\n`;
            return {
                body: partHeader + chunk,
                partIndex: index,
                partCount: partCount,
                partLabel: partLabel
            };
        });
    }

    function planAttachmentParts(data, format) {
        const requestedFormat = String(format || 'md').toLowerCase();
        const turns = data.turns || [];
        const useCharBudget = requestedFormat === 'pdf' || requestedFormat === 'docx';
        const charBudget = useCharBudget ? EMAIL_CHARS_PER_ATTACHMENT_PART : Number.MAX_SAFE_INTEGER;

        if (!turns.length) {
            return [{
                turns: [],
                includeExtras: true,
                partIndex: 0,
                partCount: 1,
                partLabel: '',
                filename: defaultFilename(data, requestedFormat),
                format: requestedFormat
            }];
        }

        const expandedTurns = useCharBudget ? expandTurnsForPlanning(turns, charBudget) : turns;
        const groups = useCharBudget
            ? groupTurnsByCharBudget(expandedTurns, charBudget)
            : [expandedTurns];
        const partCount = groups.length;

        return groups.map((group, index) => ({
            turns: group,
            includeExtras: index === partCount - 1,
            partIndex: index,
            partCount: partCount,
            partLabel: partCount > 1 ? `(Part ${index + 1} of ${partCount})` : '',
            filename: partCount > 1
                ? partFilename(data, requestedFormat, index + 1, partCount)
                : defaultFilename(data, requestedFormat),
            format: requestedFormat
        }));
    }

    async function buildAttachmentPartAtIndex(data, planEntry, maxBytes, onProgress) {
        if (onProgress) onProgress(`Building attachment ${planEntry.partIndex + 1} of ${planEntry.partCount}...`);
        await paintUi();

        const chunkData = cloneDataWithTurns(data, planEntry.turns, planEntry.includeExtras);
        let built = await buildExportBytesSafe(chunkData, planEntry.format, true);

        if (built.bytes.length > maxBytes && planEntry.format !== 'md') {
            if (onProgress) onProgress('Attachment is large. Using Markdown for this part...');
            built = await buildExportBytesSafe(chunkData, 'md', false);
            built.fallback = true;
            planEntry = Object.assign({}, planEntry, {
                filename: planEntry.filename.replace(/\.(pdf|docx)$/i, '.md')
            });
        }

        if (built.bytes.length > maxBytes) {
            throw new Error('This part is still too large for email. Try Text only or export fewer turns.');
        }

        return {
            data: chunkData,
            bytes: built.bytes,
            formatUsed: built.formatUsed,
            fallback: !!built.fallback,
            partIndex: planEntry.partIndex,
            partCount: planEntry.partCount,
            partLabel: planEntry.partLabel,
            filename: built.fallback
                ? planEntry.filename.replace(/\.(pdf|docx)$/i, '.md')
                : planEntry.filename
        };
    }

    window.SessionExport = {
        collectSessionExportData,
        sessionHasExportableContent,
        formatFileDate,
        buildSessionFingerprint,
        buildMarkdown,
        buildFrontmatter,
        buildEmailTextBody,
        buildDocxBytes,
        buildPdfBytes,
        buildExportBytes,
        buildExportBytesSafe,
        planAttachmentParts,
        buildAttachmentPartAtIndex,
        splitTextIntoEmailParts,
        deriveConversationTopic,
        resolveExportBasename,
        resolveExportNaming,
        parseExportFilename,
        buildConvBasename,
        previewExportFilename,
        emailSaveDefaultFilename,
        defaultFilename,
        partFilename,
        formatFilterLabel,
        formatTopicForFilename
    };
})();