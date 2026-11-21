import { create } from 'zustand';
import { SubsonicClient, type SubsonicSong, type SubsonicPlaylist } from './subsonic';
import { db } from './db';
import { listenAndTranscribeLyrics, type LyricResult } from './lyrics';

export type ActiveView = 'home' | 'lyrics' | 'library' | 'add' | 'queue' | 'stats';
export type VisualizerMode = 'spectrum' | 'waveform' | 'mirror' | 'orb' | 'particles' | 'off';
export type VisualizerBarAlign = 'center' | 'left' | 'right';
export type StreamQuality = 'raw' | '320' | '192';

export const EQ_FREQUENCIES = [60, 170, 450, 1200, 4000, 12000] as const;
export const EQ_LABELS = ['60Hz', '170Hz', '450Hz', '1.2kHz', '4kHz', '12kHz'] as const;

export const EQ_PRESETS: Record<string, { bands: number[]; bassBoost: number; rate?: number }> = {
  Flat: { bands: [0, 0, 0, 0, 0, 0], bassBoost: 0, rate: 1.0 },
  '808 Bass Boost': { bands: [8, 5, 1, 0, 1, 2], bassBoost: 6, rate: 1.0 },
  'Extreme Bass': { bands: [11, 8, 2, -1, 1, 2], bassBoost: 10, rate: 1.0 },
  'Juice WRLD / Vocal Glow': { bands: [5, 3, -1, 4, 4, 3], bassBoost: 4, rate: 1.0 },
  'Slowed + Deep': { bands: [7, 5, 1, 1, 2, 1], bassBoost: 6, rate: 0.86 },
  'Sped Up / Nightcore': { bands: [4, 2, 0, 2, 3, 4], bassBoost: 3, rate: 1.15 },
  'Treble & Air': { bands: [0, 0, 1, 3, 6, 8], bassBoost: 0, rate: 1.0 },
};

const CREDS_STORAGE_KEY = 'liquid_audio_creds_v1';
const CACHE_STORAGE_KEY = 'liquid_audio_library_cache_v1';
const QUEUE_STORAGE_KEY = 'liquid_audio_queue_state_v2';
const FX_STORAGE_KEY = 'liquid_audio_fx_v1';
const VOLUME_STORAGE_KEY = 'liquid_audio_volume_v1';
const WRAPPED_STORAGE_KEY = 'liquid_audio_wrapped_v1';
const OFFLINE_PL_NAMES_KEY = 'liquid_audio_offline_playlists_v1';
const PLAYLIST_FOLDERS_STORAGE_KEY = 'liquid_audio_playlist_folders_v1';
const SAVED_ARTISTS_STORAGE_KEY = 'liquid_audio_saved_artists_v1';
const DEFAULT_NAVIDROME_URL = String((import.meta as any).env?.VITE_DEFAULT_NAVIDROME_URL || '').trim();

export interface PlaylistFolder {
  id: string;
  name: string;
  playlistIds: string[];
  createdAt: number;
}

function getScopedFolderKey(username?: string): string {
  const clean = (username || '').trim().toLowerCase();
  return clean ? `${PLAYLIST_FOLDERS_STORAGE_KEY}_${clean}` : PLAYLIST_FOLDERS_STORAGE_KEY;
}

function loadPlaylistFolders(username?: string): PlaylistFolder[] {
  try {
    const raw =
      localStorage.getItem(getScopedFolderKey(username)) ||
      localStorage.getItem(PLAYLIST_FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string')
        .map((f) => ({
          id: f.id,
          name: f.name,
          playlistIds: Array.isArray(f.playlistIds) ? f.playlistIds.filter((id: any) => typeof id === 'string') : [],
          createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now(),
        }));
    }
  } catch {
    // ignore
  }
  return [];
}

function savePlaylistFolders(folders: PlaylistFolder[], username?: string) {
  try {
    const payload = JSON.stringify(folders);
    localStorage.setItem(PLAYLIST_FOLDERS_STORAGE_KEY, payload);
    if (username && username.trim()) {
      localStorage.setItem(getScopedFolderKey(username), payload);
    }
  } catch {
    // ignore
  }
}

function getScopedSavedArtistsKey(username?: string): string {
  const clean = (username || '').trim().toLowerCase();
  return clean ? `${SAVED_ARTISTS_STORAGE_KEY}_${clean}` : SAVED_ARTISTS_STORAGE_KEY;
}

function loadSavedArtists(username?: string): string[] {
  try {
    const raw =
      localStorage.getItem(getScopedSavedArtistsKey(username)) ||
      localStorage.getItem(SAVED_ARTISTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim())));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveSavedArtists(artists: string[], username?: string) {
  try {
    const payload = JSON.stringify(artists);
    localStorage.setItem(SAVED_ARTISTS_STORAGE_KEY, payload);
    if (username && username.trim()) {
      localStorage.setItem(getScopedSavedArtistsKey(username), payload);
    }
  } catch {
    // ignore
  }
}

async function pushAccountPrefToServer(username: string, endpoint: 'folders' | 'saved-artists', body: Record<string, unknown>) {
  const cleanUser = (username || '').trim();
  if (!cleanUser) return;
  try {
    await fetch(`/api/user/${endpoint}/${encodeURIComponent(cleanUser)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // offline fallback already persisted in localStorage
  }
}

interface StoredCreds {
  baseUrl: string;
  username: string;
  password: string;
  updatedAt: number;
}

interface StoredLibraryCache {
  librarySongs: SubsonicSong[];
  playlists: SubsonicPlaylist[];
  lastSong: SubsonicSong | null;
  lastTime?: number;
  queue?: SubsonicSong[];
  currentIndex?: number;
}

export type LyricColorMode = 'album' | 'shimmer' | 'default' | 'custom';

export interface SongPlayStat {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverArt?: string;
  duration?: number;
  realId?: string;
  plays: number;
  seconds: number;
  lastPlayedAt: number;
}

export interface ArtistPlayStat {
  artist: string;
  plays: number;
  seconds: number;
}

export interface ListeningStatsData {
  totalSecondsListened: number;
  totalPlays: number;
  dailyStreak: number;
  lastListenDate: string;
  songStats: Record<string, SongPlayStat>;
  artistStats: Record<string, ArtistPlayStat>;
}

function loadSyncCreds(): StoredCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.username && parsed.password) {
      return {
        baseUrl: parsed.baseUrl || DEFAULT_NAVIDROME_URL,
        username: parsed.username,
        password: parsed.password,
        updatedAt: parsed.updatedAt || Date.now(),
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function saveSyncCreds(creds: StoredCreds) {
  try {
    localStorage.setItem(CREDS_STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // ignore
  }
}

let inMemorySyncCache: StoredLibraryCache | null = null;
let saveCacheTimer: ReturnType<typeof setTimeout> | null = null;

function loadSyncCache(): StoredLibraryCache {
  if (inMemorySyncCache) return inMemorySyncCache;
  let librarySongs: SubsonicSong[] = [];
  let playlists: SubsonicPlaylist[] = [];
  let lastSong: SubsonicSong | null = null;
  let lastTime = 0;
  let queue: SubsonicSong[] = [];
  let currentIndex = -1;

  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      librarySongs = Array.isArray(parsed.librarySongs) ? parsed.librarySongs : [];
      playlists = Array.isArray(parsed.playlists) ? parsed.playlists : [];
      lastSong = parsed.lastSong || null;
      lastTime = Number(parsed.lastTime) || 0;
    }
  } catch {
    // ignore
  }

  try {
    const rawQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (rawQueue) {
      const parsedQueue = JSON.parse(rawQueue);
      queue = Array.isArray(parsedQueue.queue) ? parsedQueue.queue : [];
      currentIndex =
        typeof parsedQueue.currentIndex === 'number' ? parsedQueue.currentIndex : -1;
      if (parsedQueue.lastSong !== undefined) {
        lastSong = parsedQueue.lastSong;
      }
      if (parsedQueue.lastTime !== undefined) {
        lastTime = Number(parsedQueue.lastTime) || 0;
      }
    } else if (lastSong) {
      queue = [lastSong];
      currentIndex = 0;
    }
  } catch {
    // ignore
  }

  inMemorySyncCache = {
    librarySongs,
    playlists,
    lastSong,
    lastTime,
    queue,
    currentIndex,
  };
  return inMemorySyncCache;
}

function flushQueueState() {
  if (!inMemorySyncCache) return;
  const payload = JSON.stringify({
    queue: inMemorySyncCache.queue || [],
    currentIndex:
      typeof inMemorySyncCache.currentIndex === 'number'
        ? inMemorySyncCache.currentIndex
        : -1,
    lastSong: inMemorySyncCache.lastSong || null,
    lastTime: inMemorySyncCache.lastTime || 0,
  });
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, payload);
  } catch {
    // Free up space from heavy library cache so queue state always saves reliably
    try {
      const slimLibrary = {
        librarySongs: (inMemorySyncCache.librarySongs || []).slice(0, 80),
        playlists: (inMemorySyncCache.playlists || []).map((pl) => ({
          ...pl,
          entry: undefined,
        })),
        lastSong: inMemorySyncCache.lastSong || null,
        lastTime: inMemorySyncCache.lastTime || 0,
      };
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(slimLibrary));
      localStorage.setItem(QUEUE_STORAGE_KEY, payload);
    } catch {
      // ignore
    }
  }
}

function flushSyncCache() {
  if (!inMemorySyncCache) return;
  flushQueueState();
  try {
    const libPayload = {
      librarySongs: (inMemorySyncCache.librarySongs || []).slice(0, 250),
      playlists: inMemorySyncCache.playlists || [],
      lastSong: inMemorySyncCache.lastSong || null,
      lastTime: inMemorySyncCache.lastTime || 0,
    };
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(libPayload));
  } catch {
    try {
      const slimPayload = {
        librarySongs: (inMemorySyncCache.librarySongs || []).slice(0, 80),
        playlists: (inMemorySyncCache.playlists || []).map((pl) => ({
          ...pl,
          entry: undefined,
        })),
        lastSong: inMemorySyncCache.lastSong || null,
        lastTime: inMemorySyncCache.lastTime || 0,
      };
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(slimPayload));
    } catch {
      // ignore
    }
  }
}

function saveSyncCache(partial: Partial<StoredLibraryCache>, immediate = false) {
  try {
    const current = loadSyncCache();
    let cappedQueue = partial.queue !== undefined ? partial.queue : current.queue;
    if (Array.isArray(cappedQueue) && cappedQueue.length > 500) {
      cappedQueue = cappedQueue.slice(0, 500);
    }
    inMemorySyncCache = {
      librarySongs: partial.librarySongs ?? current.librarySongs,
      playlists: partial.playlists ?? current.playlists,
      lastSong: partial.lastSong !== undefined ? partial.lastSong : current.lastSong,
      lastTime: partial.lastTime !== undefined ? partial.lastTime : current.lastTime,
      queue: cappedQueue,
      currentIndex: partial.currentIndex !== undefined ? partial.currentIndex : current.currentIndex,
    };

    // Always persist queue, currentIndex, and lastSong changes immediately to dedicated queue storage
    if (
      partial.queue !== undefined ||
      partial.currentIndex !== undefined ||
      partial.lastSong !== undefined ||
      immediate
    ) {
      flushQueueState();
    }

    if (immediate) {
      if (saveCacheTimer) clearTimeout(saveCacheTimer);
      saveCacheTimer = null;
      flushSyncCache();
      return;
    }

    if (!saveCacheTimer) {
      saveCacheTimer = setTimeout(() => {
        saveCacheTimer = null;
        flushSyncCache();
      }, 3000);
    }
  } catch {
    // ignore
  }
}

function loadStoredFx() {
  try {
    const raw = localStorage.getItem(FX_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

function saveStoredFx(fx: any) {
  try {
    localStorage.setItem(FX_STORAGE_KEY, JSON.stringify(fx));
  } catch {
    // ignore
  }
}

function loadStoredVolumeState(): { volume: number; isMuted: boolean } {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.volume === 'number' && isFinite(parsed.volume)) {
        return {
          volume: Math.max(0, Math.min(1, parsed.volume)),
          isMuted: Boolean(parsed.isMuted),
        };
      }
    }
    const fx = loadStoredFx();
    if (fx && typeof fx.volume === 'number' && isFinite(fx.volume)) {
      return {
        volume: Math.max(0, Math.min(1, fx.volume)),
        isMuted: Boolean(fx.isMuted),
      };
    }
  } catch {
    // ignore
  }
  return { volume: 0.5, isMuted: false };
}

function saveStoredVolumeState(volume: number, isMuted: boolean) {
  const clamped = Math.max(0, Math.min(1, volume));
  try {
    localStorage.setItem(
      VOLUME_STORAGE_KEY,
      JSON.stringify({ volume: clamped, isMuted: Boolean(isMuted) })
    );
  } catch {
    // ignore
  }
  saveStoredFx({ ...loadStoredFx(), volume: clamped, isMuted: Boolean(isMuted) });
}

function getWrappedStorageKey(username?: string): string {
  const clean = (username || loadSyncCreds()?.username || '').trim().toLowerCase();
  return clean ? `${WRAPPED_STORAGE_KEY}_${clean}` : WRAPPED_STORAGE_KEY;
}

function loadListeningStats(username?: string): ListeningStatsData {
  try {
    const userKey = getWrappedStorageKey(username);
    const raw = localStorage.getItem(userKey) || localStorage.getItem(WRAPPED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        totalSecondsListened: Number(parsed.totalSecondsListened) || 0,
        totalPlays: Number(parsed.totalPlays) || 0,
        dailyStreak: Number(parsed.dailyStreak) || 1,
        lastListenDate: parsed.lastListenDate || new Date().toISOString().slice(0, 10),
        songStats: parsed.songStats || {},
        artistStats: parsed.artistStats || {},
      };
    }
  } catch {
    // ignore
  }
  return {
    totalSecondsListened: 0,
    totalPlays: 0,
    dailyStreak: 1,
    lastListenDate: new Date().toISOString().slice(0, 10),
    songStats: {},
    artistStats: {},
  };
}

let pendingListeningStats: { stats: ListeningStatsData; username?: string } | null = null;
let saveStatsTimer: ReturnType<typeof setTimeout> | null = null;

function flushListeningStats() {
  if (!pendingListeningStats) return;
  try {
    const { stats, username } = pendingListeningStats;
    const userKey = getWrappedStorageKey(username);
    const json = JSON.stringify(stats);
    localStorage.setItem(userKey, json);
    localStorage.setItem(WRAPPED_STORAGE_KEY, json);
  } catch {
    // ignore
  }
}

function saveListeningStats(stats: ListeningStatsData, username?: string, immediate = false) {
  pendingListeningStats = { stats, username };
  if (immediate) {
    if (saveStatsTimer) clearTimeout(saveStatsTimer);
    saveStatsTimer = null;
    flushListeningStats();
    return;
  }
  if (!saveStatsTimer) {
    saveStatsTimer = setTimeout(() => {
      saveStatsTimer = null;
      flushListeningStats();
    }, 8000);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    flushSyncCache();
    flushListeningStats();
  });
  window.addEventListener('beforeunload', () => {
    flushSyncCache();
    flushListeningStats();
  });
}

function loadOfflinePlaylistNames(): string[] {
  try {
    const raw = localStorage.getItem(OFFLINE_PL_NAMES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    // ignore
  }
  return [];
}

function saveOfflinePlaylistNames(names: string[]) {
  try {
    localStorage.setItem(OFFLINE_PL_NAMES_KEY, JSON.stringify(names));
  } catch {
    // ignore
  }
}

const initialCreds = loadSyncCreds();
const initialCache = loadSyncCache();
const initialFx = loadStoredFx();
const initialVolumeState = loadStoredVolumeState();
const initialStats = loadListeningStats(initialCreds?.username);
const initialClient = initialCreds
  ? new SubsonicClient(initialCreds.baseUrl, initialCreds.username, initialCreds.password)
  : null;
const initialQueue = Array.isArray(initialCache.queue) ? initialCache.queue : [];
const initialSong = initialCache.lastSong || initialQueue[0] || null;
const initialTime = initialCache.lastSong ? Number(initialCache.lastTime) || 0 : 0;
const initialIndex =
  typeof initialCache.currentIndex === 'number' &&
  initialCache.currentIndex >= 0 &&
  initialCache.currentIndex < initialQueue.length
    ? initialCache.currentIndex
    : initialSong && initialQueue.length > 0
    ? Math.max(
        0,
        initialQueue.findIndex((s) => s.id === initialSong.id)
      )
    : -1;

export type UiStyleMode = 'liquid' | 'space';

interface PlayerState {
  // Theme & UI
  theme: 'dark' | 'light';
  uiStyle: UiStyleMode;
  activeView: ActiveView;
  visualizerMode: VisualizerMode;
  visualizerBarAlign: VisualizerBarAlign;
  streamQuality: StreamQuality;
  searchOpen: boolean;
  searchQuery: string;
  authModalOpen: boolean;

  // Optional Custom Song-Sharing Server Config (for self-hosted Navidrome users)
  shareServerUrl: string;
  shareApiToken: string;

  // Lyric Color & Style Customization
  lyricColorMode: LyricColorMode;
  lyricCustomColor: string;

  // Live Listen Along & Discord RPC Settings
  allowListenAlong: boolean;
  listeningAlongTo: string | null;
  discordRpcEnabled: boolean;

  // Equalizer, Bass Boost, Speed & Seamless Crossfade
  eqBands: number[];
  eqPreset: string;
  bassBoost: number;
  playbackRate: number;
  preservePitch: boolean;
  crossfadeSeconds: number;

  // Subsonic Client & Connection
  baseUrl: string;
  username: string;
  isConnected: boolean;
  isLoading: boolean;
  isResyncing: boolean;
  resyncProgress: string | null;
  error: string | null;
  client: SubsonicClient | null;

  // Library, Liked Songs, Playlists, Saved Artists & Offline Downloads
  librarySongs: SubsonicSong[];
  starredSongs: SubsonicSong[];
  playlists: SubsonicPlaylist[];
  playlistFolders: PlaylistFolder[];
  savedArtists: string[];
  selectedPlaylist: SubsonicPlaylist | null;
  offlineSongs: SubsonicSong[];
  offlinePlaylists: string[];
  offlineSongPlaylists: Record<string, string[]>;
  downloadedIds: Record<string, boolean>;
  downloadingIds: Record<string, boolean>;
  offlineCoverUrls: Record<string, string>;
  offlineBlobUrls: Record<string, string>;

  // Listening Stats & Liquid Wrapped
  listeningStats: ListeningStatsData;

  // Playback & Queue
  queue: SubsonicSong[];
  playHistory: SubsonicSong[];
  currentIndex: number;
  currentSong: SubsonicSong | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: 'off' | 'all' | 'one';
  shuffle: boolean;

  // Lyrics
  currentLyrics: LyricResult | null;
  lyricsLoading: boolean;

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setUiStyle: (style: UiStyleMode) => void;
  setShareServerConfig: (url: string, token: string) => void;
  setActiveView: (view: ActiveView) => void;
  setVisualizerMode: (mode: VisualizerMode) => void;
  cycleVisualizerMode: () => void;
  setVisualizerBarAlign: (align: VisualizerBarAlign) => void;
  cycleVisualizerBarAlign: () => void;
  cycleStreamQuality: () => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;
  setAuthModalOpen: (open: boolean) => void;

  // Lyric Color, Listen Along & Discord RPC Actions
  setLyricColorMode: (mode: LyricColorMode) => void;
  setLyricCustomColor: (color: string) => void;
  resetLyricColor: () => void;
  setAllowListenAlong: (allow: boolean) => void;
  setListeningAlongTo: (hostUsername: string | null) => void;
  setDiscordRpcEnabled: (enabled: boolean) => void;

  // Equalizer & Crossfade Actions
  setEqBand: (index: number, dbVal: number) => void;
  applyEqPreset: (presetName: string) => void;
  setBassBoost: (dbVal: number) => void;
  setPlaybackRate: (rate: number) => void;
  setPreservePitch: (preserve: boolean) => void;
  setCrossfadeSeconds: (sec: number) => void;

  // Connection & Library Actions
  initFromStorage: () => Promise<void>;
  reconnectAndSync: () => Promise<boolean>;
  connectServer: (
    baseUrl: string,
    username: string,
    password: string,
    silentBackground?: boolean
  ) => Promise<boolean>;
  searchLibrary: (query: string) => Promise<void>;
  resyncLibrary: () => Promise<void>;
  deleteSongFromDatabase: (songId: string) => Promise<boolean>;
  loadPlaylists: () => Promise<void>;
  selectPlaylist: (id: string | null) => Promise<void>;
  createNewPlaylist: (name: string, songIds?: string[]) => Promise<SubsonicPlaylist | null>;
  deleteExistingPlaylist: (id: string) => Promise<void>;
  createPlaylistFolder: (name: string) => PlaylistFolder | null;
  renamePlaylistFolder: (folderId: string, newName: string) => void;
  deletePlaylistFolder: (folderId: string) => void;
  assignPlaylistToFolder: (playlistId: string, folderId: string | null) => void;
  syncAccountPrefsFromServer: (username?: string) => Promise<void>;
  toggleSaveArtist: (artistName: string) => void;
  copyPublicPlaylistToMine: (playlistId: string) => Promise<SubsonicPlaylist | null>;
  removeMultipleSongsFromPlaylist: (playlistId: string, songIndices: number[]) => Promise<void>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  addSongsToPlaylist: (playlistId: string, songIds: string[]) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songIndex: number) => Promise<void>;
  reorderPlaylistTracks: (playlistId: string, fromIdx: number, toIdx: number) => Promise<void>;
  movePlaylistTracks: (
    playlistId: string,
    fromIndices: number[],
    targetIdx: number,
    dropPosition?: 'before' | 'after'
  ) => Promise<number[]>;
  toggleStarSong: (song: SubsonicSong) => Promise<void>;

  // Offline Download & Offline Playlist Actions
  refreshOfflineLibrary: () => Promise<void>;
  downloadSongForOffline: (song: SubsonicSong, playlistName?: string) => Promise<boolean>;
  removeOfflineSong: (songId: string) => Promise<void>;
  clearAllOfflineSongs: () => Promise<void>;
  createOfflinePlaylist: (name: string) => void;
  deleteOfflinePlaylist: (name: string) => Promise<void>;
  assignSongToOfflinePlaylist: (songId: string, playlistName: string) => Promise<void>;
  removeSongFromOfflinePlaylist: (songId: string, playlistName: string) => Promise<void>;

  // Stats Actions
  recordPlayEvent: (song: SubsonicSong) => void;
  recordListenSeconds: (song: SubsonicSong, deltaSec: number) => void;
  syncWrappedWithServer: () => Promise<void>;

  // Playback & Queue Actions
  playSong: (song: SubsonicSong, newQueue?: SubsonicSong[]) => void;
  playQueueIndex: (idx: number) => void;
  playNextInQueue: (song: SubsonicSong) => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  reorderQueue: (fromIdx: number, toIdx: number) => void;
  moveQueueSongs: (
    fromIndices: number[],
    targetIdx: number,
    dropPosition?: 'before' | 'after'
  ) => number[];
  removeFromQueue: (idx: number) => void;
  removeMultipleFromQueue: (indices: number[]) => void;
  clearQueue: () => void;
  addToQueue: (song: SubsonicSong) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  loadLyricsForSong: (song: SubsonicSong, forceRefresh?: boolean) => Promise<void>;
  setCurrentLyrics: (lyrics: LyricResult) => void;
}

let lastWrappedSyncAt = 0;
let lastSavedTimeAt = 0;
let lastStatsReactNotifyAt = 0;
let searchSeqCounter = 0;

export function reorderArrayWithGroup<T>(
  items: T[],
  fromIndices: number[],
  targetIdx: number,
  dropPosition: 'before' | 'after' = 'before'
): { nextItems: T[]; newIndices: number[] } {
  if (!items.length || !fromIndices.length) return { nextItems: items, newIndices: fromIndices };

  const fromSet = new Set(fromIndices);
  const sortedFrom = [...fromIndices].sort((a, b) => a - b);
  const selectedElements = sortedFrom.map((i) => items[i]).filter(Boolean);
  const targetElement = items[targetIdx];
  if (!targetElement) return { nextItems: items, newIndices: fromIndices };

  const remaining = items.filter((_, i) => !fromSet.has(i));
  let insertAt = remaining.indexOf(targetElement);
  if (insertAt === -1) {
    insertAt = remaining.length;
  } else if (dropPosition === 'after') {
    insertAt += 1;
  }

  const nextItems = [...remaining];
  nextItems.splice(insertAt, 0, ...selectedElements);

  const newIndices: number[] = [];
  for (let i = 0; i < selectedElements.length; i++) {
    newIndices.push(insertAt + i);
  }

  return { nextItems, newIndices };
}

const initialTheme: 'dark' | 'light' = 'dark';
const initialUiStyle: UiStyleMode =
  initialFx?.uiStyle === 'space' ? 'space' : 'liquid';
if (typeof document !== 'undefined') {
  document.documentElement.classList.add('dark');
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  theme: initialTheme,
  uiStyle: initialUiStyle,
  activeView: 'home',
  visualizerMode: initialFx?.visualizerMode || 'spectrum',
  visualizerBarAlign: initialFx?.visualizerBarAlign || 'center',
  streamQuality: initialFx?.streamQuality || 'raw',
  searchOpen: false,
  searchQuery: '',
  authModalOpen: false,

  shareServerUrl: initialFx?.shareServerUrl || '',
  shareApiToken: initialFx?.shareApiToken || '',

  lyricColorMode: (initialFx?.lyricColorMode && initialFx.lyricColorMode !== 'default') ? initialFx.lyricColorMode : 'album',
  lyricCustomColor: initialFx?.lyricCustomColor || '#38bdf8',

  allowListenAlong: initialFx?.allowListenAlong ?? true,
  listeningAlongTo: null,
  discordRpcEnabled: initialFx?.discordRpcEnabled ?? false,

  eqBands: initialFx?.eqBands || [0, 0, 0, 0, 0, 0],
  eqPreset: initialFx?.eqPreset || 'Flat',
  bassBoost: initialFx?.bassBoost ?? 0,
  playbackRate: initialFx?.playbackRate ?? 1.0,
  preservePitch: initialFx?.preservePitch ?? false,
  crossfadeSeconds: initialFx?.crossfadeSeconds ?? 5,

  baseUrl: initialCreds?.baseUrl || DEFAULT_NAVIDROME_URL,
  username: initialCreds?.username || '',
  isConnected: Boolean(initialClient),
  isLoading: false,
  isResyncing: false,
  resyncProgress: null,
  error: null,
  client: initialClient,

  librarySongs: initialCache.librarySongs,
  starredSongs: (initialCache.librarySongs || []).filter((s) => Boolean(s.starred)),
  playlists: initialCache.playlists,
  playlistFolders: loadPlaylistFolders(initialCreds?.username),
  savedArtists: loadSavedArtists(initialCreds?.username),
  selectedPlaylist: null,
  offlineSongs: [],
  offlinePlaylists: loadOfflinePlaylistNames(),
  offlineSongPlaylists: {},
  downloadedIds: {},
  downloadingIds: {},
  offlineCoverUrls: {},
  offlineBlobUrls: {},

  listeningStats: initialStats,

  queue: initialQueue,
  playHistory: [],
  currentIndex: initialIndex,
  currentSong: initialSong,
  isPlaying: false,
  currentTime: initialTime,
  duration: initialSong?.duration || 0,
  volume: initialVolumeState.volume,
  isMuted: initialVolumeState.isMuted,
  repeatMode:
    initialFx?.repeatMode === 'off' || initialFx?.repeatMode === 'one'
      ? initialFx.repeatMode
      : 'all',
  shuffle: Boolean(initialFx?.shuffle),

  currentLyrics: null,
  lyricsLoading: false,

  setTheme: () => {
    document.documentElement.classList.add('dark');
    set({ theme: 'dark' });
    saveStoredFx({ ...loadStoredFx(), theme: 'dark' });
  },

  toggleTheme: () => {
    const nextStyle: UiStyleMode = get().uiStyle === 'liquid' ? 'space' : 'liquid';
    set({ uiStyle: nextStyle, theme: 'dark' });
    saveStoredFx({ ...loadStoredFx(), uiStyle: nextStyle, theme: 'dark' });
  },

  setUiStyle: (uiStyle) => {
    set({ uiStyle, theme: 'dark' });
    saveStoredFx({ ...loadStoredFx(), uiStyle, theme: 'dark' });
  },

  setShareServerConfig: (shareServerUrl, shareApiToken) => {
    const cleanUrl = (shareServerUrl || '').trim().replace(/\/$/, '');
    const cleanToken = (shareApiToken || '').trim();
    set({ shareServerUrl: cleanUrl, shareApiToken: cleanToken });
    saveStoredFx({
      ...loadStoredFx(),
      shareServerUrl: cleanUrl,
      shareApiToken: cleanToken,
    });
  },

  setActiveView: (activeView) => set({ activeView }),

  setVisualizerMode: (visualizerMode) => {
    set({ visualizerMode });
    saveStoredFx({ ...loadStoredFx(), visualizerMode });
  },

  cycleVisualizerMode: () => {
    const order: VisualizerMode[] = ['spectrum', 'waveform', 'mirror', 'orb', 'particles', 'off'];
    const next = order[(order.indexOf(get().visualizerMode) + 1) % order.length];
    get().setVisualizerMode(next);
  },

  setVisualizerBarAlign: (visualizerBarAlign) => {
    set({ visualizerBarAlign });
    saveStoredFx({ ...loadStoredFx(), visualizerBarAlign });
  },

  cycleVisualizerBarAlign: () => {
    const order: VisualizerBarAlign[] = ['center', 'left', 'right'];
    const next = order[(order.indexOf(get().visualizerBarAlign) + 1) % order.length];
    get().setVisualizerBarAlign(next);
  },

  cycleStreamQuality: () => {
    const order: StreamQuality[] = ['raw', '320', '192'];
    const next = order[(order.indexOf(get().streamQuality) + 1) % order.length];
    set({ streamQuality: next });
  },

  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setAuthModalOpen: (authModalOpen) => set({ authModalOpen }),

  setLyricColorMode: (lyricColorMode) => {
    set({ lyricColorMode });
    saveStoredFx({ ...loadStoredFx(), lyricColorMode });
  },

  setLyricCustomColor: (lyricCustomColor) => {
    set({ lyricCustomColor, lyricColorMode: 'custom' });
    saveStoredFx({ ...loadStoredFx(), lyricCustomColor, lyricColorMode: 'custom' });
  },

  resetLyricColor: () => {
    set({ lyricColorMode: 'album', lyricCustomColor: '#38bdf8' });
    saveStoredFx({ ...loadStoredFx(), lyricColorMode: 'album', lyricCustomColor: '#38bdf8' });
  },

  setAllowListenAlong: (allowListenAlong) => {
    set({ allowListenAlong });
    saveStoredFx({ ...loadStoredFx(), allowListenAlong });
  },

  setListeningAlongTo: (listeningAlongTo) => set({ listeningAlongTo }),

  setDiscordRpcEnabled: (discordRpcEnabled) => {
    set({ discordRpcEnabled });
    saveStoredFx({ ...loadStoredFx(), discordRpcEnabled });
  },

  setEqBand: (index, dbVal) => {
    const nextBands = [...get().eqBands];
    nextBands[index] = dbVal;
    set({ eqBands: nextBands, eqPreset: 'Custom' });
    saveStoredFx({
      ...loadStoredFx(),
      eqBands: nextBands,
      eqPreset: 'Custom',
    });
  },

  applyEqPreset: (presetName) => {
    const p = EQ_PRESETS[presetName];
    if (!p) return;
    const nextRate = p.rate !== undefined ? p.rate : get().playbackRate;
    set({
      eqBands: [...p.bands],
      bassBoost: p.bassBoost,
      playbackRate: nextRate,
      eqPreset: presetName,
    });
    saveStoredFx({
      ...loadStoredFx(),
      eqBands: [...p.bands],
      bassBoost: p.bassBoost,
      playbackRate: nextRate,
      eqPreset: presetName,
    });
  },

  setBassBoost: (bassBoost) => {
    set({ bassBoost, eqPreset: 'Custom' });
    saveStoredFx({ ...loadStoredFx(), bassBoost, eqPreset: 'Custom' });
  },

  setPlaybackRate: (playbackRate) => {
    set({ playbackRate });
    saveStoredFx({ ...loadStoredFx(), playbackRate });
  },

  setPreservePitch: (preservePitch) => {
    set({ preservePitch });
    saveStoredFx({ ...loadStoredFx(), preservePitch });
  },

  setCrossfadeSeconds: (crossfadeSeconds) => {
    set({ crossfadeSeconds });
    saveStoredFx({ ...loadStoredFx(), crossfadeSeconds });
  },

  refreshOfflineLibrary: async () => {
    try {
      const items = await db.downloads.orderBy('downloadedAt').reverse().toArray();
      const downloadedIds: Record<string, boolean> = {};
      const offlineCoverUrls: Record<string, string> = { ...get().offlineCoverUrls };
      const offlineBlobUrls: Record<string, string> = { ...get().offlineBlobUrls };
      const offlineSongPlaylists: Record<string, string[]> = {};
      const playlistNameSet = new Set<string>(loadOfflinePlaylistNames());
      const offlineSongs: SubsonicSong[] = [];

      for (const item of items) {
        downloadedIds[item.id] = true;
        offlineSongs.push(item.song);
        const pls = Array.isArray(item.playlists) ? item.playlists : [];
        offlineSongPlaylists[item.id] = pls;
        for (const pName of pls) {
          if (pName) playlistNameSet.add(pName);
        }
        if (item.coverBlob && !offlineCoverUrls[item.id]) {
          offlineCoverUrls[item.id] = URL.createObjectURL(item.coverBlob);
        }
        if (item.audioBlob && !offlineBlobUrls[item.id]) {
          offlineBlobUrls[item.id] = URL.createObjectURL(item.audioBlob);
        }
      }

      const offlinePlaylists = Array.from(playlistNameSet);
      saveOfflinePlaylistNames(offlinePlaylists);

      set({
        offlineSongs,
        offlinePlaylists,
        offlineSongPlaylists,
        downloadedIds,
        offlineCoverUrls,
        offlineBlobUrls,
      });
    } catch (e) {
      console.warn('Offline library load warning:', e);
    }
  },

  downloadSongForOffline: async (song, playlistName) => {
    const { client, downloadingIds, streamQuality } = get();

    // If already downloaded, and a playlistName is provided, just tag it with the playlistName!
    const existingRecord = await db.downloads.get(song.id);
    if (existingRecord) {
      if (playlistName) {
        const currentPls = Array.isArray(existingRecord.playlists)
          ? existingRecord.playlists
          : [];
        if (!currentPls.includes(playlistName)) {
          await db.downloads.update(song.id, {
            playlists: [...currentPls, playlistName],
          });
          await get().refreshOfflineLibrary();
        }
      }
      return true;
    }

    if (!client || downloadingIds[song.id]) return false;

    set({ downloadingIds: { ...get().downloadingIds, [song.id]: true } });
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }

      const maxBitRate = streamQuality === 'raw' ? undefined : parseInt(streamQuality, 10);
      const streamUrl = client.getStreamUrl(song.id, maxBitRate);
      const audioRes = await fetch(streamUrl);
      if (!audioRes.ok) throw new Error('Audio stream fetch failed');
      const audioBlob = await audioRes.blob();

      let coverBlob: Blob | undefined;
      try {
        const coverUrl = client.getCoverArtUrl(song.coverArt || song.id, 600);
        const coverRes = await fetch(coverUrl);
        if (coverRes.ok) {
          coverBlob = await coverRes.blob();
        }
      } catch {
        // Optional cover art
      }

      await db.downloads.put({
        id: song.id,
        song,
        audioBlob,
        coverBlob,
        sizeBytes: audioBlob.size,
        downloadedAt: Date.now(),
        playlists: playlistName ? [playlistName] : [],
      });

      listenAndTranscribeLyrics(song.id, song.title, song.artist, () => {}, false).catch(
        () => {}
      );

      await get().refreshOfflineLibrary();
      const nextDownloading = { ...get().downloadingIds };
      delete nextDownloading[song.id];
      set({ downloadingIds: nextDownloading });
      return true;
    } catch (e) {
      console.error('Failed to download track for offline playback:', e);
      const nextDownloading = { ...get().downloadingIds };
      delete nextDownloading[song.id];
      set({ downloadingIds: nextDownloading });
      return false;
    }
  },

  removeOfflineSong: async (songId) => {
    await db.downloads.delete(songId);
    const urls = { ...get().offlineCoverUrls };
    const blobUrls = { ...get().offlineBlobUrls };
    if (urls[songId]) {
      URL.revokeObjectURL(urls[songId]);
      delete urls[songId];
    }
    if (blobUrls[songId]) {
      URL.revokeObjectURL(blobUrls[songId]);
      delete blobUrls[songId];
    }
    set({ offlineCoverUrls: urls, offlineBlobUrls: blobUrls });
    await get().refreshOfflineLibrary();
  },

  clearAllOfflineSongs: async () => {
    const urls = get().offlineCoverUrls;
    const blobUrls = get().offlineBlobUrls;
    Object.values(urls).forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {
        // ignore
      }
    });
    Object.values(blobUrls).forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {
        // ignore
      }
    });
    await db.downloads.clear();
    saveOfflinePlaylistNames([]);
    set({
      offlineSongs: [],
      offlinePlaylists: [],
      offlineSongPlaylists: {},
      downloadedIds: {},
      downloadingIds: {},
      offlineCoverUrls: {},
      offlineBlobUrls: {},
    });
  },

  createOfflinePlaylist: (name) => {
    const clean = name.trim();
    if (!clean) return;
    const current = get().offlinePlaylists;
    if (!current.includes(clean)) {
      const next = [...current, clean];
      saveOfflinePlaylistNames(next);
      set({ offlinePlaylists: next });
    }
  },

  deleteOfflinePlaylist: async (name) => {
    const next = get().offlinePlaylists.filter((p) => p !== name);
    saveOfflinePlaylistNames(next);
    const allItems = await db.downloads.toArray();
    for (const item of allItems) {
      if (Array.isArray(item.playlists) && item.playlists.includes(name)) {
        await db.downloads.update(item.id, {
          playlists: item.playlists.filter((p) => p !== name),
        });
      }
    }
    await get().refreshOfflineLibrary();
  },

  assignSongToOfflinePlaylist: async (songId, playlistName) => {
    const clean = playlistName.trim();
    if (!clean) return;
    get().createOfflinePlaylist(clean);
    const rec = await db.downloads.get(songId);
    if (rec) {
      const pls = Array.isArray(rec.playlists) ? rec.playlists : [];
      if (!pls.includes(clean)) {
        await db.downloads.update(songId, { playlists: [...pls, clean] });
        await get().refreshOfflineLibrary();
      }
    }
  },

  removeSongFromOfflinePlaylist: async (songId, playlistName) => {
    const rec = await db.downloads.get(songId);
    if (rec && Array.isArray(rec.playlists)) {
      await db.downloads.update(songId, {
        playlists: rec.playlists.filter((p) => p !== playlistName),
      });
      await get().refreshOfflineLibrary();
    }
  },

  syncWrappedWithServer: async () => {
    const user = (get().username || loadSyncCreds()?.username || '').trim();
    if (!user) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    try {
      const res = await fetch(`/api/wrapped/${encodeURIComponent(user)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats: get().listeningStats }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.status === 'ok' && data.stats) {
        const merged: ListeningStatsData = {
          totalSecondsListened: Number(data.stats.totalSecondsListened) || 0,
          totalPlays: Number(data.stats.totalPlays) || 0,
          dailyStreak: Number(data.stats.dailyStreak) || 1,
          lastListenDate:
            data.stats.lastListenDate || new Date().toISOString().slice(0, 10),
          songStats: data.stats.songStats || {},
          artistStats: data.stats.artistStats || {},
        };
        set({ listeningStats: merged });
        saveListeningStats(merged, user);
      }
    } catch {
      // ignore when offline
    }
  },

  recordPlayEvent: (song) => {
    const user = get().username;
    const stats = { ...get().listeningStats };
    const today = new Date().toISOString().slice(0, 10);
    if (stats.lastListenDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      stats.dailyStreak = stats.lastListenDate === yesterday ? stats.dailyStreak + 1 : 1;
      stats.lastListenDate = today;
    }

    stats.totalPlays = (stats.totalPlays || 0) + 1;
    const art = song.coverArt || (song as any).directCoverUrl || (song as any).coverUrl;
    const existingSong = stats.songStats[song.id] || {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album || '',
      coverArt: art,
      duration: song.duration || 0,
      plays: 0,
      seconds: 0,
      lastPlayedAt: 0,
    };
    stats.songStats = {
      ...stats.songStats,
      [song.id]: {
        ...existingSong,
        title: song.title,
        artist: song.artist,
        album: song.album || existingSong.album,
        coverArt: art || existingSong.coverArt,
        duration: song.duration || existingSong.duration,
        plays: existingSong.plays + 1,
        lastPlayedAt: Date.now(),
      },
    };

    const artKey = song.artist || 'Unknown Artist';
    const existingArtist = stats.artistStats[artKey] || {
      artist: artKey,
      plays: 0,
      seconds: 0,
    };
    stats.artistStats = {
      ...stats.artistStats,
      [artKey]: {
        ...existingArtist,
        plays: existingArtist.plays + 1,
      },
    };

    set({ listeningStats: stats });
    saveListeningStats(stats, user);
    get().syncWrappedWithServer();
  },

  recordListenSeconds: (song, deltaSec) => {
    if (!song || deltaSec <= 0 || deltaSec > 10) return;
    const user = get().username;
    const stats = { ...get().listeningStats };
    stats.totalSecondsListened = (stats.totalSecondsListened || 0) + deltaSec;
    const art = song.coverArt || (song as any).directCoverUrl || (song as any).coverUrl;

    const existingSong = stats.songStats[song.id] || {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album || '',
      coverArt: art,
      duration: song.duration || 0,
      plays: 1,
      seconds: 0,
      lastPlayedAt: Date.now(),
    };
    stats.songStats = {
      ...stats.songStats,
      [song.id]: {
        ...existingSong,
        title: song.title || existingSong.title,
        artist: song.artist || existingSong.artist,
        album: song.album || existingSong.album,
        coverArt: art || existingSong.coverArt,
        duration: song.duration || existingSong.duration,
        seconds: existingSong.seconds + deltaSec,
      },
    };

    const artKey = song.artist || 'Unknown Artist';
    const existingArtist = stats.artistStats[artKey] || {
      artist: artKey,
      plays: 1,
      seconds: 0,
    };
    stats.artistStats = {
      ...stats.artistStats,
      [artKey]: {
        ...existingArtist,
        seconds: existingArtist.seconds + deltaSec,
      },
    };

    saveListeningStats(stats, user, false);

    const now = Date.now();
    // Only notify React subscribers every 12 seconds (or when viewing Wrapped) to prevent mobile thermal/CPU lag during long sessions
    if (get().activeView === 'stats' || now - lastStatsReactNotifyAt > 12000) {
      lastStatsReactNotifyAt = now;
      set({ listeningStats: stats });
    } else {
      // Mutate current state reference in place without notifying React subscribers on every second
      const curRef = get().listeningStats;
      curRef.totalSecondsListened = stats.totalSecondsListened;
      curRef.songStats = stats.songStats;
      curRef.artistStats = stats.artistStats;
    }

    if (now - lastWrappedSyncAt > 60000) {
      lastWrappedSyncAt = now;
      get().syncWrappedWithServer();
    }
  },

  reconnectAndSync: async () => {
    let creds = loadSyncCreds();
    if (!creds) {
      try {
        const all = await db.credentials.toArray();
        if (all.length > 0) {
          const last = all[all.length - 1];
          creds = {
            baseUrl: last.baseUrl || DEFAULT_NAVIDROME_URL,
            username: last.username,
            password: last.password,
            updatedAt: last.updatedAt || Date.now(),
          };
          saveSyncCreds(creds);
        }
      } catch {
        // ignore
      }
    }

    if (!creds || !creds.username || !creds.password) {
      return false;
    }

    if (!get().client) {
      const client = new SubsonicClient(creds.baseUrl, creds.username, creds.password);
      set({
        baseUrl: creds.baseUrl,
        username: creds.username,
        client,
        isConnected: true,
        authModalOpen: false,
      });
    }

    return get().connectServer(creds.baseUrl, creds.username, creds.password, true);
  },

  initFromStorage: async () => {
    await get().refreshOfflineLibrary();

    const offline = get().offlineSongs;
    const restoredSong = get().currentSong;
    if (restoredSong) {
      get().loadLyricsForSong(restoredSong);
    }

    const ok = await get().reconnectAndSync();
    if (!ok) {
      const hasCreds = Boolean(loadSyncCreds());
      if (offline.length > 0 && !get().currentSong) {
        set({
          currentSong: offline[0],
          authModalOpen: false,
        });
        get().loadLyricsForSong(offline[0]);
      } else if (!hasCreds && offline.length === 0) {
        set({ authModalOpen: true });
      }
    }
  },

  connectServer: async (baseUrl, username, password, silentBackground = false) => {
    if (!silentBackground) {
      set({ isLoading: true, error: null });
    }
    const cleanUrl = (baseUrl || DEFAULT_NAVIDROME_URL).trim().replace(/\/$/, '');
    const cleanUser = username.trim();
    const client = new SubsonicClient(cleanUrl, cleanUser, password);

    try {
      const ok = await client.ping();
      if (!ok) {
        if (!silentBackground) {
          set({
            isLoading: false,
            error: 'Invalid Navidrome credentials or server unreachable.',
          });
        }
        return false;
      }

      const prevUser = get().username;
      const credsObj: StoredCreds = {
        baseUrl: cleanUrl,
        username: cleanUser,
        password,
        updatedAt: Date.now(),
      };

      saveSyncCreds(credsObj);
      try {
        await db.credentials.clear();
        await db.credentials.add(credsObj);
      } catch {
        // ignore
      }

      const [songs, playlists, starred] = await Promise.all([
        client.fetchSongs(get().searchQuery || ''),
        client.getPlaylists(),
        client.fetchStarredSongs(),
      ]);

      const starredMap = new Map(starred.map((s) => [s.id, s]));
      const mergedSongs = songs.map((s) =>
        starredMap.has(s.id) ? { ...s, starred: s.starred || starredMap.get(s.id)?.starred || 'true' } : s
      );
      const allStarred = Array.from(
        new Map([
          ...starred.map((s) => [s.id, s] as [string, SubsonicSong]),
          ...mergedSongs.filter((s) => Boolean(s.starred)).map((s) => [s.id, s] as [string, SubsonicSong]),
        ]).values()
      );

      const currentQueue = get().queue;
      const rawCurrentSong =
        get().currentSong || (currentQueue.length > 0 ? currentQueue[0] : mergedSongs[0]) || null;
      const nextCurrentSong =
        rawCurrentSong && starredMap.has(rawCurrentSong.id)
          ? { ...rawCurrentSong, starred: rawCurrentSong.starred || 'true' }
          : rawCurrentSong;

      // Never auto-fill user's queue with the 250-300 song library fetch!
      const nextQueue = currentQueue;
      const nextIndex =
        get().currentIndex >= 0 && get().currentIndex < nextQueue.length
          ? get().currentIndex
          : nextCurrentSong && nextQueue.length > 0
          ? nextQueue.findIndex((s) => s.id === nextCurrentSong.id)
          : -1;

      saveSyncCache({
        librarySongs: mergedSongs,
        playlists,
        lastSong: nextCurrentSong,
      });

      // If switching to a different account, load that account's local stats before syncing with server
      const userStats =
        prevUser && prevUser.toLowerCase() !== cleanUser.toLowerCase()
          ? loadListeningStats(cleanUser)
          : get().listeningStats;

      set({
        baseUrl: cleanUrl,
        username: cleanUser,
        client,
        isConnected: true,
        isLoading: false,
        error: null,
        authModalOpen: false,
        librarySongs: mergedSongs,
        starredSongs: allStarred,
        playlists,
        queue: nextQueue,
        currentSong: nextCurrentSong,
        currentIndex: nextIndex,
        listeningStats: userStats,
      });

      // Sync Wrapped stats + Account Playlist Folders & Saved Artists with the server
      get().syncWrappedWithServer();
      get().syncAccountPrefsFromServer(cleanUser);

      if (nextCurrentSong && !get().currentLyrics) {
        get().loadLyricsForSong(nextCurrentSong);
      }
      return true;
    } catch (err: any) {
      const existingCreds = loadSyncCreds();
      if (existingCreds && silentBackground) {
        set({
          baseUrl: existingCreds.baseUrl,
          username: existingCreds.username,
          client:
            get().client ||
            new SubsonicClient(
              existingCreds.baseUrl,
              existingCreds.username,
              existingCreds.password
            ),
          isConnected: true,
          isLoading: false,
          authModalOpen: false,
        });
      } else {
        set({
          isLoading: false,
          error: err?.message || 'Unable to reach Navidrome server.',
        });
      }
      return false;
    }
  },

  searchLibrary: async (query) => {
    const { client } = get();
    if (!client) return;
    const clean = query.trim();
    const seq = ++searchSeqCounter;
    set({ isLoading: true });
    try {
      const songs = await client.fetchSongs(clean);
      if (seq !== searchSeqCounter) {
        // Discard stale out-of-order response
        return;
      }
      set({ librarySongs: songs, isLoading: false });
      if (!clean) {
        saveSyncCache({ librarySongs: songs });
      }
    } catch {
      if (seq === searchSeqCounter) {
        set({ isLoading: false });
      }
    }
  },

  resyncLibrary: async () => {
    const { client, username } = get();
    if (get().isResyncing) return;
    set({ isResyncing: true, resyncProgress: 'Starting scan...' });

    try {
      // 1. Trigger Navidrome scan via Subsonic client
      let scanStarted = false;
      if (client) {
        try {
          scanStarted = await client.startScan(true);
        } catch (e) {
          console.warn('Subsonic startScan error:', e);
        }
      }

      // 2. Also notify backend resync endpoint
      try {
        await fetch('/api/library/resync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullScan: true }),
        });
      } catch {
        // ignore
      }

      // 3. Poll scan status for up to 30 seconds
      const deadline = Date.now() + 30000;
      let finished = false;

      while (Date.now() < deadline && !finished) {
        await new Promise((r) => setTimeout(r, 1200));
        if (client) {
          try {
            const status = await client.getScanStatus();
            if (status.scanning) {
              set({ resyncProgress: `Scanning... (${status.count} tracks)` });
            } else if (scanStarted) {
              finished = true;
              break;
            }
          } catch {
            // ignore
          }
        }
      }

      set({ resyncProgress: 'Reloading songs...' });

      // 4. Reload fresh songs (with newly added tracks), playlists, and liked songs
      if (client) {
        const [songs, playlists, starred] = await Promise.all([
          client.fetchSongs(''),
          client.getPlaylists(),
          client.fetchStarredSongs(),
        ]);
        const starredMap = new Map(starred.map((s) => [s.id, s]));
        const mergedSongs = songs.map((s) =>
          starredMap.has(s.id) ? { ...s, starred: s.starred || 'true' } : s
        );
        const allStarred = Array.from(
          new Map([
            ...starred.map((s) => [s.id, s] as [string, SubsonicSong]),
            ...mergedSongs.filter((s) => Boolean(s.starred)).map((s) => [s.id, s] as [string, SubsonicSong]),
          ]).values()
        );
        set({
          librarySongs: mergedSongs,
          starredSongs: allStarred,
          playlists,
          isResyncing: false,
          resyncProgress: null,
        });
        saveSyncCache({ librarySongs: mergedSongs, playlists });
      } else {
        set({ isResyncing: false, resyncProgress: null });
      }
    } catch (err: any) {
      console.error('Failed to resync library:', err);
      set({ isResyncing: false, resyncProgress: null });
    }
  },

  deleteSongFromDatabase: async (songId: string) => {
    const {
      client,
      queue,
      currentSong,
      currentIndex,
      librarySongs,
      playlists,
      selectedPlaylist,
      removeOfflineSong,
    } = get();

    try {
      const creds = client?.getAuthCredentials ? client.getAuthCredentials() : undefined;
      const resp = await fetch('/api/library/delete-song', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          deleteFile: true,
          username: creds?.username,
          token: creds?.token,
          salt: creds?.salt,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete song from server');
      }

      // Remove from offline storage if downloaded locally
      try {
        await removeOfflineSong(songId);
      } catch {
        // ignore offline cleanup failure
      }

      // 1. Remove from librarySongs
      const updatedLibrary = librarySongs.filter((s) => s.id !== songId);

      // 2. Remove from Playlists state
      const updatedPlaylists = playlists.map((pl) => {
        if (!pl.entry) return pl;
        const filteredEntries = pl.entry.filter((s) => s.id !== songId);
        return {
          ...pl,
          entry: filteredEntries,
          songCount: filteredEntries.length,
        };
      });

      let updatedSelectedPlaylist = selectedPlaylist;
      if (updatedSelectedPlaylist && updatedSelectedPlaylist.entry) {
        const filtered = updatedSelectedPlaylist.entry.filter((s) => s.id !== songId);
        updatedSelectedPlaylist = {
          ...updatedSelectedPlaylist,
          entry: filtered,
          songCount: filtered.length,
        };
      }

      // 3. Handle Queue state
      let updatedQueue = [...queue];
      let updatedIndex = currentIndex;
      let updatedCurrentSong = currentSong;
      let updatedIsPlaying = get().isPlaying;
      let updatedCurrentTime = get().currentTime;

      const deletedQueueIdx = updatedQueue.findIndex((s) => s.id === songId);

      if (deletedQueueIdx !== -1) {
        updatedQueue = updatedQueue.filter((s) => s.id !== songId);
        if (currentSong?.id === songId) {
          if (updatedQueue.length > 0) {
            const nextIdx = Math.min(deletedQueueIdx, updatedQueue.length - 1);
            updatedIndex = nextIdx;
            updatedCurrentSong = updatedQueue[nextIdx];
            updatedCurrentTime = 0;
          } else {
            updatedIndex = 0;
            updatedCurrentSong = null;
            updatedIsPlaying = false;
            updatedCurrentTime = 0;
          }
        } else {
          if (deletedQueueIdx < currentIndex) {
            updatedIndex = Math.max(0, currentIndex - 1);
          }
        }
      }

      set({
        librarySongs: updatedLibrary,
        playlists: updatedPlaylists,
        selectedPlaylist: updatedSelectedPlaylist,
        queue: updatedQueue,
        currentIndex: updatedIndex,
        currentSong: updatedCurrentSong,
        isPlaying: updatedIsPlaying,
        currentTime: updatedCurrentTime,
      });

      // 4. Update sync cache in localStorage
      try {
        saveSyncCache(
          {
            librarySongs: updatedLibrary,
            playlists: updatedPlaylists,
            queue: updatedQueue,
            currentIndex: updatedIndex,
            lastSong: updatedCurrentSong,
          },
          true
        );
      } catch {
        // ignore
      }

      // 5. Trigger non-blocking Subsonic scan to refresh Navidrome counters
      if (client) {
        client.startScan(false).catch(() => {});
      }

      return true;
    } catch (err) {
      console.error('Failed to delete song from database:', err);
      return false;
    }
  },

  loadPlaylists: async () => {
    const { client } = get();
    if (!client) return;
    try {
      const playlists = await client.getPlaylists();
      set({ playlists });
      saveSyncCache({ playlists });
    } catch (e) {
      console.error('Failed to load playlists:', e);
    }
  },

  selectPlaylist: async (id) => {
    const { client } = get();
    if (!client || !id) {
      set({ selectedPlaylist: null });
      return;
    }
    const pl = await client.getPlaylist(id);
    set({ selectedPlaylist: pl });
  },

  createNewPlaylist: async (name, songIds = []) => {
    const { client } = get();
    if (!client || !name.trim()) return null;
    const created = await client.createPlaylist(name.trim(), songIds);
    await get().loadPlaylists();
    return created;
  },

  deleteExistingPlaylist: async (id) => {
    const { client, selectedPlaylist } = get();
    if (!client) return;
    await client.deletePlaylist(id);
    if (selectedPlaylist?.id === id) {
      set({ selectedPlaylist: null });
    }
    // Remove deleted playlist from any playlist folders
    const user = get().username;
    const cleanedFolders = get().playlistFolders.map((f) => ({
      ...f,
      playlistIds: f.playlistIds.filter((pid) => pid !== id),
    }));
    savePlaylistFolders(cleanedFolders, user);
    set({ playlistFolders: cleanedFolders });
    pushAccountPrefToServer(user, 'folders', { folders: cleanedFolders });
    await get().loadPlaylists();
  },

  syncAccountPrefsFromServer: async (explicitUser?: string) => {
    const cleanUser = (explicitUser || get().username || '').trim();
    if (!cleanUser) return;
    // Load local account-scoped copy immediately
    const localFolders = loadPlaylistFolders(cleanUser);
    const localArtists = loadSavedArtists(cleanUser);
    try {
      const [fRes, aRes] = await Promise.all([
        fetch(`/api/user/folders/${encodeURIComponent(cleanUser)}`).catch(() => null),
        fetch(`/api/user/saved-artists/${encodeURIComponent(cleanUser)}`).catch(() => null),
      ]);
      if (fRes && fRes.ok) {
        const fData = await fRes.json();
        const serverFolders: PlaylistFolder[] = Array.isArray(fData?.folders) ? fData.folders : [];
        if (serverFolders.length > 0) {
          savePlaylistFolders(serverFolders, cleanUser);
          set({ playlistFolders: serverFolders });
        } else if (localFolders.length > 0) {
          // Seed server with existing local folders on first sync
          set({ playlistFolders: localFolders });
          pushAccountPrefToServer(cleanUser, 'folders', { folders: localFolders });
        }
      }
      if (aRes && aRes.ok) {
        const aData = await aRes.json();
        const serverArtists: string[] = Array.isArray(aData?.artists) ? aData.artists : [];
        if (serverArtists.length > 0) {
          saveSavedArtists(serverArtists, cleanUser);
          set({ savedArtists: serverArtists });
        } else if (localArtists.length > 0) {
          set({ savedArtists: localArtists });
          pushAccountPrefToServer(cleanUser, 'saved-artists', { artists: localArtists });
        }
      }
    } catch {
      // keep localStorage copy if offline
    }
  },

  createPlaylistFolder: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const user = get().username;
    const newFolder: PlaylistFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      playlistIds: [],
      createdAt: Date.now(),
    };
    const next = [...get().playlistFolders, newFolder];
    savePlaylistFolders(next, user);
    set({ playlistFolders: next });
    pushAccountPrefToServer(user, 'folders', { folders: next });
    return newFolder;
  },

  renamePlaylistFolder: (folderId, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const user = get().username;
    const next = get().playlistFolders.map((f) =>
      f.id === folderId ? { ...f, name: trimmed } : f
    );
    savePlaylistFolders(next, user);
    set({ playlistFolders: next });
    pushAccountPrefToServer(user, 'folders', { folders: next });
  },

  deletePlaylistFolder: (folderId) => {
    const user = get().username;
    const next = get().playlistFolders.filter((f) => f.id !== folderId);
    savePlaylistFolders(next, user);
    set({ playlistFolders: next });
    pushAccountPrefToServer(user, 'folders', { folders: next });
  },

  assignPlaylistToFolder: (playlistId, folderId) => {
    const user = get().username;
    const next = get().playlistFolders.map((f) => {
      const without = f.playlistIds.filter((pid) => pid !== playlistId);
      if (folderId && f.id === folderId) {
        return { ...f, playlistIds: [...without, playlistId] };
      }
      return { ...f, playlistIds: without };
    });
    savePlaylistFolders(next, user);
    set({ playlistFolders: next });
    pushAccountPrefToServer(user, 'folders', { folders: next });
  },

  toggleSaveArtist: (artistName) => {
    const trimmed = (artistName || '').trim();
    if (!trimmed) return;
    const user = get().username;
    const cur = get().savedArtists;
    const exists = cur.some((a) => a.toLowerCase() === trimmed.toLowerCase());
    const next = exists
      ? cur.filter((a) => a.toLowerCase() !== trimmed.toLowerCase())
      : [...cur, trimmed];
    saveSavedArtists(next, user);
    set({ savedArtists: next });
    pushAccountPrefToServer(user, 'saved-artists', { artists: next });
  },

  copyPublicPlaylistToMine: async (playlistId) => {
    const { client } = get();
    if (!client) return null;
    try {
      const fullPl = await client.getPlaylist(playlistId);
      if (!fullPl) return null;
      const songIds = (fullPl.entry || []).map((s) => s.id).filter(Boolean);
      const created = await client.createPlaylist(fullPl.name, songIds);
      await get().loadPlaylists();
      return created;
    } catch {
      return null;
    }
  },

  removeMultipleSongsFromPlaylist: async (playlistId, songIndices) => {
    const { client, selectedPlaylist } = get();
    if (!client || songIndices.length === 0) return;
    const uniqueSorted = Array.from(new Set(songIndices)).sort((a, b) => b - a);
    await client.updatePlaylist(playlistId, [], uniqueSorted);
    await get().loadPlaylists();
    if (selectedPlaylist?.id === playlistId) {
      await get().selectPlaylist(playlistId);
    }
  },

  addSongToPlaylist: async (playlistId, songId) => {
    const { client, selectedPlaylist } = get();
    if (!client) return;
    await client.updatePlaylist(playlistId, [songId], []);
    await get().loadPlaylists();
    if (selectedPlaylist?.id === playlistId) {
      await get().selectPlaylist(playlistId);
    }
  },

  addSongsToPlaylist: async (playlistId, songIds) => {
    const { client, selectedPlaylist } = get();
    if (!client || songIds.length === 0) return;
    await client.updatePlaylist(playlistId, songIds, []);
    await get().loadPlaylists();
    if (selectedPlaylist?.id === playlistId) {
      await get().selectPlaylist(playlistId);
    }
  },

  removeSongFromPlaylist: async (playlistId, songIndex) => {
    const { client, selectedPlaylist } = get();
    if (!client) return;
    await client.updatePlaylist(playlistId, [], [songIndex]);
    await get().loadPlaylists();
    if (selectedPlaylist?.id === playlistId) {
      await get().selectPlaylist(playlistId);
    }
  },

  reorderPlaylistTracks: async (playlistId, fromIdx, toIdx) => {
    const { client, selectedPlaylist } = get();
    if (!client || !selectedPlaylist || selectedPlaylist.id !== playlistId) return;
    const entries = [...(selectedPlaylist.entry || [])];
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= entries.length || toIdx >= entries.length) return;
    const [moved] = entries.splice(fromIdx, 1);
    entries.splice(toIdx, 0, moved);

    set({ selectedPlaylist: { ...selectedPlaylist, entry: entries } });
    await client.replacePlaylistTracks(
      playlistId,
      selectedPlaylist.name,
      entries.map((s) => s.id)
    );
    await get().selectPlaylist(playlistId);
  },

  movePlaylistTracks: async (playlistId, fromIndices, targetIdx, dropPosition = 'before') => {
    const { client, selectedPlaylist } = get();
    if (!client || !selectedPlaylist || selectedPlaylist.id !== playlistId) return fromIndices;
    const entries = selectedPlaylist.entry || [];
    if (!entries.length || !fromIndices.length) return fromIndices;
    const { nextItems, newIndices } = reorderArrayWithGroup(
      entries,
      fromIndices,
      targetIdx,
      dropPosition
    );

    set({ selectedPlaylist: { ...selectedPlaylist, entry: nextItems } });
    await client.replacePlaylistTracks(
      playlistId,
      selectedPlaylist.name,
      nextItems.map((s) => s.id)
    );
    await get().selectPlaylist(playlistId);
    return newIndices;
  },

  toggleStarSong: async (song) => {
    const { client, currentSong, queue, librarySongs, starredSongs } = get();
    if (!client) return;
    const isStarred = Boolean(song.starred);
    const ok = await client.toggleStar(song.id, isStarred);
    if (ok) {
      const updatedStar = isStarred ? undefined : new Date().toISOString();
      const patch = (s: SubsonicSong) => (s.id === song.id ? { ...s, starred: updatedStar } : s);
      const nextLib = librarySongs.map(patch);
      const nextCurrent = currentSong ? patch(currentSong) : null;
      const nextStarred = isStarred
        ? starredSongs.filter((s) => s.id !== song.id)
        : [
            { ...song, starred: updatedStar },
            ...starredSongs.filter((s) => s.id !== song.id),
          ];
      set({
        currentSong: nextCurrent,
        queue: queue.map(patch),
        librarySongs: nextLib,
        starredSongs: nextStarred,
      });
      saveSyncCache({ librarySongs: nextLib, lastSong: nextCurrent });
    }
  },

  playSong: (song, newQueue) => {
    const { currentSong, playHistory, queue: currentQueue, currentIndex } = get();

    let queueToUse: SubsonicSong[];
    let idx: number;

    const matchesTarget = (s: SubsonicSong) =>
      s.id === song.id ||
      Boolean(
        s.title &&
          song.title &&
          s.title.toLowerCase().trim() === song.title.toLowerCase().trim() &&
          s.artist &&
          song.artist &&
          s.artist.toLowerCase().trim() === song.artist.toLowerCase().trim()
      );

    // Prefer matching at or after currentIndex if the song appears multiple times in queue
    let existingIdx = -1;
    if (currentIndex >= 0 && currentIndex < currentQueue.length) {
      for (let i = currentIndex; i < currentQueue.length; i++) {
        if (matchesTarget(currentQueue[i])) {
          existingIdx = i;
          break;
        }
      }
    }
    if (existingIdx === -1) {
      existingIdx = currentQueue.findIndex(matchesTarget);
    }

    // Case 1: Multi-song queue explicitly provided (e.g. Play All Playlist, Play All Offline, Play All Downloaded)
    if (newQueue && newQueue.length > 1) {
      queueToUse = [...newQueue];
      idx = queueToUse.findIndex(matchesTarget);
      if (idx === -1) {
        queueToUse = [song, ...queueToUse];
        idx = 0;
      }
    }
    // Case 2: Active queue is empty -> initialize with song (or newQueue if provided)
    else if (currentQueue.length === 0) {
      queueToUse = newQueue && newQueue.length > 0 ? [...newQueue] : [song];
      idx = Math.max(0, queueToUse.findIndex(matchesTarget));
    }
    // Case 3: Playing an individual song (from Queue, Library, Playlists, Spotlight, Discover)
    // Keep existing queue intact and NEVER jump back to index 0!
    else {
      if (existingIdx !== -1) {
        // Song is already in the queue -> jump currentIndex directly to existingIdx in place!
        queueToUse = currentQueue;
        idx = existingIdx;
      } else {
        // Song is not in the queue yet -> insert right after currentIndex (so current/previous songs stay behind it)
        const nextQ = [...currentQueue];
        const insertAt =
          currentIndex >= 0 && currentIndex < nextQ.length ? currentIndex + 1 : nextQ.length;
        nextQ.splice(insertAt, 0, song);
        queueToUse = nextQ;
        idx = insertAt;
      }
    }

    const nextHistory =
      currentSong && currentSong.id !== song.id
        ? [...playHistory.slice(-49), currentSong]
        : playHistory;

    set({
      queue: queueToUse,
      playHistory: nextHistory,
      currentIndex: idx,
      currentSong: song,
      isPlaying: true,
      currentTime: 0,
    });
    saveSyncCache(
      {
        queue: queueToUse,
        currentIndex: idx,
        lastSong: song,
        lastTime: 0,
      },
      true
    );
    get().recordPlayEvent(song);
    get().loadLyricsForSong(song);
  },

  playQueueIndex: (idx) => {
    const { queue, currentSong, playHistory } = get();
    if (idx < 0 || idx >= queue.length) return;
    const targetSong = queue[idx];
    if (!targetSong) return;

    const nextHistory =
      currentSong && currentSong.id !== targetSong.id
        ? [...playHistory.slice(-49), currentSong]
        : playHistory;

    set({
      playHistory: nextHistory,
      currentIndex: idx,
      currentSong: targetSong,
      isPlaying: true,
      currentTime: 0,
    });
    saveSyncCache(
      {
        queue,
        currentIndex: idx,
        lastSong: targetSong,
        lastTime: 0,
      },
      true
    );
    get().recordPlayEvent(targetSong);
    get().loadLyricsForSong(targetSong);
  },

  playNextInQueue: (song) => {
    const { queue, currentSong, currentIndex } = get();
    if (!currentSong || queue.length === 0) {
      get().playSong(song);
      return;
    }
    const nextQ = [...queue];
    const insertIdx =
      currentIndex >= 0 && currentIndex < nextQ.length ? currentIndex + 1 : nextQ.length;
    nextQ.splice(insertIdx, 0, song);
    const nextCurrentIdx =
      currentIndex >= 0 && currentIndex < queue.length ? currentIndex : 0;
    set({ queue: nextQ, currentIndex: nextCurrentIdx });
    saveSyncCache({ queue: nextQ, currentIndex: nextCurrentIdx }, true);
  },

  setIsPlaying: (isPlaying) => {
    const { currentSong, queue, currentIndex } = get();
    if (isPlaying && queue.length > 0 && (!currentSong || currentIndex < 0 || currentIndex >= queue.length)) {
      const targetIdx = 0;
      const targetSong = queue[targetIdx];
      set({
        isPlaying: true,
        currentIndex: targetIdx,
        currentSong: targetSong,
        currentTime: 0,
      });
      saveSyncCache({ currentIndex: targetIdx, lastSong: targetSong, lastTime: 0 }, true);
      get().recordPlayEvent(targetSong);
      get().loadLyricsForSong(targetSong);
      return;
    }
    set({ isPlaying });
  },
  setCurrentTime: (currentTime) => {
    set({ currentTime });
    const now = Date.now();
    if (currentTime > 0.5 && now - lastSavedTimeAt > 8000) {
      lastSavedTimeAt = now;
      saveSyncCache({ lastSong: get().currentSong, lastTime: currentTime }, false);
    }
  },
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const nextMuted = clamped === 0;
    set({ volume: clamped, isMuted: nextMuted });
    saveStoredVolumeState(clamped, nextMuted);
  },
  toggleMute: () =>
    set((s) => {
      const nextMuted = !s.isMuted;
      saveStoredVolumeState(s.volume, nextMuted);
      return { isMuted: nextMuted };
    }),

  nextTrack: () => {
    const { queue, currentIndex, currentSong, playHistory, repeatMode, shuffle } = get();
    if (queue.length === 0) return;

    let nextIdx = currentIndex + 1;
    if (shuffle && queue.length > 1) {
      let attempts = 0;
      nextIdx = Math.floor(Math.random() * queue.length);
      while (nextIdx === currentIndex && attempts < 8) {
        nextIdx = Math.floor(Math.random() * queue.length);
        attempts++;
      }
    } else if (nextIdx >= queue.length) {
      if (repeatMode === 'all') {
        nextIdx = 0;
      } else {
        set({ isPlaying: false });
        return;
      }
    }

    const nextSong = queue[nextIdx];
    if (nextSong) {
      const nextHistory =
        currentSong && currentSong.id !== nextSong.id
          ? [...playHistory.slice(-49), currentSong]
          : playHistory;

      set({
        playHistory: nextHistory,
        currentIndex: nextIdx,
        currentSong: nextSong,
        currentTime: 0,
        isPlaying: true,
      });
      saveSyncCache({ currentIndex: nextIdx, lastSong: nextSong, lastTime: 0 }, true);
      get().recordPlayEvent(nextSong);
      get().loadLyricsForSong(nextSong);
    }
  },

  prevTrack: () => {
    const { queue, currentIndex, currentTime, playHistory } = get();
    if (queue.length === 0) return;
    if (currentTime > 3.5) {
      set({ currentTime: 0 });
      saveSyncCache({ lastTime: 0 }, true);
      window.dispatchEvent(new CustomEvent('liquid-seek', { detail: 0 }));
      return;
    }

    // Step back through actual played history first (so Shuffle NEVER shuffles backwards!)
    if (playHistory.length > 0) {
      const nextHistory = [...playHistory];
      const prevSong = nextHistory.pop()!;
      const foundIdx = queue.findIndex((s) => s.id === prevSong.id);
      const targetIdx = foundIdx >= 0 ? foundIdx : Math.max(0, currentIndex - 1);
      set({
        playHistory: nextHistory,
        currentIndex: targetIdx,
        currentSong: prevSong,
        currentTime: 0,
        isPlaying: true,
      });
      saveSyncCache({ currentIndex: targetIdx, lastSong: prevSong, lastTime: 0 }, true);
      get().recordPlayEvent(prevSong);
      get().loadLyricsForSong(prevSong);
      return;
    }

    const prevIdx = currentIndex > 0 ? currentIndex - 1 : queue.length - 1;
    const prevSong = queue[prevIdx];
    if (prevSong) {
      set({
        currentIndex: prevIdx,
        currentSong: prevSong,
        currentTime: 0,
        isPlaying: true,
      });
      saveSyncCache({ currentIndex: prevIdx, lastSong: prevSong, lastTime: 0 }, true);
      get().recordPlayEvent(prevSong);
      get().loadLyricsForSong(prevSong);
    }
  },

  reorderQueue: (fromIdx, toIdx) => {
    const { queue, currentSong } = get();
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= queue.length || toIdx >= queue.length) return;
    const nextQ = [...queue];
    const [moved] = nextQ.splice(fromIdx, 1);
    nextQ.splice(toIdx, 0, moved);
    const newCurrentIdx = currentSong ? nextQ.findIndex((s) => s.id === currentSong.id) : -1;
    set({ queue: nextQ, currentIndex: newCurrentIdx });
    saveSyncCache({ queue: nextQ, currentIndex: newCurrentIdx }, true);
  },

  moveQueueSongs: (fromIndices, targetIdx, dropPosition = 'before') => {
    const { queue, currentSong } = get();
    if (!queue.length || !fromIndices.length) return fromIndices;
    const { nextItems, newIndices } = reorderArrayWithGroup(
      queue,
      fromIndices,
      targetIdx,
      dropPosition
    );
    const newCurrentIdx = currentSong ? nextItems.findIndex((s) => s.id === currentSong.id) : -1;
    set({ queue: nextItems, currentIndex: newCurrentIdx });
    saveSyncCache({ queue: nextItems, currentIndex: newCurrentIdx }, true);
    return newIndices;
  },

  removeFromQueue: (idx) => {
    const { queue, currentIndex, currentSong } = get();
    const nextQ = queue.filter((_, i) => i !== idx);
    if (nextQ.length === 0) {
      set({ queue: [], currentIndex: -1 });
      saveSyncCache({ queue: [], currentIndex: -1 }, true);
      return;
    }
    let nextIdx = currentIndex;
    if (idx < currentIndex) {
      nextIdx = currentIndex - 1;
    } else if (idx === currentIndex) {
      nextIdx = Math.min(currentIndex, nextQ.length - 1);
    }
    const clampedIdx =
      nextIdx >= 0 && nextIdx < nextQ.length
        ? nextIdx
        : currentSong
        ? nextQ.findIndex((s) => s.id === currentSong.id)
        : 0;
    set({ queue: nextQ, currentIndex: clampedIdx });
    saveSyncCache({ queue: nextQ, currentIndex: clampedIdx }, true);
  },

  removeMultipleFromQueue: (indices) => {
    const removeSet = new Set(indices);
    const { queue, currentSong } = get();
    const nextQ = queue.filter((_, i) => !removeSet.has(i));
    const nextIdx = currentSong ? Math.max(0, nextQ.findIndex((s) => s.id === currentSong.id)) : 0;
    const finalIdx = nextQ.length > 0 ? nextIdx : -1;
    set({ queue: nextQ, currentIndex: finalIdx });
    saveSyncCache({ queue: nextQ, currentIndex: finalIdx }, true);
  },

  clearQueue: () => {
    set({ queue: [], currentIndex: -1 });
    saveSyncCache({ queue: [], currentIndex: -1 }, true);
  },

  addToQueue: (song) => {
    const { queue, currentSong, currentIndex, isPlaying } = get();
    const wasEmpty = queue.length === 0;
    const nextQ = [...queue, song];
    if (wasEmpty && !isPlaying) {
      set({
        queue: nextQ,
        currentIndex: 0,
        currentSong: song,
        currentTime: 0,
      });
      saveSyncCache(
        {
          queue: nextQ,
          currentIndex: 0,
          lastSong: song,
          lastTime: 0,
        },
        true
      );
      get().loadLyricsForSong(song);
    } else {
      const nextIdx =
        currentIndex >= 0 && currentIndex < nextQ.length
          ? currentIndex
          : currentSong
          ? nextQ.findIndex((s) => s.id === currentSong.id)
          : 0;
      set({ queue: nextQ, currentIndex: nextIdx });
      saveSyncCache({ queue: nextQ, currentIndex: nextIdx }, true);
    }
  },

  toggleShuffle: () =>
    set((s) => {
      const next = !s.shuffle;
      saveStoredFx({ ...loadStoredFx(), shuffle: next });
      return { shuffle: next };
    }),

  cycleRepeat: () => {
    const order: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
    const next = order[(order.indexOf(get().repeatMode) + 1) % order.length];
    set({ repeatMode: next });
    saveStoredFx({ ...loadStoredFx(), repeatMode: next });
  },

  loadLyricsForSong: async (song, forceRefresh = false) => {
    set({ lyricsLoading: true });
    if (forceRefresh) {
      await db.lyrics.delete(song.id);
    }
    await listenAndTranscribeLyrics(
      song.id,
      song.title,
      song.artist,
      (partial) => {
        if (get().currentSong?.id === song.id) {
          set({
            currentLyrics: partial,
            lyricsLoading: Boolean(partial.isTranscribing),
          });
        }
      },
      forceRefresh
    );
  },

  setCurrentLyrics: (currentLyrics) => set({ currentLyrics }),
}));
