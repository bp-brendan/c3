// Shared email rendering + sending for submission notifications, used by the
// /api/submit and /api/publish routes. Mailing goes through Resend; the API key
// lives in the Pages project as the RESEND_API_KEY secret — never in client code.
//
// The sender domain must be verified in Resend or the API 403s. Only
// madewithbestpractice.com is verified today, so that's the default; once
// thevisualist.org is verified, set NOTIFY_FROM_EMAIL to a @thevisualist.org
// address (no code change needed).
//
// Subject + body copy is editable in the admin Settings tab (stored on the
// settings row, passed in as `templates`). Admins edit prose with {{placeholder}}
// tokens; the masthead, the event card, and the call-to-action button are fixed
// chrome rendered here so the copy can't break the layout. Any template an admin
// hasn't overridden falls back to DEFAULT_TEMPLATES below.

export const esc = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export const clip = (value, max = 300) => String(value || '').trim().slice(0, max);

// Built-in copy. {{title}} {{venue}} {{date}} {{submitter}} are filled per email.
// The CTA button + event card are added by the renderer, not the template.
export const DEFAULT_TEMPLATES = {
  admin_alert: {
    subject: 'New submission: {{title}}',
    body: 'A new event was submitted for review.\n\nSubmitted by {{submitter}}.'
  },
  confirmation: {
    subject: 'We received your event: {{title}}',
    body: 'Thanks for submitting to The Visualist!\n\nAn editor will review your listing and it will appear on the calendar once approved — usually within a day or two. If anything needs a correction, just reply to this email.\n\n— The Visualist'
  },
  published: {
    subject: 'Your event is live: {{title}}',
    body: 'Good news — your event has been published on The Visualist calendar.\n\nThanks for sharing it with Chicago.\n\n— The Visualist'
  }
};

// The placeholders each template understands, surfaced to the admin editor.
export const TEMPLATE_PLACEHOLDERS = {
  admin_alert: ['title', 'venue', 'date', 'submitter'],
  confirmation: ['title', 'venue', 'date'],
  published: ['title', 'venue', 'date']
};

const sendEmail = (key, payload) => fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});

// Brand palette, mirrored from styles.css. Email clients want inline styles and
// web-safe fonts, so the Typekit display face becomes a Georgia masthead.
const PAPER = '#1c1c1c';
const INK = '#1c1c1c';
const INK_MUTED = '#767676';
const HAIRLINE = '#e3e3e3';
const FLAG_BLUE = '#41b6e6';
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// Fill {{token}} placeholders from vars (missing → empty string).
const fill = (str, vars) => String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) =>
  vars[k] != null ? String(vars[k]) : '');

// Admin-edited body prose → safe HTML: blank lines split paragraphs, single
// newlines become <br>, everything is escaped (placeholders filled first).
const bodyHtml = (body, vars) => fill(body, vars)
  .split(/\n{2,}/)
  .map(p => p.trim())
  .filter(Boolean)
  .map(p => `<p style="margin:0 0 16px;">${esc(p).replace(/\n/g, '<br>')}</p>`)
  .join('');

const bodyText = (body, vars) => fill(body, vars).trim();
const subjectText = (subject, vars) => fill(subject, vars).trim();

// A template, the admin override merged over the built-in default.
const pick = (templates, name) => ({ ...DEFAULT_TEMPLATES[name], ...((templates && templates[name]) || {}) });

// Wrap message HTML in the shared masthead layout. `preheader` is the dim
// preview line clients show beside the subject.
const layout = (preheader, innerHtml) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f2f2;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${HAIRLINE};">
        <tr><td style="background:${PAPER};padding:20px 28px;border-bottom:3px solid ${FLAG_BLUE};">
          <div style="font-family:${SERIF};font-size:24px;font-weight:700;letter-spacing:0.02em;color:#f2f2f2;">The Visualist</div>
          <div style="font-family:${SANS};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8a8a8a;padding-top:4px;">Chicago Art Calendar</div>
        </td></tr>
        <tr><td style="padding:28px;font-family:${SERIF};font-size:16px;line-height:1.55;color:${INK};">
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid ${HAIRLINE};font-family:${SANS};font-size:12px;line-height:1.5;color:${INK_MUTED};">
          The Visualist &middot; an all-volunteer Chicago art calendar<br>
          <a href="https://thevisualist.org" style="color:${INK_MUTED};">thevisualist.org</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// The event summary card shared by every notification.
const eventCard = (title, venue, eventDate) => {
  const lineHtml = [venue, eventDate].filter(Boolean).map(esc).join(' &middot; ');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid ${HAIRLINE};border-left:3px solid ${FLAG_BLUE};">
        <tr><td style="padding:14px 16px;">
          <div style="font-family:${SERIF};font-size:19px;font-weight:700;color:${INK};">${esc(title)}</div>
          ${lineHtml ? `<div style="font-family:${SANS};font-size:13px;color:${INK_MUTED};padding-top:5px;">${lineHtml}</div>` : ''}
        </td></tr>
      </table>`;
};

const ctaButton = (label, url) => url ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${PAPER};">
        <a href="${esc(url)}" style="display:inline-block;padding:11px 22px;font-family:${SANS};font-size:14px;font-weight:600;color:#f2f2f2;text-decoration:none;">${esc(label)} &rarr;</a>
      </td></tr></table>` : '';

// Render one email (prose + card + optional CTA) and return the Resend payload
// pieces. `cta` is { label, url } or null.
const renderEmail = ({ templates, name, vars, card, cta, ctaLabel }) => {
  const tmpl = pick(templates, name);
  const subject = subjectText(tmpl.subject, vars);
  const html = layout(subject, `
      ${bodyHtml(tmpl.body, vars)}
      ${card ? eventCard(vars.title, vars.venue, vars.date) : ''}
      ${cta ? ctaButton(ctaLabel, cta) : ''}`);
  const text = [
    bodyText(tmpl.body, vars),
    card ? [vars.title, [vars.venue, vars.date].filter(Boolean).join(' · ')].filter(Boolean).join('\n') : '',
    cta ? `${ctaLabel}: ${cta}` : ''
  ].filter(Boolean).join('\n\n');
  return { subject, html, text };
};

// Submitter confirmation + admin alert, fired in parallel. `recipients` is the
// admin notification list; `adminUrl` deep-links to the new submission.
export const sendSubmissionEmails = async ({ key, from, recipients, templates, adminUrl, title, venue, eventDate, contactEmail }) => {
  const vars = { title, venue, date: eventDate, submitter: contactEmail };
  const to = (Array.isArray(recipients) && recipients.length ? recipients : [])
    .map(r => clip(r, 200)).filter(Boolean);

  const conf = renderEmail({ templates, name: 'confirmation', vars, card: true, cta: null });
  const confirmation = sendEmail(key, {
    from, to: [contactEmail], subject: conf.subject, html: conf.html, text: conf.text
  });

  let adminAlert = Promise.resolve({ ok: false });
  if (to.length) {
    const alert = renderEmail({ templates, name: 'admin_alert', vars, card: true, cta: adminUrl, ctaLabel: 'Review this submission' });
    adminAlert = sendEmail(key, {
      from, to, reply_to: contactEmail, subject: alert.subject, html: alert.html, text: alert.text
    });
  }

  const [confirmRes, adminRes] = await Promise.all([confirmation, adminAlert]);
  return { confirmation: confirmRes.ok, admin: adminRes.ok };
};

// "Your event is live" note to the submitter, with a link to the published page.
export const sendPublishedEmail = async ({ key, from, templates, title, venue, eventDate, contactEmail, eventUrl }) => {
  if (!contactEmail) return { published: false };
  const vars = { title, venue, date: eventDate };
  const msg = renderEmail({ templates, name: 'published', vars, card: true, cta: eventUrl, ctaLabel: 'View your listing' });
  const res = await sendEmail(key, {
    from, to: [contactEmail], subject: msg.subject, html: msg.html, text: msg.text
  });
  return { published: res.ok };
};
