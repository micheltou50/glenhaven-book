const { SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD } = process.env;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const supplied = (event.headers['x-admin-password'] || '').trim();
  if (!supplied || supplied !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { fileName } = body;
  if (!fileName) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fileName required' }) };

  const ext = fileName.split('.').pop().toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Only jpg, png, webp allowed' }) };
  }

  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = `property/${safeName}`;

  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/photos/${storagePath}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ upsert: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Signed URL failed ${res.status}: ${text}`);
    }

    const data = await res.json();
    const signedPath = data.url || data.signedURL || data.signedUrl;
    const uploadUrl = `${SUPABASE_URL}/storage/v1${signedPath}`;
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/photos/${storagePath}`;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, uploadUrl, publicUrl }),
    };
  } catch (err) {
    console.error('[upload]', err.message);
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
