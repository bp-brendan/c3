// Shared email rendering + sending for submission notifications, used by the
// /api/submit route. Mailing goes through Resend; the API key lives in the
// Pages project as the RESEND_API_KEY secret — never in client code.
//
// The sender domain must be verified in Resend or the API 403s. Only
// madewithbestpractice.com is verified today, so that's the default; once
// thevisualist.org is verified, set NOTIFY_FROM_EMAIL to a @thevisualist.org
// address (no code change needed).

export const esc = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export const clip = (value, max = 300) => String(value || '').trim().slice(0, max);

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

// Send the confirmation (to the submitter) and the admin alert in parallel.
// Returns { confirmation, admin } booleans for whichever sends succeeded.
export const sendSubmissionEmails = async ({ key, from, adminTo, queueUrl, title, venue, eventDate, contactEmail }) => {
  const lineParts = [venue, eventDate].filter(Boolean);
  const lineHtml = lineParts.join(' &middot; ');
  const lineText = lineParts.join(' · ');

  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid ${HAIRLINE};border-left:3px solid ${FLAG_BLUE};">
        <tr><td style="padding:14px 16px;">
          <div style="font-family:${SERIF};font-size:19px;font-weight:700;color:${INK};">${esc(title)}</div>
          ${lineHtml ? `<div style="font-family:${SANS};font-size:13px;color:${INK_MUTED};padding-top:5px;">${lineHtml}</div>` : ''}
        </td></tr>
      </table>`;

  const confirmation = sendEmail(key, {
    from,
    to: [contactEmail],
    subject: `We received your event: ${title}`,
    html: layout(`Your event is in review — usually approved within a day or two.`, `
      <p style="margin:0 0 4px;">Thanks for submitting to The Visualist!</p>
      ${card}
      <p style="margin:0 0 16px;">An editor will review your listing and it will appear on the
         calendar once approved &mdash; usually within a day or two. If anything needs a
         correction, just reply to this email.</p>
      <p style="margin:0;color:${INK_MUTED};font-family:${SANS};font-size:13px;">&mdash; The Visualist</p>`),
    text: [
      'Thanks for submitting to The Visualist!',
      '',
      title + (lineText ? `\n${lineText}` : ''),
      '',
      'An editor will review your listing and it will appear on the calendar once approved — usually within a day or two. If anything needs a correction, just reply to this email.',
      '',
      '— The Visualist',
      'https://thevisualist.org'
    ].join('\n')
  });

  const adminAlert = sendEmail(key, {
    from,
    to: [adminTo],
    reply_to: contactEmail,
    subject: `New submission: ${title}`,
    html: layout(`New event from ${contactEmail} awaiting review.`, `
      <p style="margin:0 0 4px;">A new event was submitted for review.</p>
      ${card}
      <p style="margin:0 0 20px;font-family:${SANS};font-size:14px;color:${INK_MUTED};">
        Submitted by <a href="mailto:${esc(contactEmail)}" style="color:${INK};">${esc(contactEmail)}</a></p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${PAPER};">
        <a href="${esc(queueUrl)}" style="display:inline-block;padding:11px 22px;font-family:${SANS};font-size:14px;font-weight:600;color:#f2f2f2;text-decoration:none;">Open the pending queue &rarr;</a>
      </td></tr></table>`),
    text: [
      'A new event was submitted for review.',
      '',
      title + (lineText ? `\n${lineText}` : ''),
      '',
      `Submitted by ${contactEmail}`,
      '',
      `Open the pending queue: ${queueUrl}`
    ].join('\n')
  });

  const [confirmRes, adminRes] = await Promise.all([confirmation, adminAlert]);
  return { confirmation: confirmRes.ok, admin: adminRes.ok };
};
