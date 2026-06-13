// Public event submission, behind Cloudflare Turnstile. The browser posts the
// submission row plus a Turnstile token here; this function verifies the token,
// inserts the row server-side (so the submissions table no longer needs a
// public INSERT policy), and fires the confirmation + admin emails.
//
// Pages project secrets / vars this reads:
//   TURNSTILE_SECRET_KEY        Cloudflare Turnstile secret (REQUIRED to enforce
//                               bot protection; if unset, verification is skipped
//                               with a warning so the form keeps working)
//   SUPABASE_SERVICE_ROLE_KEY   server-only key used for the insert (REQUIRED once
//                               the public INSERT RLS policy is dropped; falls back
//                               to the public anon key while that policy still exists)
//   RESEND_API_KEY              Resend key for the emails (see _email.js)
//   SUPABASE_URL                default 'https://avxlexkqcxamixyhyxcd.supabase.co'
//   NOTIFY_FROM_EMAIL / NOTIFY_ADMIN_EMAIL / ADMIN_BASE_URL  (see _email.js)

import { clip, sendSubmissionEmails } from './_email.js';

const SUPABASE_URL_DEFAULT = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const SUPABASE_ANON_DEFAULT = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const MAX_BODY_BYTES = 6 * 1024 * 1024; // generous room for a base64 image data URL

// Columns the public form is allowed to set. Everything else (status, the
// approval/publish timestamps, created_at) is owned by the server or the DB.
const ALLOWED_COLS = new Set([
  'id', 'source_url', 'title', 'artists', 'venue', 'venue_url', 'address',
  'map_url', 'neighborhood', 'listing_type', 'event_date', 'event_start',
  'event_end', 'exhibition_start', 'exhibition_end', 'on_view_text',
  'image_url', 'image_name', 'detail_url', 'description', 'contact_email', 'tags'
]);
const DATE_COLS = new Set(['event_date', 'exhibition_start', 'exhibition_end']);

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});

// Same-origin only: a browser form always sends Origin, and it must match the
// host this function is served from. Blocks the endpoint being driven from
// someone else's page.
const sameOrigin = request => {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser callers (curl tests) have no Origin
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

const verifyTurnstile = async (secret, token, ip) => {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token || '');
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: form
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return false;
  }
};

export const onRequestPost = async ({ request, env }) => {
  if (!sameOrigin(request)) return json(403, { error: 'bad origin' });

  // cap the body so a bot can't tie up the worker with a huge payload
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY_BYTES) return json(413, { error: 'submission too large' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const token = clip(body.token, 4000);
  const incoming = body.row && typeof body.row === 'object' ? body.row : null;
  if (!incoming) return json(400, { error: 'missing submission' });

  // Turnstile: enforced when the secret is configured; skipped (with a warning)
  // until then so deploying this code can't silently break the live form.
  const secret = env.TURNSTILE_SECRET_KEY;
  if (secret) {
    const ip = request.headers.get('CF-Connecting-IP');
    const ok = await verifyTurnstile(secret, token, ip);
    if (!ok) return json(403, { error: 'failed bot check' });
  } else {
    console.warn('TURNSTILE_SECRET_KEY not set — submission bot check skipped');
  }

  // Build a clean row from whitelisted columns only, then stamp server-owned
  // fields. Blank dates must be null, not '' (Postgres rejects '' for DATE).
  const row = {};
  for (const col of ALLOWED_COLS) {
    if (incoming[col] === undefined || incoming[col] === null) continue;
    let v = incoming[col];
    if (typeof v === 'string') {
      v = DATE_COLS.has(col) ? v.trim() : clip(v, col === 'image_url' || col === 'description' ? 5_000_000 : 2000);
    }
    if (DATE_COLS.has(col) && v === '') continue;
    row[col] = v;
  }
  const title = clip(row.title, 200);
  const contactEmail = clip(row.contact_email, 200);
  if (!title || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return json(400, { error: 'missing title or contact email' });
  }
  if (!row.id) row.id = `sub-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  row.status = 'pending';
  const nowIso = new Date().toISOString();
  if (!row.submitted_at) row.submitted_at = nowIso;
  row.updated_at = nowIso;

  // Insert via the service-role key when present (bypasses RLS); otherwise the
  // public anon key, which still works while the public INSERT policy exists.
  const supabaseUrl = (env.SUPABASE_URL || SUPABASE_URL_DEFAULT).replace(/\/+$/, '');
  const insertKey = env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_DEFAULT;
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/submissions`, {
    method: 'POST',
    headers: {
      apikey: insertKey,
      Authorization: `Bearer ${insertKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify([row])
  });
  if (!insertRes.ok) {
    const detail = await insertRes.text().catch(() => '');
    console.error('submission insert failed', insertRes.status, detail);
    return json(502, { error: 'could not save submission' });
  }

  // Emails are best-effort: a save succeeded, so never fail the request on a
  // mail hiccup. Skip silently if Resend isn't configured.
  let email = { confirmation: false, admin: false };
  const resendKey = env.RESEND_API_KEY;
  if (resendKey) {
    const from = env.NOTIFY_FROM_EMAIL || 'The Visualist <notify@madewithbestpractice.com>';
    const adminBase = (env.ADMIN_BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');

    // Notification config lives on the settings row (recipient list + editable
    // copy), edited in the admin Settings tab. settings is readable here with
    // the insert key; fall back to the env/default recipient if it's unset.
    let recipients = [];
    let templates = {};
    try {
      const sRes = await fetch(`${supabaseUrl}/rest/v1/email_settings?id=eq.1&select=notify_recipients,email_templates`, {
        headers: { apikey: insertKey, Authorization: `Bearer ${insertKey}` }
      });
      if (sRes.ok) {
        const s = (await sRes.json())[0] || {};
        if (Array.isArray(s.notify_recipients)) recipients = s.notify_recipients.filter(Boolean);
        if (s.email_templates && typeof s.email_templates === 'object') templates = s.email_templates;
      }
    } catch (err) {
      console.error('settings fetch failed', err);
    }
    if (!recipients.length) recipients = [env.NOTIFY_ADMIN_EMAIL || 'Visualistchicago@gmail.com'];

    try {
      email = await sendSubmissionEmails({
        key: resendKey,
        from,
        recipients,
        templates,
        adminUrl: `${adminBase}/admin.html#focus-${encodeURIComponent(row.id)}`,
        title,
        venue: clip(row.venue, 200),
        eventDate: clip(row.event_date || row.exhibition_start || '', 40),
        contactEmail
      });
    } catch (err) {
      console.error('notification email failed', err);
    }
  }

  return json(200, { saved: true, ...email });
};
