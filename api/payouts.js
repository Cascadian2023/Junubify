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

  if (req.method === 'GET') {
    const { data, error } = await adminClient
      .from('tracks')
      .select('id, title, artist_name, genre, album, duration_seconds, cover_url, audio_url, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
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
    const title = String(payload.title || '').trim();
    const artistName = String(payload.artist_name || '').trim() || userData.user.email || 'Unknown Artist';
    const genre = String(payload.genre || '').trim();
    const album = String(payload.album || '').trim() || null;
    const audioUrl = String(payload.audio_url || '').trim();
    const audioPath = String(payload.audio_path || '').trim();
    const coverUrl = String(payload.cover_url || '').trim() || null;
    const durationSeconds = Number(payload.duration_seconds || 0) || null;

    if (!title || !genre || !audioUrl || !audioPath) {
      return res.status(400).json({
        error: 'title, genre, audio_url, and audio_path are required.',
      });
    }

    const { data, error } = await adminClient
      .from('tracks')
      .insert({
        creator_id: userData.user.id,
        title,
        artist_name: artistName,
        genre,
        album,
        audio_path: audioPath,
        audio_url: audioUrl,
        cover_url: coverUrl,
        duration_seconds: durationSeconds,
        status: 'pending',
      })
      .select('id, title, artist_name, genre, album, duration_seconds, cover_url, audio_url, status, created_at')
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
