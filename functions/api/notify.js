// Submission notifications, sent through Resend. The API key lives in the
// Pages project as the RESEND_API_KEY secret — never in client code.
//
// Optional env overrides:
//   NOTIFY_FROM_EMAIL  sender, default 'The Visualist <notify@thevisualist.org>'
//   NOTIFY_ADMIN_EMAIL admin recipient, default 'Visualistchicago@gmail.com'

const esc = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const clip = (value, max = 300) => String(value || '').trim().slice(0, max);

const sendEmail = (key, payload) => fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});

export const onRequestPost = async ({ request, env }) => {
  const key = env.RESEND_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: 'notifications not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const title = clip(body.title, 200);
  const venue = clip(body.venue, 200);
  const eventDate = clip(body.eventDate, 40);
  const contactEmail = clip(body.contactEmail, 200);
  if (!title || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return new Response(JSON.stringify({ error: 'missing title or contact email' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const from = env.NOTIFY_FROM_EMAIL || 'The Visualist <notify@thevisualist.org>';
  const adminTo = env.NOTIFY_ADMIN_EMAIL || 'Visualistchicago@gmail.com';
  const line = [venue, eventDate].filter(Boolean).join(' &middot; ');

  const confirmation = sendEmail(key, {
    from,
    to: [contactEmail],
    subject: `We received your event: ${title}`,
    html: `
      <p>Thanks for submitting to The Visualist!</p>
      <p><strong>${esc(title)}</strong>${line ? `<br>${line}` : ''}</p>
      <p>An editor will review your listing and it will appear on the calendar
         once approved. If anything needs a correction, reply to this email.</p>
      <p>&mdash; The Visualist</p>`
  });

  const adminAlert = sendEmail(key, {
    from,
    to: [adminTo],
    reply_to: contactEmail,
    subject: `New submission: ${title}`,
    html: `
      <p>A new event was submitted for review.</p>
      <p><strong>${esc(title)}</strong>${line ? `<br>${line}` : ''}</p>
      <p>Submitted by ${esc(contactEmail)}</p>
      <p><a href="https://c3-prep.madewithbestpractice.com/admin.html#pending">Open the pending queue</a></p>`
  });

  const [confirmRes, adminRes] = await Promise.all([confirmation, adminAlert]);
  return new Response(JSON.stringify({
    confirmation: confirmRes.ok,
    admin: adminRes.ok
  }), {
    status: confirmRes.ok || adminRes.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' }
  });
};
