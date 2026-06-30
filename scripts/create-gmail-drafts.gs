/**
 * Claim Clash — Create Gmail outreach drafts (one-time run)
 *
 * SETUP (2 minutes):
 * 1. Open https://script.google.com/home
 * 2. New project → paste this entire file
 * 3. Left sidebar: Services (+) → add "Gmail API" (v1) if createDraftNoRecipient fails;
 *    OR just run createClaimClashDrafts() which uses GmailApp
 * 4. Run createClaimClashDrafts → authorize Gmail when prompted
 * 5. Open Gmail → Drafts — 10 templates ready; replace add-recipient@example.com in To:
 *
 * Safe to re-run: deletes prior [CC Draft] drafts first (optional).
 */

var PLACEHOLDER_TO = 'add-recipient@example.com';

var SIGNATURE =
  'Zachary H. Roberts\n' +
  'Creator, Claim Clash (Windows)\n' +
  'ClaimsClashFeedback@gmail.com\n\n' +
  'P.S. If this isn\'t your world, no worries — a forward to a teacher, debate coach, or librarian would mean a lot.';

var SIGNATURE_FORMAL =
  'Zachary H. Roberts\n' +
  'Creator, Claim Clash (Windows)\n' +
  'ClaimsClashFeedback@gmail.com\n\n' +
  'P.S. Happy to align language with your grant reporting needs.';

function createClaimClashDrafts() {
  removeOldClaimClashDrafts();

  var templates = getTemplates();
  var count = 0;

  templates.forEach(function (t) {
    GmailApp.createDraft(PLACEHOLDER_TO, t.subject, t.body);
    count++;
  });

  Logger.log('Created ' + count + ' drafts. Open Gmail → Drafts. Replace To: on each.');
}

function removeOldClaimClashDrafts() {
  var drafts = GmailApp.getDrafts();
  var removed = 0;
  drafts.forEach(function (draft) {
    var msg = draft.getMessage();
    var subj = msg.getSubject() || '';
    if (subj.indexOf('[CC Draft]') === 0) {
      draft.deleteDraft();
      removed++;
    }
  });
  if (removed > 0) {
    Logger.log('Removed ' + removed + ' old [CC Draft] drafts.');
  }
}

function getTemplates() {
  return [
    {
      tag: 'A — Friends & family',
      subject: '[CC Draft] Would you try something I built? (15 min, two players)',
      body:
        'Hi [FIRST NAME],\n\n' +
        'I\'ve been building something called Claim Clash — a Windows game for two people at one screen. You take turns asking evidence-based questions about a real topic while a shared AI helps you see what\'s actually known. It\'s not about winning an argument; it\'s about building a clearer picture together.\n\n' +
        'I\'m testing an early version and could really use your honest take. Would you and [SPOUSE/FRIEND NAME / someone you trust] sit down for about 15 minutes this week?\n\n' +
        'What I\'d need:\n' +
        '  • Windows 10 or 11\n' +
        '  • Two people willing to alternate turns (that\'s the whole point)\n' +
        '  • Quick feedback afterward — even "this confused me" helps\n\n' +
        'If you\'re up for it, reply and I\'ll send the download link and a 3-step start guide. Windows may show a SmartScreen warning (unsigned app) — I\'ll walk you through it.\n\n' +
        '[Optional personal line: e.g., "I know we\'ve had our share of [topic] conversations — this is partly my answer to that."]\n\n' +
        'Thanks for considering it.\n\n' +
        SIGNATURE
    },
    {
      tag: 'B — General contacts',
      subject: '[CC Draft] Quick favor — know anyone who teaches civics or debate?',
      body:
        'Hi [FIRST NAME],\n\n' +
        'Hope you\'re doing well. I\'m reaching out because I\'m finishing an early version of Claim Clash — a two-player Windows game for structured, evidence-based conversation about real-world claims (with AI as a thinking tool, not an oracle).\n\n' +
        'I\'m looking for:\n' +
        '  • People who\'d play one 15-minute round with a partner and give blunt feedback, OR\n' +
        '  • An intro to a teacher, debate coach, librarian, or anyone who runs discussion groups\n\n' +
        'Built for two players at one screen — couples, classmates, friends — with optional classroom grade-level settings.\n\n' +
        'If you\'d try it yourself, say the word and I\'ll send details. If someone else comes to mind, I\'d be grateful for an intro email.\n\n' +
        SIGNATURE
    },
    {
      tag: 'C — Teachers',
      subject: '[CC Draft] Free classroom pilot — two-player civics inquiry tool (Windows)',
      body:
        'Hi [FIRST NAME],\n\n' +
        'I\'m Zachary Roberts, creator of Claim Clash — a Windows desktop activity built for two students at one screen. Team A and Team B take turns asking evidence-based questions; a shared AI responds; students can compare how different models answer the same question.\n\n' +
        'It aligns with inquiry-style civics (C3-ish): claims, evidence, steelmanning the other side, media literacy — without gamifying partisan "winning."\n\n' +
        'Optional grade-level settings map US and international grades to age-appropriate AI vocabulary.\n\n' +
        'I\'m offering a free 60-day classroom pilot (no cost, feedback requested):\n' +
        '  • One 45-minute paired session (laptop + two students)\n' +
        '  • You choose topic — I can suggest a neutral prompt\n' +
        '  • Students export a short session summary if useful for your files\n\n' +
        'Would [SCHOOL NAME] have room for a pilot this [MONTH]? Happy to send a one-page facilitator guide and the installer.\n\n' +
        'Thank you for the work you do with students.\n\n' +
        SIGNATURE
    },
    {
      tag: 'D — Debate coaches',
      subject: '[CC Draft] Built for two — evidence drill your debaters might enjoy',
      body:
        'Hi Coach [LAST NAME / FIRST NAME],\n\n' +
        'I built Claim Clash for exactly the rhythm debate teams already use: two sides, alternating turns, evidence over slogans. It\'s a Windows app where Team A and Team B question a shared AI about a real claim, steelman the opposing line, and optionally compare multiple AI answers on the same ask.\n\n' +
        'I\'m not pitching it as a replacement for tournament prep — more a structured scrimmage for:\n' +
        '  • Evidence framing\n' +
        '  • Steelman before attack\n' +
        '  • AI literacy (how models differ on identical prompts)\n\n' +
        'Would your squad try one 20-minute paired round at practice? I\'ll provide the build, checksum, and a short coach note. Feedback to ClaimsClashFeedback@gmail.com or reply here.\n\n' +
        'If [SCHOOL/CLUB] isn\'t the right fit, I\'d appreciate a forward to another coach.\n\n' +
        SIGNATURE
    },
    {
      tag: 'E — Libraries & community',
      subject: '[CC Draft] Program idea — "Bridge conversations" night for two participants',
      body:
        'Hi [FIRST NAME],\n\n' +
        'I\'m developing Claim Clash, a Windows program for paired evidence-based discussion — two people, one screen, taking turns exploring a public topic with AI assistance (keys stay local on the device).\n\n' +
        'I think it could work as a library or community program:\n' +
        '  • 60–90 min workshop\n' +
        '  • Pairs or bring-a-partner\n' +
        '  • Neutral facilitation script I provide\n' +
        '  • Cast to a room display optional (same Wi-Fi)\n\n' +
        'Looking for one site willing to pilot [MONTH]. No fee for pilot; I need participant feedback and permission to quote the program (anonymous if preferred).\n\n' +
        'Does [ORG NAME] run anything like teen civics, media literacy, or community dialogue events?\n\n' +
        SIGNATURE
    },
    {
      tag: 'F — Nonprofit / partnership',
      subject: '[CC Draft] Partnership inquiry — two-player democratic inquiry tool (pilot)',
      body:
        'Dear [FIRST NAME / Team],\n\n' +
        'Claim Clash is a Windows application for structured two-player inquiry into public claims — steelmanning, evidence focus, multi-AI comparison, and optional US/international grade mapping for classrooms.\n\n' +
        'I\'m exploring partnerships with organizations that strengthen civic discourse and media literacy. A pilot could look like:\n' +
        '  • 10–20 paired sessions through your existing programs\n' +
        '  • Facilitator guide + exports for light evaluation\n' +
        '  • Co-branded feedback for grant or program reporting\n\n' +
        'I\'m an independent creator ([CITY/STATE if comfortable]) and can work under MOU, fiscal sponsorship, or classroom license structure.\n\n' +
        'Would [ORG NAME] have 20 minutes for a call, or is there a program officer I should contact?\n\n' +
        'Brief overview available on request.\n\n' +
        'Respectfully,\n\n' +
        SIGNATURE_FORMAL
    },
    {
      tag: 'G — Podcasters / creators',
      subject: '[CC Draft] On-air demo idea — two hosts, one question, three AIs',
      body:
        'Hi [FIRST NAME],\n\n' +
        'I\'ve followed [SPECIFIC SHOW/ARTICLE — required personalization]. Claim Clash might be a segment you\'d find interesting: two people at one screen take turns asking evidence-based questions about a live topic while AI answers — then compare how different models respond to the same prompt.\n\n' +
        'Built for conversation, not hot takes. Windows app; Cast to TV for studio display.\n\n' +
        'If you ever want a low-prep demo segment ("let\'s actually look it up together"), I\'ll set you up with a build and a suggested 10-minute flow. No pressure on coverage — demo only.\n\n' +
        SIGNATURE
    },
    {
      tag: 'H — Former colleagues',
      subject: '[CC Draft] Something new I\'m building — intros welcome',
      body:
        'Hi [FIRST NAME],\n\n' +
        'It\'s been a while since [COMPANY/PROJECT/CONTEXT]. I wanted to share what I\'ve been working on: Claim Clash — a Windows tool for two people to explore polarizing topics through structured, evidence-based questions and a shared AI.\n\n' +
        'I\'m in alpha and talking to teachers, debate programs, and community orgs. Two asks:\n\n' +
        '1) Would you and someone you trust try a 15-minute session and tell me what\'s broken?\n\n' +
        '2) Do you know anyone in education, libraries, or civic nonprofits I should speak with? Happy to make it a warm intro.\n\n' +
        'Thanks for reading — hope work is treating you well at [THEIR COMPANY if known].\n\n' +
        SIGNATURE
    },
    {
      tag: 'I — Follow-up (no reply)',
      subject: '[CC Draft] Re: [ORIGINAL SUBJECT] — still interested?',
      body:
        'Hi [FIRST NAME],\n\n' +
        'Just bumping this in case it got buried. No pressure at all — if timing\'s bad, a "not now" is helpful too.\n\n' +
        'Short version: Claim Clash = two players, one screen, evidence-based turns with AI. I\'m looking for [one pilot / one paired test / an intro to X].\n\n' +
        'Still happy to send the 3-step guide if useful.\n\n' +
        SIGNATURE
    },
    {
      tag: 'J — They said yes (send link)',
      subject: '[CC Draft] Claim Clash alpha — download + 3 steps',
      body:
        'Hi [FIRST NAME],\n\n' +
        'Thank you — this helps more than you know.\n\n' +
        'DOWNLOAD\n' +
        '  [INSERT YOUR GOOGLE DRIVE / RELEASE LINK]\n' +
        '  File: Claim Clash 0.1.81 Alpha - Drive.zip\n' +
        '  Please extract before running (not from inside the zip).\n\n' +
        '3 STEPS\n' +
        '  1. Read ALPHA-TESTER-AGREEMENT.txt in the zip\n' +
        '  2. Run the .exe — if SmartScreen appears: More info → Run anyway\n' +
        '  3. Welcome screen → Next → two players pick Team A/B → Ask → Follow Up → Feedback button when done\n\n' +
        'BEST TEST\n' +
        '  • Two people, ~15 minutes, one topic you both actually care about\n' +
        '  • Try Follow Up at least twice so turns alternate\n\n' +
        'FEEDBACK\n' +
        '  • In-app Feedback button, or email ClaimsClashFeedback@gmail.com\n' +
        '  • If you tried solo, note that — but pairs are the priority\n\n' +
        'I\'m here if anything won\'t launch. Thank you again.\n\n' +
        SIGNATURE
    }
  ];
}