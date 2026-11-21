import { db, type LyricOverride } from './db';

export const CURRENT_LYRIC_ENGINE_VERSION = 3;

export interface LyricLine {
  time: number;
  text: string;
}

export type LyricSourceType =
  | 'verified-lrc'
  | 'verified-genius'
  | 'audio-ai'
  | 'embedded-tag'
  | 'manual'
  | 'none';

export interface LyricResult {
  songId: string;
  syncedLines: LyricLine[];
  plainText: string;
  source: LyricSourceType;
  rawLrc?: string;
  isTranscribing?: boolean;
  statusMessage?: string;
}

export function parseLrc(lrc: string): LyricLine[] {
  const lines = lrc.split(/\r?\n/);
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const line of lines) {
    let match: RegExpExecArray | null;
    const times: number[] = [];
    timeRegex.lastIndex = 0;

    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const msStr = match[3] || '0';
      const ms = parseInt(msStr.padEnd(3, '0'), 10);
      times.push(minutes * 60 + seconds + ms / 1000);
    }

    const text = line.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim();
    if (times.length > 0 && text) {
      for (const t of times) {
        result.push({ time: t, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

export function formatLrcTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2).padStart(5, '0');
  return `[${mins.toString().padStart(2, '0')}:${secs}]`;
}

let activeEventSource: EventSource | null = null;

export function cancelActiveTranscription() {
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
}

function getLyricsApiBase(): string {
  const configured = String((import.meta as any).env?.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  if (
    typeof window !== 'undefined' &&
    (window.location.protocol === 'capacitor:' || window.location.hostname === 'localhost')
  ) {
    return configured;
  }
  return '';
}

export async function listenAndTranscribeLyrics(
  songId: string,
  title: string,
  artist: string,
  onUpdate: (partial: LyricResult) => void,
  forceRetranscribe: boolean = false
): Promise<void> {
  cancelActiveTranscription();
  const apiBase = getLyricsApiBase();

  // 1. Check local IndexedDB override or v3 verified cache first unless forcing re-fetch
  if (!forceRetranscribe) {
    const localCached = await db.lyrics.get(songId);
    if (
      localCached &&
      (localCached.source === 'manual' ||
        localCached.engineVersion === CURRENT_LYRIC_ENGINE_VERSION) &&
      (localCached.syncedLyrics || localCached.plainLyrics)
    ) {
      const syncedLines = localCached.syncedLyrics ? parseLrc(localCached.syncedLyrics) : [];
      onUpdate({
        songId,
        syncedLines,
        plainText: localCached.plainLyrics || localCached.syncedLyrics || '',
        source: (localCached.source as LyricSourceType) || 'verified-lrc',
        rawLrc: localCached.syncedLyrics,
        isTranscribing: false,
      });
      return;
    }

    // 2. Fast check on server disk cache / embedded audio file tags (with 8s timeout so stale sockets after inactivity never hang)
    try {
      const fastCtrl = new AbortController();
      const fastTimer = window.setTimeout(() => fastCtrl.abort(), 8000);
      const qParams = new URLSearchParams({
        title: title || '',
        artist: artist || '',
      });
      const fastRes = await fetch(
        `${apiBase}/api/lyrics/${encodeURIComponent(songId)}?${qParams.toString()}`,
        { signal: fastCtrl.signal }
      );
      window.clearTimeout(fastTimer);
      if (fastRes.ok) {
        const data = await fastRes.json();
        const syncedLines: LyricLine[] = data.syncedLines || [];
        const lrcText = syncedLines
          .map((l) => `${formatLrcTimestamp(l.time)} ${l.text}`)
          .join('\n');

        await db.lyrics.put({
          songId,
          title,
          artist,
          syncedLyrics: lrcText || undefined,
          plainLyrics: data.plainText || lrcText,
          source: data.source || 'verified-lrc',
          engineVersion: CURRENT_LYRIC_ENGINE_VERSION,
          updatedAt: Date.now(),
        });

        onUpdate({
          songId,
          syncedLines,
          plainText: data.plainText || '',
          source: data.source || 'verified-lrc',
          rawLrc: lrcText || undefined,
          isTranscribing: false,
        });
        return;
      }
    } catch {
      // Proceed to live stream or offline fallback
    }
  }

  // If device is completely offline, check if even an older cached version exists
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const fallbackCached = await db.lyrics.get(songId);
    if (fallbackCached && (fallbackCached.syncedLyrics || fallbackCached.plainLyrics)) {
      const syncedLines = fallbackCached.syncedLyrics
        ? parseLrc(fallbackCached.syncedLyrics)
        : [];
      onUpdate({
        songId,
        syncedLines,
        plainText: fallbackCached.plainLyrics || '',
        source: (fallbackCached.source as LyricSourceType) || 'audio-ai',
        rawLrc: fallbackCached.syncedLyrics,
        isTranscribing: false,
      });
      return;
    }
    onUpdate({
      songId,
      syncedLines: [],
      plainText: '',
      source: 'none',
      isTranscribing: false,
      statusMessage: 'Offline — play once while online to cache exact synced lyrics',
    });
    return;
  }

  // 3. Stream Hybrid Exact Lyric Engine (LRCLIB Synced -> Genius Verified + Vocal Alignment -> Whisper Acoustic AI)
  const syncedLines: LyricLine[] = [];
  onUpdate({
    songId,
    syncedLines: [],
    plainText: '',
    source: 'verified-lrc',
    isTranscribing: true,
    statusMessage: 'Matching verified lyrics & syncing with audio...',
  });

  const streamParams = new URLSearchParams({
    title: title || '',
    artist: artist || '',
  });
  if (forceRetranscribe) {
    streamParams.set('force', 'true');
  }
  const streamUrl = `${apiBase}/api/lyrics/stream/${encodeURIComponent(
    songId
  )}?${streamParams.toString()}`;
  const es = new EventSource(streamUrl);
  activeEventSource = es;

  // Watchdog timer so an idle/suspended tab socket can never leave lyrics stuck loading forever
  let watchdogTimer: number | null = window.setTimeout(() => {
    if (activeEventSource === es) {
      es.close();
      activeEventSource = null;
      onUpdate({
        songId,
        syncedLines: [...syncedLines],
        plainText: syncedLines.map((l) => l.text).join('\n'),
        source: syncedLines.length > 0 ? 'audio-ai' : 'none',
        isTranscribing: false,
        statusMessage:
          syncedLines.length > 0
            ? undefined
            : 'Connection timed out after inactivity — tap Reload Lyrics to retry',
      });
    }
  }, 25000);

  const refreshWatchdog = () => {
    if (watchdogTimer) window.clearTimeout(watchdogTimer);
    watchdogTimer = window.setTimeout(() => {
      if (activeEventSource === es) {
        es.close();
        activeEventSource = null;
        onUpdate({
          songId,
          syncedLines: [...syncedLines],
          plainText: syncedLines.map((l) => l.text).join('\n'),
          source: syncedLines.length > 0 ? 'audio-ai' : 'none',
          isTranscribing: false,
        });
      }
    }, 25000);
  };

  es.onmessage = async (event) => {
    if (activeEventSource !== es) return;
    refreshWatchdog();
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'status') {
        onUpdate({
          songId,
          syncedLines: [...syncedLines],
          plainText: syncedLines.map((l) => l.text).join('\n'),
          source: 'verified-lrc',
          isTranscribing: true,
          statusMessage: msg.message,
        });
      } else if (msg.type === 'segment' && msg.line) {
        syncedLines.push(msg.line);
        onUpdate({
          songId,
          syncedLines: [...syncedLines],
          plainText: syncedLines.map((l) => l.text).join('\n'),
          source: 'audio-ai',
          isTranscribing: true,
          statusMessage: 'Listening & syncing lines...',
        });
      } else if (msg.type === 'done') {
        if (watchdogTimer) window.clearTimeout(watchdogTimer);
        es.close();
        if (activeEventSource === es) activeEventSource = null;

        const finalResult = msg.result || {};
        const finalLines: LyricLine[] = finalResult.syncedLines || syncedLines;
        const finalPlain: string =
          finalResult.plainText || finalLines.map((l) => l.text).join('\n');
        const lrcText = finalLines
          .map((l) => `${formatLrcTimestamp(l.time)} ${l.text}`)
          .join('\n');
        const finalSource: LyricSourceType = finalResult.source || 'verified-lrc';

        await db.lyrics.put({
          songId,
          title,
          artist,
          syncedLyrics: lrcText || undefined,
          plainLyrics: finalPlain,
          source: finalSource === 'none' ? 'audio-ai' : finalSource,
          engineVersion: CURRENT_LYRIC_ENGINE_VERSION,
          updatedAt: Date.now(),
        });

        onUpdate({
          songId,
          syncedLines: finalLines,
          plainText: finalPlain,
          source: finalSource,
          rawLrc: lrcText || undefined,
          isTranscribing: false,
        });
      } else if (msg.type === 'error') {
        if (watchdogTimer) window.clearTimeout(watchdogTimer);
        es.close();
        if (activeEventSource === es) activeEventSource = null;
        onUpdate({
          songId,
          syncedLines: [...syncedLines],
          plainText: syncedLines.map((l) => l.text).join('\n'),
          source: 'none',
          isTranscribing: false,
          statusMessage: msg.message || 'Could not resolve lyrics for this track',
        });
      }
    } catch (e) {
      console.warn('Lyric stream parse error:', e);
    }
  };

  es.onerror = () => {
    if (watchdogTimer) window.clearTimeout(watchdogTimer);
    es.close();
    if (activeEventSource === es) activeEventSource = null;
    onUpdate({
      songId,
      syncedLines: [...syncedLines],
      plainText: syncedLines.map((l) => l.text).join('\n'),
      source: syncedLines.length > 0 ? 'audio-ai' : 'none',
      isTranscribing: false,
    });
  };
}

export async function saveManualLyricOverride(
  songId: string,
  title: string,
  artist: string,
  lyricsInput: string
): Promise<LyricResult> {
  cancelActiveTranscription();
  const hasTimestamps = /\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/.test(lyricsInput);
  const override: LyricOverride = {
    songId,
    title,
    artist,
    syncedLyrics: hasTimestamps ? lyricsInput : undefined,
    plainLyrics: lyricsInput,
    source: 'manual',
    engineVersion: CURRENT_LYRIC_ENGINE_VERSION,
    updatedAt: Date.now(),
  };
  await db.lyrics.put(override);

  return {
    songId,
    syncedLines: hasTimestamps ? parseLrc(lyricsInput) : [],
    plainText: lyricsInput,
    source: 'manual',
    rawLrc: hasTimestamps ? lyricsInput : undefined,
    isTranscribing: false,
  };
}
