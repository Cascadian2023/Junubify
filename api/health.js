import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');

  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export default async function handler(req, res) {
  if (!adminClient) {
    return res.status(500).json({
      error: 'Backend not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  const payload = await readJsonBody(req);
  const provider = String(payload.provider || 'mgurush').toLowerCase();
  const phoneNumber = String(payload.phone_number || '').trim();

  if (!['mgurush', 'momo', 'zain'].includes(provider)) {
    return res.status(400).json({ error: 'Unsupported payout provider.' });
  }

  if (!phoneNumber || phoneNumber.length < 6) {
    return res.status(400).json({ error: 'A valid phone number is required.' });
  }

  const { data, error } = await adminClient
    .from('payout_requests')
    .insert({
      user_id: userData.user.id,
      provider,
      phone_number: phoneNumber,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    success: true,
    payout: data,
    message: 'Payout request recorded for review.',
  });
}
