import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, Heart, LogIn, LogOut, Music2, Pause, Play, Search, Upload, UserRound, X } from 'lucide-react';
import { api } from './lib/api';
import { isBackendConfigured, supabase } from './lib/supabase';

const DEMO_TRACKS = [
  { id: 'demo-1', title: 'Juba City Lights', artist_name: 'Emmanuel Jal & Dynamq', genre: 'Afrobeat', album: 'Nile Beats Vol. 1', duration_seconds: 225, cover_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=400', audio_url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3' },
  { id: 'demo-2', title: 'White Nile Groove', artist_name: 'Riya Denis', genre: 'Dancehall', album: 'Sudanese Soul', duration_seconds: 252, cover_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=400', audio_url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=tropical-house-110034.mp3' },
  { id: 'demo-3', title: 'Peace in South Sudan', artist_name: 'Silver X feat. MacJ', genre: 'Hip-Hop', album: 'Unity Anthems', duration_seconds: 210, cover_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=400', audio_url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=hip-hop-rock-beats-118000.mp3' },
];

function formatTime(seconds = 0) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

export default function ProductionApp() {
  const [tracks, setTracks] = useState(DEMO_TRACKS);
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [query, setQuery] = useState('');
  const [currentTrack, setCurrentTrack] = useState(DEMO_TRACKS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [likedIds, setLikedIds] = useState(new Set());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutPhone, setPayoutPhone] = useState('');
  const [provider, setProvider] = useState('mgurush');
  const audioRef = useRef(null);
  const noticeTimer = useRef(null);

  const notify = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4000);
  }, []);

  const loadTracks = useCallback(async () => {
    try {
      const data = await api.getTracks();
      const nextTracks = Array.isArray(data) && data.length ? data : DEMO_TRACKS;
      setTracks(nextTracks);
      if (!currentTrack || !nextTracks.some((track) => track.id === currentTrack.id)) {
        setCurrentTrack(nextTracks[0]);
      }
    } catch (error) {
      notify(`Could not load catalog: ${error.message}`);
      setTracks(DEMO_TRACKS);
    }
  }, [currentTrack, notify]);

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
      if (alive) setUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    loadTracks();

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
      window.clearTimeout(noticeTimer.current);
    };
  }, [loadTracks]);

  useEffect(() => {
    if (!supabase || !user) {
      setLikedIds(new Set());
      return;
    }

    let alive = true;
    supabase.from('track_likes').select('track_id').eq('user_id', user.id).then(({ data, error }) => {
      if (alive && !error) setLikedIds(new Set((data ?? []).map((row) => row.track_id)));
    });

    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {
        setIsPlaying(false);
        notify('This track could not be played. Try another track.');
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack, notify]);

  const visibleTracks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tracks;
    return tracks.filter((track) => `${track.title} ${track.artist_name} ${track.genre} ${track.album ?? ''}`.toLowerCase().includes(normalized));
  }, [query, tracks]);

  const playTrack = (track) => {
    setCurrentTrack(track);
    setTime(0);
    setIsPlaying(true);
  };

  const toggleLike = async (track) => {
    if (!user || !supabase || track.id.startsWith('demo-')) {
      setAuthMode('signin');
      setAuthOpen(true);
      notify('Sign in to save songs to your library.');
      return;
    }

    const currentlyLiked = likedIds.has(track.id);
    const { error } = currentlyLiked
      ? await supabase.from('track_likes').delete().eq('user_id', user.id).eq('track_id', track.id)
      : await supabase.from('track_likes').insert({ user_id: user.id, track_id: track.id });

    if (error) {
      notify(`Could not update your library: ${error.message}`);
      return;
    }

    setLikedIds((previous) => {
      const next = new Set(previous);
      if (currentlyLiked) next.delete(track.id);
      else next.add(track.id);
      return next;
    });
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);

    const result = authMode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setAuthBusy(false);

    if (result.error) {
      notify(result.error.message);
      return;
    }

    if (authMode === 'signup' && !result.data.session) {
      notify('Check your email to confirm your account, then sign in.');
    } else {
      notify(authMode === 'signup' ? 'Account created.' : 'Signed in.');
      setAuthOpen(false);
    }
  };

  const submitUpload = async (event) => {
    event.preventDefault();
    if (!supabase || !user) {
      setAuthOpen(true);
      notify('Sign in before submitting a track.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const file = form.get('audio');
    if (!(file instanceof File) || !file.size) {
      notify('Choose an MP3 or WAV audio file.');
      return;
    }

    const allowed = ['audio/mpeg', 'audio/wav', 'audio/x-wav'];
    if (!allowed.includes(file.type) || file.size > 50 * 1024 * 1024) {
      notify('Use an MP3 or WAV file up to 50 MB.');
      return;
    }

    setUploadBusy(true);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: storageError } = await supabase.storage.from('tracks').upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (storageError) {
      setUploadBusy(false);
      notify(`Audio upload failed: ${storageError.message}`);
      return;
    }

    const { data: publicUrl } = supabase.storage.from('tracks').getPublicUrl(storagePath);

    try {
      await api.createTrack(
        {
          title: String(form.get('title')).trim(),
          artist_name: String(form.get('artist')).trim() || user.email,
          genre: String(form.get('genre')),
          album: String(form.get('album')).trim() || null,
          audio_path: storagePath,
          audio_url: publicUrl.publicUrl,
          cover_url: String(form.get('cover') || '').trim() || null,
          duration_seconds: 0,
        },
        session?.access_token,
      );
    } catch (error) {
      await supabase.storage.from('tracks').remove([storagePath]);
      setUploadBusy(false);
      notify(`Track could not be submitted: ${error.message}`);
      return;
    }

    setUploadBusy(false);
    setUploadOpen(false);
    event.currentTarget.reset();
    notify('Track submitted for review. It will appear in the catalog after approval.');
    loadTracks();
  };

  const submitPayoutRequest = async (event) => {
    event.preventDefault();
    if (!supabase || !user) {
      setAuthOpen(true);
      return;
    }

    try {
      await api.submitPayout(
        { provider, phone_number: payoutPhone.trim() },
        session?.access_token,
      );
      setPayoutOpen(false);
      setPayoutPhone('');
      notify('Request recorded for review; no funds have been transferred.');
    } catch (error) {
      notify(`Payout request was not saved: ${error.message}`);
    }
  };

  const goToTrack = (direction) => {
    if (!tracks.length) return;
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    const next = (index + direction + tracks.length) % tracks.length;
    playTrack(tracks[next]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
        <a href="/" className="flex items-center gap-3 text-emerald-400 no-underline">
          <span className="rounded-xl bg-emerald-500 p-2 text-slate-950"><Music2 size={22} /></span>
          <span><strong className="block text-lg tracking-wide">JUNUBIFY</strong><small className="text-[10px] uppercase tracking-widest">South Sudan Beats</small></span>
        </a>
        <div className="relative min-w-48 flex-1 md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
          <input aria-label="Search tracks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs, artists, genres..." className="w-full rounded-full border border-slate-700 bg-slate-900 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPayoutOpen(true)} className="rounded-full border border-slate-700 px-4 py-2 text-sm hover:border-emerald-500">Artist payouts</button>
          {user ? (
            <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm"><LogOut size={15} /> Sign out</button>
          ) : (
            <button onClick={() => { setAuthMode('signin'); setAuthOpen(true); }} disabled={!supabase} className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"><LogIn size={15} /> Sign in</button>
          )}
        </div>
      </header>

      {!isBackendConfigured && <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">Backend is not configured yet. Demo catalog is shown; set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable live data.</div>}
      {notice && <div role="status" className="fixed right-4 top-20 z-50 max-w-md rounded-xl border border-emerald-500/40 bg-slate-900 px-4 py-3 text-sm shadow-xl">{notice}</div>}

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-teal-950 via-slate-900 to-emerald-950 p-8 sm:p-12">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">A home for South Sudan music</span>
          <h1 className="mt-3 max-w-2xl text-3xl font-extrabold sm:text-5xl">Discover the sounds of Juba and beyond.</h1>
          <p className="mt-4 max-w-xl text-sm text-slate-300">Stream local artists, save your favorites, and submit music to the Junubify catalog.</p>
          <button onClick={() => user ? setUploadOpen(true) : setAuthOpen(true)} className="mt-6 flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950"><Upload size={16} /> Upload track</button>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">{query ? 'Search results' : 'Music catalog'}</h2>
            <span className="text-sm text-slate-400">{visibleTracks.length} tracks</span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            {visibleTracks.length ? visibleTracks.map((track) => (
              <div key={track.id} className="flex items-center gap-3 border-b border-slate-800/70 p-3 last:border-0 sm:gap-4 sm:p-4">
                <button aria-label={`${currentTrack.id === track.id && isPlaying ? 'Pause' : 'Play'} ${track.title}`} onClick={() => currentTrack.id === track.id ? setIsPlaying((playing) => !playing) : playTrack(track)} className="relative h-12 w-12 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
                  <img src={track.cover_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=400'} alt="" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 grid place-items-center bg-black/40">{currentTrack.id === track.id && isPlaying ? <Pause size={18} /> : <Play size={18} />}</span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{track.title}</p>
                  <p className="truncate text-xs text-slate-400">{track.artist_name} · {track.genre}</p>
                </div>
                <span className="hidden text-xs text-slate-400 sm:inline">{track.album || 'Single'}</span>
                <span className="text-xs text-slate-400">{formatTime(track.duration_seconds)}</span>
                <button aria-label="Save track" onClick={() => toggleLike(track)} className={`rounded-full p-2 ${likedIds.has(track.id) ? 'text-emerald-400' : 'text-slate-400'}`}><Heart size={17} className={likedIds.has(track.id) ? 'fill-current' : ''} /></button>
              </div>
            )) : <p className="p-8 text-center text-slate-400">No matching tracks. Try another search.</p>}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><BarChart2 className="mb-3 text-emerald-400" /><h3 className="font-bold">Artist submissions</h3><p className="mt-2 text-sm text-slate-300">Authenticated creators can submit songs that enter a pending review state before publishing.</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><UserRound className="mb-3 text-emerald-400" /><h3 className="font-bold">Secure accounts</h3><p className="mt-2 text-sm text-slate-300">JWT-backed sessions and row-level policies protect user data and payouts.</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><Heart className="mb-3 text-emerald-400" /><h3 className="font-bold">Local catalog</h3><p className="mt-2 text-sm text-slate-300">The API layer serves live published tracks while preserving demo data as a safe fallback.</p></div>
        </section>
      </main>

      <audio ref={audioRef} src={currentTrack.audio_url || undefined} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setTime(0); }} />

      <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur sm:gap-5 sm:px-6">
        <img src={currentTrack.cover_url || ''} alt="" className="h-11 w-11 rounded-lg object-cover" />
        <div className="hidden min-w-0 w-1/5 sm:block"><p className="truncate text-sm font-semibold">{currentTrack.title}</p><p className="truncate text-xs text-slate-400">{currentTrack.artist_name}</p></div>
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex items-center gap-5">
            <button aria-label="Previous track" onClick={() => goToTrack(-1)}><Play className="rotate-180" size={17} /></button>
            <button aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => setIsPlaying((playing) => !playing)} className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500 text-slate-950">{isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}</button>
            <button aria-label="Next track" onClick={() => goToTrack(1)}><Play size={17} /></button>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2 text-[10px] text-slate-400"><span>{formatTime(time)}</span><input aria-label="Seek" type="range" min="0" max={currentTrack.duration_seconds || 0} value={time} onChange={(event) => setTime(Number(event.target.value))} className="w-full accent-emerald-500" /><span>{formatTime(currentTrack.duration_seconds)}</span></div>
        </div>
      </footer>

      {authOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><section className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6"><button className="absolute right-4 top-4 text-slate-400" onClick={() => setAuthOpen(false)}><X size={18} /></button><h2 className="text-2xl font-bold">{authMode === 'signup' ? 'Create account' : 'Welcome back'}</h2><p className="mt-2 text-sm text-slate-400">Use your email and password to unlock the Junubify catalog.</p><form onSubmit={submitAuth} className="mt-5 space-y-4"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="Email" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" /><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required placeholder="Password" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" /><button disabled={authBusy} className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950">{authBusy ? 'Please wait...' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button></form><button onClick={() => setAuthMode(authMode === 'signup' ? 'signin' : 'signup')} className="mt-4 text-sm text-emerald-400">{authMode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Sign up'}</button></section></div>}

      {uploadOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><section className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6"><button className="absolute right-4 top-4 text-slate-400" onClick={() => setUploadOpen(false)}><X size={18} /></button><h2 className="text-2xl font-bold">Submit a track</h2><p className="mt-2 text-sm text-slate-400">Your upload is stored in the protected tracks bucket and sent as a pending catalog submission.</p><form onSubmit={submitUpload} className="mt-5 space-y-4"><input name="title" type="text" required placeholder="Track title" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" /><input name="artist" type="text" placeholder="Artist name" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" /><select name="genre" defaultValue="Afrobeat" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"><option value="Afrobeat">Afrobeat</option><option value="Dancehall">Dancehall</option><option value="Hip-Hop">Hip-Hop</option><option value="Traditional Fusion">Traditional Fusion</option><option value="Gospel">Gospel</option></select><input name="album" type="text" placeholder="Album or release name" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" /><input name="cover" type="url" placeholder="Cover image URL" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" /><input name="audio" type="file" accept="audio/mpeg,audio/wav,audio/x-wav" required className="w-full rounded-xl border border-dashed border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-300" /><button disabled={uploadBusy} className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950">{uploadBusy ? 'Uploading...' : 'Submit for review'}</button></form></section></div>}

      {payoutOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><section className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6"><button className="absolute right-4 top-4 text-slate-400" onClick={() => setPayoutOpen(false)}><X size={18} /></button><h2 className="text-2xl font-bold">Request payout</h2><p className="mt-2 text-sm text-slate-400">Create a recorded payout request for artist earnings. No funds are transferred until a real payment provider is connected.</p><form onSubmit={submitPayoutRequest} className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => setProvider('mgurush')} className={`rounded-xl border px-2 py-2 text-xs font-bold ${provider === 'mgurush' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>m-GURUSH</button><button type="button" onClick={() => setProvider('momo')} className={`rounded-xl border px-2 py-2 text-xs font-bold ${provider === 'momo' ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>MoMo</button><button type="button" onClick={() => setProvider('zain')} className={`rounded-xl border px-2 py-2 text-xs font-bold ${provider === 'zain' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-slate-700 bg-slate-950 text-slate-300'}`}>Zain</button></div><input value={payoutPhone} onChange={(event) => setPayoutPhone(event.target.value)} type="tel" required placeholder="Phone number" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" /><button className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950">Submit payout request</button></form></section></div>}
    </div>
  );
}
