const { SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD } = process.env;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password, x-file-name, x-content-type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const supplied = (event.headers['x-admin-password'] || '').trim();
  if (!supplied || supplied !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const fileName = event.headers['x-file-name'] || `photo-${Date.now()}.jpg`;
  const contentType = event.headers['x-content-type'] || 'image/jpeg';

  const ext = fileName.split('.').pop().toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Only jpg, png, webp allowed' }) };
  }

  const timestamp = Date.now();
  const safeName = `${timestamp}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = `property/${safeName}`;

  try {
    const fileBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary');

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/photos/${storagePath}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: fileBuffer,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Storage returned ${res.status}: ${text}`);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/photos/${storagePath}`;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, url: publicUrl }),
    };
  } catch (err) {
    console.error('[upload]', err.message);
    return { statusCode: 502, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
