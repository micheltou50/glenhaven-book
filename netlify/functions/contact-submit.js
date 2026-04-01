// ── /api/contact ──────────────────────────────────────────────
// POST → sends contact form message via Resend email

const { RESEND_API_KEY, RESEND_FROM, HOST_EMAIL } = process.env;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
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

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM || 'Glenhaven <noreply@resend.dev>',
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
