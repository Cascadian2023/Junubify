const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const rawText = await response.text();
  let payload = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const message = payload && typeof payload === 'object'
      ? (payload.error || payload.message || `Request failed (${response.status})`)
      : (payload || `Request failed (${response.status})`);
    throw new Error(message);
  }

  return payload ?? {};
}

export const api = {
  health: async () => request('/health'),
  getTracks: async () => request('/catalog'),
  createTrack: async (body, token) => request('/catalog', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }),
  submitPayout: async (body, token) => request('/payouts', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }),
};
