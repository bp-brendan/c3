// Sends the "your event is live" email to a submitter when the admin approves
// (publishes) their submission. Called by the admin client after it flips a
// submission to approved.
//
// Security: same-origin only, and the caller must present a valid Supabase
// session token (admin login is invite-only — shouldCreateUser:false — so any
// authenticated user is an admin). The email content is read from the DB
// server-side with the service-role key, never trusted from the request body,
// so a caller can't make us mail arbitrary copy to an arbitrary address.
//
// Pages project secrets / vars: SUPABASE_SERVICE_ROLE_KEY (required to read the
// submissions row past RLS), RESEND_API_KEY, plus the same NOTIFY_FROM_EMAIL /
// SUPABASE_URL / PUBLIC_SITE_URL fallbacks as the other functions.

import { clip, sendPublishedEmail } from './_email.js';

const SUPABASE_URL_DEFAULT = 'https://avxlexkqcxamixyhyxcd.supabase.co';
const SUPABASE_ANON_DEFAULT = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz';
const PUBLIC_SITE_DEFAULT = 'https://thevisualist.org';

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});

const sameOrigin = request => {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
};

// Confirm the bearer token is a live Supabase session. Any authenticated user
// counts as an admin (login is invite-only).
const verifyAdmin = async (supabaseUrl, anonKey, token) => {
  if (!token) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return false;
    const user = await res.json();
    return Boolean(user && user.id);
  } catch {
    return false;
  }
};

export const onRequestPost = async ({ request, env }) => {
  if (!sameOrigin(request)) return json(403, { error: 'bad origin' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'invalid json' });
  }
  const id = clip(body.id, 200);
  const token = clip(body.token, 4000);
  if (!id) return json(400, { error: 'missing id' });

  const supabaseUrl = (env.SUPABASE_URL || SUPABASE_URL_DEFAULT).replace(/\/+$/, '');
  const ok = await verifyAdmin(supabaseUrl, SUPABASE_ANON_DEFAULT, token);
  if (!ok) return json(401, { error: 'unauthorized' });

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return json(500, { error: 'server not configured' });
  const authHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // Read the submission server-side — the email is built from stored data, not
  // from anything the caller sent.
  const subRes = await fetch(
    `${supabaseUrl}/rest/v1/submissions?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: authHeaders }
  );
  if (!subRes.ok) return json(502, { error: 'lookup failed' });
  const sub = (await subRes.json())[0];
  if (!sub) return json(404, { error: 'not found' });
  if (sub.status !== 'approved') return json(409, { error: 'not approved' });

  const contactEmail = clip(sub.contact_email, 200);
  if (!contactEmail) return json(200, { published: false, reason: 'no contact email' });

  // Link to the published listing: a local detail path lives on the public
  // site; otherwise fall back to the source URL, then the site root.
  const publicBase = (env.PUBLIC_SITE_URL || PUBLIC_SITE_DEFAULT).replace(/\/+$/, '');
  const detail = sub.detail_url || '';
  const eventUrl = /^https?:/i.test(detail)
    ? detail
    : detail
      ? `${publicBase}/${detail.replace(/^\/+/, '')}`
      : (sub.source_url || publicBase);

  // Editable templates (defaults applied in _email.js when a key is missing).
  let templates = {};
  try {
    const sRes = await fetch(`${supabaseUrl}/rest/v1/email_settings?id=eq.1&select=email_templates`, { headers: authHeaders });
    if (sRes.ok) templates = ((await sRes.json())[0] || {}).email_templates || {};
  } catch (err) {
    console.error('settings fetch failed', err);
  }

  const resendKey = env.RESEND_API_KEY;
  if (!resendKey) return json(200, { published: false, reason: 'mail not configured' });
  const from = env.NOTIFY_FROM_EMAIL || 'The Visualist <notify@madewithbestpractice.com>';

  try {
    const result = await sendPublishedEmail({
      key: resendKey,
      from,
      templates,
      title: clip(sub.title, 200),
      venue: clip(sub.venue, 200),
      eventDate: clip(sub.event_date || sub.exhibition_start || '', 40),
      contactEmail,
      eventUrl
    });
    return json(200, result);
  } catch (err) {
    console.error('published email failed', err);
    return json(200, { published: false, reason: 'send failed' });
  }
};
