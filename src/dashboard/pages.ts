// Flatline — Dashboard & landing page HTML
// Aesthetic: "Carbon Terminal" — same dark developer-tool system as SnapOG
// (src/dashboard/pages.ts in projects/snapog), reused verbatim per
// docs/ui/2026-08-27-flatline-landing-direction.md. Two deliberate additions
// live in this file: `.heartbeat-wrap` (hero visual) and `.step-card` /
// `.walkthrough` (zero-signup alert section) — everything else is the same
// tokens, same class names, same structure as SnapOG's landingPage().

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:      #0A0A0A;
    --surface: #141414;
    --border:  #1F1F1F;
    --divider: #2A2A2A;
    --text-1:  #F5F5F5;
    --text-2:  #A3A3A3;
    --text-3:  #525252;
    --accent:  #F59E0B;
    --accent-dim: #92400E;
    --teal:    #14B8A6;
    --red:     #EF4444;
    --font-mono: 'JetBrains Mono', 'Consolas', monospace;
    --font-sans: 'DM Sans', system-ui, sans-serif;
    --r: 6px;
    --r-lg: 12px;
    --shadow: 0 0 0 1px var(--border);
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text-1);
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.6;
    min-height: 100vh;
    /* Dot-grid background */
    background-image: radial-gradient(circle, #1F1F1F 1px, transparent 1px);
    background-size: 32px 32px;
  }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Nav */
  .nav {
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 32px;
    background: rgba(10,10,10,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .nav-logo {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 18px;
    color: var(--text-1);
    letter-spacing: -0.02em;
  }
  .nav-logo span { color: var(--accent); }
  .nav-links { display: flex; gap: 24px; align-items: center; }
  .nav-links a { color: var(--text-2); font-size: 14px; }
  .nav-links a:hover { color: var(--text-1); text-decoration: none; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 13px; font-weight: 500;
    padding: 8px 20px; border-radius: var(--r);
    border: none; cursor: pointer; transition: all 0.15s;
    text-decoration: none;
  }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-primary:hover { background: #FBBF24; text-decoration: none; }
  .btn-ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); text-decoration: none; }

  /* Container */
  .container { max-width: 900px; margin: 0 auto; padding: 0 24px; }
  .container-wide { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

  /* Hero */
  .hero { padding: 100px 0 72px; text-align: center; position: relative; }
  .hero-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--font-mono); font-size: 12px; color: var(--accent);
    letter-spacing: 0.1em; text-transform: uppercase;
    border: 1px solid var(--accent-dim); border-radius: 100px;
    padding: 4px 14px; margin-bottom: 28px;
  }
  .hero-eyebrow::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent); animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }
  .hero h1 {
    font-size: clamp(42px, 6vw, 72px);
    font-weight: 700; letter-spacing: -0.04em;
    line-height: 1.05;
    background: linear-gradient(135deg, #F5F5F5 0%, #A3A3A3 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 24px;
  }
  .hero h1 em {
    font-style: normal;
    background: linear-gradient(135deg, var(--accent), #FCD34D);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .hero-sub {
    font-size: 18px; color: var(--text-2); max-width: 560px; margin: 0 auto 40px;
    line-height: 1.65;
  }
  .hero-cta { display: flex; gap: 12px; justify-content: center; }

  /* OG-preview-style wrap, reused for the hero visual frame */
  .og-preview-wrap {
    position: relative; margin: 72px auto 0; max-width: 720px;
    border-radius: var(--r-lg); overflow: hidden;
    box-shadow: 0 0 0 1px var(--border), 0 40px 80px rgba(0,0,0,0.6);
  }
  .og-preview-label {
    position: absolute; top: 12px; left: 12px;
    font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
    background: var(--surface); border: 1px solid var(--border);
    padding: 4px 10px; border-radius: var(--r);
    z-index: 2;
  }

  /* Heartbeat hero visual (Flatline addition — no static artifact to show
     here, so the visual has to *be* the product metaphor in motion) */
  .heartbeat-wrap {
    position: relative;
    height: 200px;
    background: var(--surface);
    display: flex; align-items: center; justify-content: center;
  }
  .heartbeat-wrap svg { width: 100%; height: 100%; display: block; }
  .heartbeat-beat {
    fill: none;
    stroke: var(--teal);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
    animation: heartbeat-draw 6s linear infinite;
  }
  .heartbeat-flat {
    fill: none;
    stroke: var(--red);
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0;
    animation: heartbeat-flatline 6s linear infinite;
  }
  @keyframes heartbeat-draw {
    0%   { stroke-dashoffset: 1000; opacity: 1; }
    58%  { stroke-dashoffset: 0;    opacity: 1; }
    66%  { stroke-dashoffset: 0;    opacity: 0; }
    100% { stroke-dashoffset: 0;    opacity: 0; }
  }
  @keyframes heartbeat-flatline {
    0%, 62% { opacity: 0; }
    70%     { opacity: 1; }
    98%     { opacity: 1; }
    100%    { opacity: 0; }
  }
  .heartbeat-alert-badge {
    position: absolute;
    top: 16px; right: 16px;
    font-family: var(--font-mono); font-size: 11px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--red);
    background: #1C0A0A; border: 1px solid #7F1D1D;
    padding: 5px 12px; border-radius: 100px;
    opacity: 0;
    animation: heartbeat-badge 6s linear infinite;
  }
  @keyframes heartbeat-badge {
    0%, 66%  { opacity: 0; transform: translateY(-4px); }
    74%, 96% { opacity: 1; transform: translateY(0); }
    100%     { opacity: 0; transform: translateY(-4px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .heartbeat-beat, .heartbeat-flat, .heartbeat-alert-badge { animation: none; }
    .heartbeat-beat { stroke-dashoffset: 0; opacity: 0; }
    .heartbeat-flat, .heartbeat-alert-badge { opacity: 1; }
  }

  /* Section */
  .section { padding: 80px 0; }
  .section-title {
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    color: var(--accent); letter-spacing: 0.12em; text-transform: uppercase;
    margin-bottom: 12px;
  }
  .section-h2 {
    font-size: 36px; font-weight: 700; letter-spacing: -0.025em;
    margin-bottom: 16px; line-height: 1.15;
  }
  .section-sub { font-size: 17px; color: var(--text-2); max-width: 480px; line-height: 1.6; }

  /* Code block */
  .code-block {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); overflow: hidden; margin-top: 32px;
  }
  .code-block-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px; border-bottom: 1px solid var(--border);
  }
  .code-block-lang {
    font-family: var(--font-mono); font-size: 12px; color: var(--text-3);
    letter-spacing: 0.06em;
  }
  .code-block-dots { display: flex; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot-red { background: #FF5F57; }
  .dot-yellow { background: #FEBC2E; }
  .dot-green { background: #28C840; }
  .code-block pre {
    padding: 24px 20px; font-family: var(--font-mono); font-size: 13px;
    line-height: 1.7; color: var(--text-1); overflow-x: auto;
    white-space: pre;
  }
  .c-comment { color: var(--text-3); }
  .c-key { color: var(--teal); }
  .c-val { color: #86EFAC; }
  .c-str { color: #FCD34D; }
  .c-url { color: var(--accent); }

  /* API params table */
  .params-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  .params-table th, .params-table td {
    padding: 12px 16px; text-align: left;
    border-bottom: 1px solid var(--border); font-size: 14px;
  }
  .params-table th {
    font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .params-table td:first-child { font-family: var(--font-mono); color: var(--teal); }
  .params-table .required {
    font-family: var(--font-mono); font-size: 10px; color: var(--accent);
    border: 1px solid var(--accent-dim); border-radius: 3px; padding: 1px 6px;
  }
  .params-table .optional {
    font-family: var(--font-mono); font-size: 10px; color: var(--text-3);
    border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px;
  }

  /* Zero-signup walkthrough (Flatline addition) */
  .walkthrough { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 48px; }
  .step-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); padding: 28px;
  }
  .step-card .step-label {
    font-family: var(--font-mono); font-size: 11px; color: var(--accent);
    letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 16px;
    display: block;
  }
  .step-card h3 { font-size: 17px; font-weight: 600; margin-bottom: 10px; }
  .step-card p { font-size: 14px; color: var(--text-2); line-height: 1.7; }
  .step-card .btn { margin-top: 18px; }

  /* Pricing */
  .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 48px; }
  .pricing-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); padding: 32px;
    display: flex; flex-direction: column;
    transition: border-color 0.2s;
  }
  .pricing-card:hover { border-color: var(--accent); }
  .pricing-card.featured {
    border-color: var(--accent);
    background: linear-gradient(180deg, #1C1400 0%, var(--surface) 100%);
  }
  .pricing-tier {
    font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
    letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 16px;
  }
  .pricing-tier-featured { color: var(--accent); }
  .pricing-price {
    font-size: 40px; font-weight: 700; letter-spacing: -0.03em;
    margin-bottom: 4px; line-height: 1;
  }
  .pricing-period { font-size: 14px; color: var(--text-2); margin-bottom: 24px; }
  .pricing-limit {
    font-family: var(--font-mono); font-size: 13px; color: var(--text-2);
    margin-bottom: 20px; padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  .pricing-features { list-style: none; flex: 1; }
  .pricing-features li {
    font-size: 14px; color: var(--text-2); padding: 6px 0;
    display: flex; gap: 8px; align-items: flex-start;
  }
  .pricing-features li::before { content: '→'; color: var(--accent); flex-shrink: 0; }
  .pricing-features li.dim::before { color: var(--text-3); }
  .pricing-features li.dim { color: var(--text-3); }
  .pricing-cta { margin-top: 28px; }

  /* Features grid */
  .features-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 48px; }
  .feature-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); padding: 28px;
  }
  .feature-icon {
    font-family: var(--font-mono); font-size: 20px; color: var(--accent);
    margin-bottom: 16px; display: block;
  }
  .feature-card h3 { font-size: 17px; font-weight: 600; margin-bottom: 8px; }
  .feature-card p { font-size: 14px; color: var(--text-2); line-height: 1.6; }

  /* Footer */
  .footer {
    border-top: 1px solid var(--border); padding: 32px 0;
    text-align: center; font-size: 13px; color: var(--text-3);
    font-family: var(--font-mono);
  }

  /* FAQ */
  .faq-list { margin-top: 40px; display: flex; flex-direction: column; }
  .faq-item { padding: 24px 0; border-bottom: 1px solid var(--border); }
  .faq-item:first-child { border-top: 1px solid var(--border); }
  .faq-q {
    font-family: var(--font-mono); font-size: 15px; font-weight: 500;
    color: var(--text-1); margin-bottom: 10px; display: flex; gap: 10px;
  }
  .faq-q::before { content: 'Q.'; color: var(--accent); flex-shrink: 0; }
  .faq-a { font-size: 14px; color: var(--text-2); line-height: 1.65; padding-left: 26px; }
  .faq-a code {
    font-family: var(--font-mono); font-size: 13px; color: var(--teal);
    background: var(--surface); padding: 1px 6px; border-radius: 4px;
  }

  /* Honesty callout */
  .callout {
    margin-top: 24px; padding: 16px 20px;
    background: var(--surface); border: 1px solid var(--border);
    border-left: 2px solid var(--accent); border-radius: var(--r);
    font-size: 13px; color: var(--text-2); line-height: 1.6;
  }
  .callout strong { color: var(--text-1); }

  @media (max-width: 768px) {
    .pricing-grid { grid-template-columns: 1fr; }
    .features-grid { grid-template-columns: 1fr; }
    .walkthrough { grid-template-columns: 1fr; }
    .hero h1 { font-size: 36px; }
  }
`;

function layout(title: string, body: string, extraHead = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Flatline</title>
  <meta name="description" content="Dead man's switch monitoring for cron jobs and background tasks. Ping after every run — hear from us only when it stops. Hosted on Cloudflare Workers." />
  <style>${CSS}</style>
  ${extraHead}
</head>
<body>
  ${body}
</body>
</html>`;
}

function nav(): string {
  return `
  <nav class="nav">
    <a class="nav-logo" href="/">Flat<span>line</span></a>
    <div class="nav-links">
      <a href="/#how-it-works">How it works</a>
      <a href="/#pricing">Pricing</a>
      <a href="/register" class="btn btn-primary">Get Free API Key →</a>
    </div>
  </nav>`;
}

function footer(): string {
  return `
  <footer class="footer">
    <div class="container">
      flatline.dev — dead man's switch monitoring for cron jobs, on Cloudflare Workers.
      Also building <a href="https://snapog.dev">SnapOG</a> — OG image API for the same kind of side project.
    </div>
  </footer>`;
}

export function landingPage(host: string): string {
  const body = `
  ${nav()}

  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <div class="hero-eyebrow">Cron / Heartbeat Monitoring</div>
      <h1>We watch your heartbeat.<br/>You only hear from us when it <em>stops</em>.</h1>
      <p class="hero-sub">
        Flatline pings your cron job's schedule, not the other way around. Add one line to your job —
        <code style="font-family:var(--font-mono);font-size:0.9em;color:var(--teal);">curl flatline.dev/ping/:id</code>
        — and if it doesn't check in on time, we fire a webhook. That's the whole integration.
      </p>
      <div class="hero-cta">
        <a href="/register" class="btn btn-primary" style="font-size:15px;padding:12px 28px;">Get Free API Key</a>
        <a href="/#get-alerted" class="btn btn-ghost" style="font-size:15px;padding:12px 28px;">See how alerts work ↓</a>
      </div>
      <p style="font-size:13px;color:var(--text-3);margin-top:20px;font-family:var(--font-mono);">Free tier, no credit card. 25 checks, forever.</p>

      <!-- Heartbeat-to-flatline hero visual -->
      <div class="og-preview-wrap heartbeat-wrap">
        <div class="og-preview-label">Live check status — looped demo</div>
        <div class="heartbeat-alert-badge">Alert sent</div>
        <svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label="Animation of a steady heartbeat line flatlining and triggering an alert">
          <path class="heartbeat-beat" pathLength="1000"
            d="M0,100 L70,100 L90,60 L110,150 L130,30 L150,100 L230,100 L250,60 L270,150 L290,30 L310,100 L390,100 L410,60 L430,150 L450,30 L470,100 L600,100" />
          <path class="heartbeat-flat" pathLength="1000" d="M0,100 L600,100" />
        </svg>
      </div>
    </div>
  </section>

  <!-- How it works -->
  <section class="section" id="how-it-works">
    <div class="container">
      <p class="section-title">How it works</p>
      <h2 class="section-h2">Ping after every run. Silence does the alerting.</h2>
      <p class="section-sub">
        Cron jobs fail silently — the schedule doesn't know when the script died, and neither do you,
        until someone notices stale data days later. Flatline flips the direction: your job pings us
        when it finishes, and if a ping doesn't arrive on schedule, that absence is the signal. One
        <code style="font-family:var(--font-mono);font-size:0.9em;color:var(--teal);">curl</code> at
        the end of your script, one webhook when it goes quiet.
      </p>

      <div class="code-block" style="margin-top:36px;">
        <div class="code-block-header">
          <div class="code-block-dots">
            <div class="dot dot-red"></div>
            <div class="dot dot-yellow"></div>
            <div class="dot dot-green"></div>
          </div>
          <span class="code-block-lang">crontab</span>
        </div>
        <pre><span class="c-comment"># after every run of your job — success or failure, this line just reports "I ran"</span>
0 3 * * * /usr/local/bin/backup.sh &amp;&amp; <span class="c-key">curl</span> -fsS <span class="c-url">https://${host}/ping/</span><span class="c-str">YOUR_CHECK_ID</span>

<span class="c-comment"># GET works too — no body, no auth header, the id itself is the credential</span>
<span class="c-url">GET https://${host}/ping/YOUR_CHECK_ID</span>

<span class="c-comment">← 200 OK  {"ok":true,"status":"up","check_id":"YOUR_CHECK_ID"}</span></pre>
      </div>

      <h3 style="font-size:18px;font-weight:600;margin:48px 0 20px;letter-spacing:-0.01em;">Create a check</h3>
      <div class="code-block">
        <div class="code-block-header">
          <div class="code-block-dots">
            <div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div>
          </div>
          <span class="code-block-lang">HTTP POST</span>
        </div>
        <pre><span class="c-key">curl</span> -X POST <span class="c-url">https://${host}/checks</span> \\
  -H <span class="c-str">"Authorization: Bearer YOUR_API_KEY"</span> \\
  -H <span class="c-str">"Content-Type: application/json"</span> \\
  -d <span class="c-str">'{"name":"Nightly backup","period_seconds":300,"webhook_url":"https://your.app/hooks/flatline"}'</span>

<span class="c-comment">← 201 Created  {"check":{"id":"...","ping_url":"https://${host}/ping/..."}}</span></pre>
      </div>

      <table class="params-table">
        <thead>
          <tr>
            <th>Param</th><th>Type</th><th>Required</th><th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>name</td><td>string</td><td><span class="required">required</span></td><td>What you're monitoring, e.g. "Nightly backup"</td></tr>
          <tr><td>period_seconds</td><td>integer</td><td><span class="required">required</span></td><td>How often the job is expected to ping. Floor depends on your tier.</td></tr>
          <tr><td>grace_seconds</td><td>integer</td><td><span class="optional">optional</span></td><td>Buffer before a late ping counts as down. Defaults to <code>period_seconds</code>.</td></tr>
          <tr><td>webhook_url</td><td>string</td><td><span class="optional">optional</span></td><td>Where Flatline <code>POST</code>s the alert JSON when status changes.</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Get alerted without an account -->
  <section class="section" id="get-alerted" style="padding-top:0;">
    <div class="container">
      <p class="section-title">Alerts, zero setup</p>
      <h2 class="section-h2">No Slack workspace? No problem — get pinged on your phone in under a minute.</h2>
      <p class="section-sub" style="max-width:640px;">
        Flatline only speaks webhook — no email/SMS yet. That's fine if you already have Slack wired
        up. If you don't, here are two paths that take less time than reading this paragraph.
      </p>

      <div class="walkthrough">
        <div class="step-card">
          <span class="step-label">Card A — Discord (2 min)</span>
          <h3>Push notifications, no code</h3>
          <p>
            1. Server Settings → Integrations → Webhooks → New Webhook → Copy URL.
            2. Paste it as this check's Alert Webhook.
            3. Enable push notifications for that channel in the Discord app.
            Done — a flatline pings your phone like a DM.
          </p>
        </div>
        <div class="step-card">
          <span class="step-label">Card B — Email via Zapier (2 min)</span>
          <h3>Prefer email? Use the template</h3>
          <p>Use our pre-built template: Flatline Webhook → Email. Connect your inbox, done — no code.</p>
          <a href="/zapier-template" class="btn btn-ghost">Use the Zapier template →</a>
        </div>
      </div>

      <div class="callout">
        Slack and IFTTT work the same way — anything that accepts a JSON POST can catch a Flatline alert.
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="section" style="padding-top:0;">
    <div class="container">
      <p class="section-title">Why Flatline</p>
      <h2 class="section-h2">Set it up once. Forget about it until it matters.</h2>
      <div class="features-grid">
        <div class="feature-card">
          <span class="feature-icon">⏱</span>
          <h3>One curl line</h3>
          <p>No SDK, no agent to install. Add a single <code style="font-family:var(--font-mono);font-size:0.9em;color:var(--teal);">curl</code> to the end of your job and you're monitored.</p>
        </div>
        <div class="feature-card">
          <span class="feature-icon">⏳</span>
          <h3>Grace periods, not false alarms</h3>
          <p>Every check has a configurable grace window, so a job running a few seconds late doesn't page you at 3am.</p>
        </div>
        <div class="feature-card">
          <span class="feature-icon">🔔</span>
          <h3>Webhook alerts</h3>
          <p>One outbound POST to any URL — Slack, Discord, Zapier, or your own endpoint. Payload is Slack-compatible out of the box.</p>
        </div>
        <div class="feature-card">
          <span class="feature-icon">📈</span>
          <h3>30-day history + dashboard</h3>
          <p>Every up/down transition is recorded and visible in a clean dashboard, so you can see patterns, not just the latest alert.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section class="section" id="pricing">
    <div class="container">
      <p class="section-title">Pricing</p>
      <h2 class="section-h2">Start free. Scale as your jobs multiply.</h2>
      <div class="pricing-grid">

        <div class="pricing-card">
          <p class="pricing-tier">Free</p>
          <p class="pricing-price">$0</p>
          <p class="pricing-period">forever</p>
          <p class="pricing-limit">25 checks · 5-min minimum interval</p>
          <ul class="pricing-features">
            <li>Webhook alerts</li>
            <li>30-day history</li>
            <li>Dashboard</li>
          </ul>
          <div class="pricing-cta">
            <a href="/register" class="btn btn-ghost" style="width:100%;">Get started →</a>
          </div>
        </div>

        <div class="pricing-card featured">
          <p class="pricing-tier pricing-tier-featured">⚡ Pro — most popular</p>
          <p class="pricing-price" style="color:var(--accent);">$9</p>
          <p class="pricing-period">per month</p>
          <p class="pricing-limit" style="color:var(--accent);">100 checks · 1-min minimum interval</p>
          <ul class="pricing-features">
            <li>Everything in Free</li>
            <li>Faster checks (1-min floor)</li>
            <li>Priority sweep</li>
          </ul>
          <div class="pricing-cta">
            <a href="/register?tier=pro" class="btn btn-primary" style="width:100%;">Start Pro →</a>
          </div>
        </div>

        <div class="pricing-card">
          <p class="pricing-tier">Business</p>
          <p class="pricing-price">$29</p>
          <p class="pricing-period">per month</p>
          <p class="pricing-limit">1,000 checks · 1-min minimum interval</p>
          <ul class="pricing-features">
            <li>Everything in Pro</li>
            <li>Higher check limits</li>
          </ul>
          <div class="pricing-cta">
            <a href="mailto:hello@flatline.dev" class="btn btn-ghost" style="width:100%;">Contact us →</a>
          </div>
        </div>

      </div>

      <div class="callout">
        <strong>One honest note</strong>: free-tier checks have a 5-minute floor, not 1-minute — that's
        what keeps monitoring free without turning free accounts into a surprise Cloudflare bill. Need
        faster checks? Pro and Business both drop to a 1-minute floor.
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="section" style="padding-top:0;">
    <div class="container">
      <p class="section-title">FAQ</p>
      <h2 class="section-h2">Questions worth answering upfront</h2>
      <div class="faq-list">
        <div class="faq-item">
          <p class="faq-q">What counts as "down"?</p>
          <p class="faq-a">A check flips from <code>up</code> to <code>down</code> the moment our sweep — which runs every minute — finds no ping since <code>period_seconds + grace_seconds</code> after the last ping (or after the check was created, if it's never been pinged). That transition is exactly when the webhook fires.</p>
        </div>
        <div class="faq-item">
          <p class="faq-q">How do grace periods work?</p>
          <p class="faq-a"><code>grace_seconds</code> is a buffer on top of <code>period_seconds</code> — a job expected every 5 minutes with a 60s grace won't alert until 6 minutes of silence. If you don't set one, it defaults to <code>period_seconds</code>, so a job that's merely as-late-as-itself doesn't page you.</p>
        </div>
        <div class="faq-item">
          <p class="faq-q">What does the webhook payload look like?</p>
          <p class="faq-a">A JSON <code>POST</code> with <code>check_id</code>, <code>check_name</code>, <code>status</code>, <code>previous_status</code>, <code>occurred_at</code>, and a human-readable <code>message</code> — plus a top-level <code>text</code> field, which makes the payload usable as a Slack incoming webhook with zero transformation.</p>
        </div>
        <div class="faq-item">
          <p class="faq-q">What happens when I hit my check limit?</p>
          <p class="faq-a">Creating a new check returns a <code>429</code> naming your tier and limit. Existing checks keep monitoring and alerting normally — the ceiling only blocks adding more, it never silently drops coverage you already have.</p>
        </div>
        <div class="faq-item">
          <p class="faq-q">How do I get an API key?</p>
          <p class="faq-a">Register with just an email at <code>/register</code> — no credit card for the free tier, key is issued immediately. Upgrading to Pro or Business happens from your dashboard.</p>
        </div>
      </div>
    </div>
  </section>

  ${footer()}

  <script>
    // Copy to clipboard helper
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy || '');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  </script>`;

  return layout('Dead man’s switch monitoring for cron jobs', body);
}
