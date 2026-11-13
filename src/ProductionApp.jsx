import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, Heart, LogIn, LogOut, Music2, Pause, Play, Search, Upload, UserRound, X } from 'lucide-react';
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
    if (!supabase) return;
    const { data, error } = await supabase
      .from('tracks')
      .select('id,title,artist_name,genre,album,duration_seconds,cover_url,audio_url,created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (error) {
      notify(`Could not load catalog: ${error.message}`);
      return;
    }
    setTracks(data?.length ? data : DEMO_TRACKS);
  }, [notify]);

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
    return () => { alive = false; };
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
    const { error: storageError } = await supabase.storage.from('tracks').upload(storagePath, file, { contentType: file.type, upsert: false });
    if (storageError) {
      setUploadBusy(false);
      notify(`Audio upload failed: ${storageError.message}`);
      return;
    }
    const { data: publicUrl } = supabase.storage.from('tracks').getPublicUrl(storagePath);
    const { error: insertError } = await supabase.from('tracks').insert({
      creator_id: user.id,
      title: String(form.get('title')).trim(),
      artist_name: String(form.get('artist')).trim() || user.email,
      genre: String(form.get('genre')),
      album: String(form.get('album')).trim() || null,
      audio_path: storagePath,
      audio_url: publicUrl.publicUrl,
      status: 'pending',
    });
    setUploadBusy(false);
    if (insertError) {
      await supabase.storage.from('tracks').remove([storagePath]);
      notify(`Track could not be submitted: ${insertError.message}`);
      return;
    }
    setUploadOpen(false);
    event.currentTarget.reset();
    notify('Track submitted for review. It will appear in the catalog after approval.');
  };

  const submitPayoutRequest = async (event) => {
    event.preventDefault();
    if (!supabase || !user) {
      setAuthOpen(true);
      return;
    }
    const { error } = await supabase.from('payout_requests').insert({ user_id: user.id, provider, phone_number: payoutPhone.trim() });
    if (error) {
      notify(`Payout request was not saved: ${error.message}`);
      return;
    }
    setPayoutOpen(false);
    setPayoutPhone('');
    notify('Request recorded for review; no funds have been transferred.');
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
          <input aria-label="Search tracks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs, artists, genres..." className="w-full rounded-full border border-slate-800 bg-slate-900 py-2 pl-9 pr-4 text-sm outline-none focus:border-emerald-500" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPayoutOpen(true)} className="rounded-full border border-slate-700 px-4 py-2 text-sm hover:border-emerald-500">Artist payouts</button>
          {user ? (
            <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm"><LogOut size={15} /> Sign out</button>
          ) : (
            <button onClick={() => { setAuthMode('signin'); setAuthOpen(true); }} disabled={!supabase} className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"><LogIn size={15} /> Sign in</button>
          )}
        </div>
      </header>

      {!isBackendConfigured && <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">Backend is not configured yet. Demo catalog is shown; set Supabase environment variables and apply the database schema to enable accounts, likes, uploads, and payout requests.</div>}
      {notice && <div role="status" className="fixed right-4 top-20 z-50 max-w-md rounded-xl border border-emerald-500/40 bg-slate-900 px-4 py-3 text-sm shadow-xl">{notice}</div>}

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-teal-950 via-slate-900 to-emerald-950 p-8 sm:p-12">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">A home for South Sudan music</span>
          <h1 className="mt-3 max-w-2xl text-3xl font-extrabold sm:text-5xl">Discover the sounds of Juba and beyond.</h1>
          <p className="mt-4 max-w-xl text-sm text-slate-300">Stream local artists, save your favorites, and submit music to the Junubify catalog.</p>
          <button onClick={() => user ? setUploadOpen(true) : setAuthOpen(true)} className="mt-6 flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950"><Upload size={16} /> Submit a track</button>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">{query ? 'Search results' : 'Music catalog'}</h2><span className="text-sm text-slate-400">{visibleTracks.length} tracks</span></div>
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            {visibleTracks.length ? visibleTracks.map((track) => (
              <div key={track.id} className="flex items-center gap-3 border-b border-slate-800/70 p-3 last:border-0 sm:gap-4 sm:p-4">
                <button aria-label={`${currentTrack.id === track.id && isPlaying ? 'Pause' : 'Play'} ${track.title}`} onClick={() => currentTrack.id === track.id ? setIsPlaying((playing) => !playing) : playTrack(track)} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-800">
                  <img src={track.cover_url || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=400'} alt="" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 grid place-items-center bg-black/40">{currentTrack.id === track.id && isPlaying ? <Pause size={18} /> : <Play size={18} />}</span>
                </button>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{track.title}</p><p className="truncate text-xs text-slate-400">{track.artist_name} · {track.genre}</p></div>
                <span className="hidden text-xs text-slate-400 sm:inline">{track.album}</span>
                <span className="text-xs text-slate-400">{formatTime(track.duration_seconds)}</span>
                <button aria-label="Save track" onClick={() => toggleLike(track)} className={`rounded-full p-2 ${likedIds.has(track.id) ? 'text-emerald-400' : 'text-slate-400'}`}><Heart size={17} fill={likedIds.has(track.id) ? 'currentColor' : 'none'} /></button>
              </div>
            )) : <p className="p-8 text-center text-slate-400">No matching tracks. Try another search.</p>}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><BarChart2 className="mb-3 text-emerald-400" /><h3 className="font-bold">Artist submissions</h3><p className="mt-2 text-sm text-slate-400">Authenticated artists can submit MP3/WAV tracks for review. Approval controls public catalog visibility.</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><UserRound className="mb-3 text-emerald-400" /><h3 className="font-bold">Secure accounts</h3><p className="mt-2 text-sm text-slate-400">Email authentication, private libraries, and row-level access policies are provided by Supabase.</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><Heart className="mb-3 text-emerald-400" /><h3 className="font-bold">Local catalog</h3><p className="mt-2 text-sm text-slate-400">Published tracks load from the database; likes and submissions are tied to the signed-in user.</p></div>
        </section>
      </main>

      <audio ref={audioRef} src={currentTrack.audio_url || undefined} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setCurrentTrack((track) => ({ ...track, duration_seconds: Math.floor(event.currentTarget.duration) })); }} onEnded={() => goToTrack(1)} preload="metadata" />
      <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur sm:gap-5 sm:px-6">
        <img src={currentTrack.cover_url || ''} alt="" className="h-11 w-11 rounded-lg object-cover" />
        <div className="hidden min-w-0 w-1/5 sm:block"><p className="truncate text-sm font-semibold">{currentTrack.title}</p><p className="truncate text-xs text-slate-400">{currentTrack.artist_name}</p></div>
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="flex items-center gap-5"><button aria-label="Previous track" onClick={() => goToTrack(-1)}><Play className="rotate-180" size={17} /></button><button aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => setIsPlaying((playing) => !playing)} className="rounded-full bg-emerald-500 p-2 text-slate-950">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button><button aria-label="Next track" onClick={() => goToTrack(1)}><Play size={17} /></button></div>
          <div className="flex w-full max-w-xl items-center gap-2 text-[10px] text-slate-400"><span>{formatTime(time)}</span><input aria-label="Seek" type="range" min="0" max={currentTrack.duration_seconds || 0} value={Math.min(time, currentTrack.duration_seconds || 0)} onChange={(event) => { const nextTime = Number(event.target.value); setTime(nextTime); if (audioRef.current) audioRef.current.currentTime = nextTime; }} className="w-full accent-emerald-500" /><span>{formatTime(currentTrack.duration_seconds)}</span></div>
        </div>
      </footer>

      {authOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><section className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6"><button aria-label="Close" onClick={() => setAuthOpen(false)} className="absolute right-4 top-4"><X size={20} /></button><h2 className="text-xl font-bold">{authMode === 'signup' ? 'Create your account' : 'Sign in to Junubify'}</h2><p className="mt-1 text-sm text-slate-400">Email and password authentication</p><form onSubmit={submitAuth} className="mt-5 space-y-3"><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm" /><input required minLength={8} type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (at least 8 characters)" className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm" /><button disabled={authBusy || !supabase} className="w-full rounded-lg bg-emerald-500 p-3 font-bold text-slate-950 disabled:opacity-50">{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button></form><button onClick={() => setAuthMode((mode) => mode === 'signup' ? 'signin' : 'signup')} className="mt-4 text-sm text-emerald-400">{authMode === 'signup' ? 'Already registered? Sign in' : 'New to Junubify? Create account'}</button></section></div>}

      {uploadOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><section className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6"><button aria-label="Close" onClick={() => setUploadOpen(false)} className="absolute right-4 top-4"><X size={20} /></button><h2 className="text-xl font-bold">Submit a track</h2><p className="mt-1 text-sm text-slate-400">Your upload remains private until reviewed and approved.</p><form onSubmit={submitUpload} className="mt-5 space-y-3"><label className="block text-sm">Track title<input required name="title" maxLength="120" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label><label className="block text-sm">Artist name<input required name="artist" maxLength="120" defaultValue={user?.email ?? ''} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label><label className="block text-sm">Genre<select name="genre" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3"><option>Afrobeat</option><option>Dancehall</option><option>Hip-Hop</option><option>Traditional Fusion</option><option>Gospel</option></select></label><label className="block text-sm">Album (optional)<input name="album" maxLength="120" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label><label className="block text-sm">Audio file (MP3/WAV, max 50 MB)<input required name="audio" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="mt-2 block w-full text-sm text-slate-300" /></label><button disabled={uploadBusy} className="w-full rounded-lg bg-emerald-500 p-3 font-bold text-slate-950 disabled:opacity-50">{uploadBusy ? 'Uploading…' : 'Submit for review'}</button></form></section></div>}

      {payoutOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><section className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6"><button aria-label="Close" onClick={() => setPayoutOpen(false)} className="absolute right-4 top-4"><X size={20} /></button><h2 className="text-xl font-bold">Artist payout request</h2><p className="mt-2 text-sm text-amber-200">This records a request for review only. No payment provider is connected and no money will be transferred.</p><form onSubmit={submitPayoutRequest} className="mt-5 space-y-3"><label className="block text-sm">Provider<select value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3"><option value="mgurush">m-GURUSH</option><option value="momo">MTN MoMo</option><option value="zain">Zain Cash</option></select></label><label className="block text-sm">Wallet phone number<input required type="tel" value={payoutPhone} onChange={(event) => setPayoutPhone(event.target.value)} placeholder="+211 …" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label><button className="w-full rounded-lg bg-emerald-500 p-3 font-bold text-slate-950">Record request for review</button></form></section></div>}
    </div>
  );
}
