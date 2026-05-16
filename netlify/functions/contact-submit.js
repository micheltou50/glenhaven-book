// ── /api/contact ──────────────────────────────────────────────
// POST → sends contact form message via Resend email

const { loadSiteConfig, getEmailFrom } = require('./site-config-loader');

const { RESEND_API_KEY, RESEND_FROM, HOST_EMAIL } = process.env;
const SITE_URL = process.env.URL || '';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': SITE_URL || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) };

  if (!RESEND_API_KEY || !HOST_EMAIL) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Email not configured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const siteConfig = await loadSiteConfig();
    const emailFrom = getEmailFrom(siteConfig);

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: emailFrom,
        to: HOST_EMAIL,
        reply_to: body.email || undefined,
        subject: `Contact: ${body.topic || 'General'} — ${body.name || 'Guest'}`,
        html: `<h2>New Contact Message</h2>
          <p><strong>Name:</strong> ${body.name || '—'}</p>
          <p><strong>Email:</strong> ${body.email || '—'}</p>
          <p><strong>Topic:</strong> ${body.topic || 'General'}</p>
          <hr/>
          <p>${(body.message || '').replace(/\n/g, '<br/>')}</p>`,
      }),
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('[contact]', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
