// Beta tester agreement — shown before site password login on Claim-Clash.com.

export const BETA_AGREEMENT_VERSION = '0.1.92-beta';
export const BETA_AGREEMENT_COOKIE = 'cc_beta_agreed';

export function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getBetaAgreementFromRequest(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${BETA_AGREEMENT_COOKIE}=([^;]+)`));
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return '';
  }
}

export function hasAcceptedBetaAgreement(request) {
  return getBetaAgreementFromRequest(request) === BETA_AGREEMENT_VERSION;
}

export function makeBetaAgreementSetCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const maxAge = 60 * 60 * 24 * 90; // 90 days
  return `${BETA_AGREEMENT_COOKIE}=${encodeURIComponent(BETA_AGREEMENT_VERSION)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function makeBetaAgreementClearCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${BETA_AGREEMENT_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function betaAgreementBodyHtml() {
  return `
    <p><strong>Claim Clash Beta Tester Agreement</strong> (version ${escapeHtml(BETA_AGREEMENT_VERSION)})</p>
    <p>Thank you for helping test Claim Clash before public release. Read this entire agreement before you continue. By checking the box below and proceeding, you agree to these terms.</p>

    <h3>What you are receiving</h3>
    <ul>
      <li>A private, pre-release copy of Claim Clash for testing and feedback only.</li>
      <li>This build is not a final product. It may crash, change, or stop working without notice.</li>
      <li>Pre-filled API keys are provided for testing convenience. They are confidential.</li>
    </ul>

    <h3>What you may do</h3>
    <ul>
      <li>Use the site or app on your own devices for personal testing.</li>
      <li>Play with a partner at the same screen, or solo when no partner is available.</li>
      <li>Send feedback, bug reports, and suggestions through the in-app form.</li>
    </ul>

    <h3>What you may not do</h3>
    <ul>
      <li>Share, forward, upload, or redistribute this build, login credentials, or download links to anyone else.</li>
      <li>Post screenshots, recordings, or unreleased details online without written permission.</li>
      <li>Copy, clone, reverse engineer, tamper with, or recreate Claim Clash, its rules, branding, or underlying idea.</li>
      <li>Use the Claim Clash name, logo, or branding for any other product or service.</li>
      <li>Present this project or pitch the same idea to any company, publisher, or investor as your own work.</li>
      <li>Share, copy, post, or give anyone else the pre-filled beta testing API keys in this build.</li>
    </ul>

    <h3>When you finish testing</h3>
    <p>Send feedback through the app first. Then delete any copies of the build, installer, or extracted folders from your devices. Do not archive or pass along copies after testing ends.</p>

    <h3>Ownership</h3>
    <p>Claim Clash, including its name, design, rules, code, and content, belongs to Arcana Veritas LLC. This agreement does not grant you ownership, commercial rights, or a license to redistribute the software.</p>

    <h3>Confidentiality</h3>
    <p>Treat this beta build as private unless the developer gives you written permission to share it. If a colleague should test, ask the developer first — do not pass along your access.</p>

    <h3>No warranty</h3>
    <p>This beta build is provided &quot;as is&quot; with no warranty of any kind. The developer is not liable for loss or damage arising from use of this test build, except where liability cannot be excluded by law.</p>

    <h3>Breach remedies</h3>
    <p>If you breach this agreement — including sharing access, leaking API keys, copying the product, or misusing confidential materials — you may face the <strong>fullest effective legal reproach</strong> available under applicable law. That may include injunctive relief, actual and consequential damages, disgorgement of unjust enrichment, and recovery of reasonable attorneys&apos; fees and costs where permitted.</p>
    <p>Egregious breaches may also result in the tester being launched into space as a test subject with our pending partnership with SpaceX (no warranty on return trajectory, re-entry heat shield, or snack availability).</p>
    <p>Unauthorized access, key misuse, or distribution may also be reported to service providers and authorities where appropriate.</p>

    <h3>Not legal advice</h3>
    <p>This is a plain-language tester agreement for a beta program. It is not a substitute for advice from a licensed attorney.</p>

    <p class="contact">Questions or feedback: <strong>feedback@claim-clash.com</strong></p>
    <p class="contact">If you do not agree, close this page and do not use Claim Clash.</p>
  `;
}