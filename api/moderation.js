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

function isAdminUser(user) {
  if (!user) return false;
  const emails = (process.env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const email = String(user.email || '').toLowerCase();
  if (emails.includes(email)) return true;
  const role = String(user.app_metadata?.role || user.user_metadata?.role || '').toLowerCase();
  return role === 'admin' || role === 'moderator';
}

export default async function handler(req, res) {
  if (!adminClient) {
    return res.status(500).json({
      error: 'Backend not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    });
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

  if (!isAdminUser(userData.user)) {
    return res.status(403).json({ error: 'You do not have admin access.' });
  }

  if (req.method === 'GET') {
    const [{ data: pendingTracks, error: tracksError }, { data: pendingPayouts, error: payoutsError }] = await Promise.all([
      adminClient
        .from('tracks')
        .select('id, title, artist_name, genre, album, cover_url, audio_url, status, created_at, creator_id')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      adminClient
        .from('payout_requests')
        .select('id, user_id, provider, phone_number, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (tracksError || payoutsError) {
      return res.status(500).json({ error: tracksError?.message || payoutsError?.message || 'Moderation queue unavailable.' });
    }

    return res.status(200).json({
      pending_tracks: pendingTracks || [],
      pending_payouts: pendingPayouts || [],
    });
  }

  if (req.method === 'PATCH') {
    const payload = await readJsonBody(req);
    const entity = String(payload.entity || '').toLowerCase();
    const id = String(payload.id || '').trim();
    const status = String(payload.status || '').toLowerCase();

    if (!id || !entity || !status) {
      return res.status(400).json({ error: 'entity, id, and status are required.' });
    }

    if (entity === 'track') {
      if (!['published', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Track status must be published or rejected.' });
      }

      const { data, error } = await adminClient
        .from('tracks')
        .update({ status })
        .eq('id', id)
        .select('id, title, artist_name, status, created_at')
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ success: true, item: data });
    }

    if (entity === 'payout') {
      if (!['approved', 'rejected', 'paid'].includes(status)) {
        return res.status(400).json({ error: 'Payout status must be approved, rejected, or paid.' });
      }

      const { data, error } = await adminClient
        .from('payout_requests')
        .update({ status })
        .eq('id', id)
        .select('id, provider, phone_number, status, created_at')
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json({ success: true, item: data });
    }

    return res.status(400).json({ error: 'Unsupported moderation entity.' });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
