import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Search,
  ChevronLeft,
  Heart,
  Share2,
  Sliders,
  ListMusic,
  Disc3,
  Mic2,
  Sun,
  Moon,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Server,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Edit3,
  RefreshCw,
  Check,
  X,
  Activity,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  ListPlus,
  Radio,
  MonitorDown,
  Compass,
  Loader2,
  CheckCircle2,
  Sparkles,
  Download,
  HardDriveDownload,
  WifiOff,
  PictureInPicture2,
  Maximize2,
  Minimize2,
  EyeOff,
  Eye,
  Users,
  Headphones,
  Palette as PaletteIcon,
  RotateCcw,
  Gamepad2,
  Image as ImageIcon,
  ArrowUpDown,
  Flame,
  Clock,
  Trophy,
  ExternalLink,
  Copy,
  Gauge,
  GripVertical,
  Home,
  Library,
  Settings,
  MoreHorizontal,
  Bookmark,
  BookmarkCheck,
  User,
} from 'lucide-react';
import { SpaceMeteorBackground } from './SpaceMeteorBackground';
import {
  usePlayerStore,
  EQ_LABELS,
  EQ_PRESETS,
  type VisualizerMode,
  type VisualizerBarAlign,
  type UiStyleMode,
  type ListeningStatsData,
  type SongPlayStat,
  type ArtistPlayStat,
} from './store';
import { AudioEngineBridge, AudioVisualizerCanvas, audioController } from './AudioVisualizer';
import { saveManualLyricOverride } from './lyrics';
import type { SubsonicSong } from './subsonic';

function formatTime(sec: number): string {
  if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDurationHuman(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0m';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

interface Palette {
  primaryRgb: string;
  secondaryRgb: string;
  tertiaryRgb: string;
  brightnessMode?: 'dark' | 'normal' | 'bright';
  avgLuminance?: number;
}

interface DiscoverResult {
  id: string;
  source: 'spotify' | 'soundcloud' | 'youtube';
  title: string;
  artist: string;
  album: string;
  duration: number;
  artworkUrl: string;
  releaseYear: string;
  url: string;
  isExplicit?: boolean;
}

interface FileBrowserShareResult {
  shareUrl: string;
  downloadUrl: string;
  title: string;
  artist: string;
  path: string;
  expire?: number;
  expiresText?: string;
  songId?: string;
}

interface ActiveListenerSession {
  sessionId: string;
  username: string;
  songId: string;
  title: string;
  artist: string;
  album: string;
  coverArt: string;
  directStreamUrl?: string;
  directCoverUrl?: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  allowJoin: boolean;
  listeningTo: string | null;
  listeners: string[];
  updatedAt: number;
}

const DEFAULT_PALETTE: Palette = {
  primaryRgb: '168, 85, 247',
  secondaryRgb: '99, 102, 241',
  tertiaryRgb: '217, 70, 239',
  brightnessMode: 'normal',
  avgLuminance: 0.42,
};

function adjustRgbForLyricContrast(rgbStr: string, isDark: boolean): string {
  const parts = rgbStr.split(',').map((n) => parseFloat(n.trim()));
  if (parts.length < 3 || parts.some((n) => !isFinite(n))) {
    return isDark ? '240, 244, 255' : '30, 41, 59';
  }
  const [h, s, l] = rgbToHsl(parts[0], parts[1], parts[2]);
  if (isDark) {
    // Guarantee luminous, high-contrast lyric colors on dark, obsidian, or frosted backgrounds
    const targetL = Math.max(0.78, Math.min(0.92, l < 0.35 ? 0.86 : l + 0.24));
    const targetS = s < 0.14 ? Math.min(0.22, s) : Math.min(0.95, Math.max(0.55, s));
    return hslToRgbString(h, targetS, targetL);
  }
  // In light mode, deepen lyric colors so they stay razor-sharp on bright/white backgrounds
  const targetL = Math.min(0.34, Math.max(0.16, l - 0.22));
  const targetS = s < 0.14 ? Math.min(0.25, s) : Math.min(0.95, Math.max(0.65, s));
  return hslToRgbString(h, targetS, targetL);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgbString(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  const hue = ((h % 360) + 360) % 360;
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const r = Math.min(255, Math.max(0, Math.round((r1 + m) * 255)));
  const g = Math.min(255, Math.max(0, Math.round((g1 + m) * 255)));
  const b = Math.min(255, Math.max(0, Math.round((b1 + m) * 255)));
  return `${r}, ${g}, ${b}`;
}

function extractAccurateAlbumPalette(img: HTMLImageElement): Palette {
  const canvas = document.createElement('canvas');
  const size = 36;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return DEFAULT_PALETTE;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  // 12 hue buckets (30deg each) + fallback average for monochrome covers
  const buckets = Array.from({ length: 12 }, () => ({
    weight: 0,
    rSum: 0,
    gSum: 0,
    bSum: 0,
    hSum: 0,
    sSum: 0,
    lSum: 0,
    count: 0,
  }));

  let monoR = 0,
    monoG = 0,
    monoB = 0,
    monoCount = 0;

  let totalOpaque = 0;
  let luminanceSum = 0;
  let darkPixels = 0;
  let brightPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);

    totalOpaque++;
    const relLum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    luminanceSum += relLum;
    if (l < 0.16 || relLum < 0.13) darkPixels++;
    if (l > 0.78 || relLum > 0.78) brightPixels++;

    if (l > 0.04 && l < 0.96) {
      monoR += r;
      monoG += g;
      monoB += b;
      monoCount++;
    }

    // Ignore near-black, near-white, and flat grey pixels when finding vibrant cover colors
    if (l < 0.08 || l > 0.92 || s < 0.12) continue;

    // Weight by saturation & mid-tone vibrancy so dominant cover colors stand out clearly
    const lBalance = 1 - Math.abs(l - 0.52) * 1.35;
    const weight = Math.pow(s, 1.3) * Math.max(0.2, lBalance) * (0.6 + s);
    const bIdx = Math.min(11, Math.floor(h / 30));
    const bucket = buckets[bIdx];
    bucket.weight += weight;
    bucket.rSum += r * weight;
    bucket.gSum += g * weight;
    bucket.bSum += b * weight;
    bucket.hSum += h * weight;
    bucket.sSum += s * weight;
    bucket.lSum += l * weight;
    bucket.count++;
  }

  const avgLuminance = totalOpaque > 0 ? luminanceSum / totalOpaque : 0.42;
  const darkRatio = totalOpaque > 0 ? darkPixels / totalOpaque : 0;
  const brightRatio = totalOpaque > 0 ? brightPixels / totalOpaque : 0;
  const brightnessMode: 'dark' | 'normal' | 'bright' =
    darkRatio >= 0.56 || avgLuminance <= 0.17
      ? 'dark'
      : brightRatio >= 0.5 || avgLuminance >= 0.72
      ? 'bright'
      : 'normal';

  const activeBuckets = buckets
    .map((b, idx) => ({ ...b, idx }))
    .filter((b) => b.count > 0 && b.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const normalizeBucketToRgb = (b: (typeof activeBuckets)[0], targetLMin = 0.44, targetLMax = 0.64) => {
    const avgR = b.rSum / b.weight;
    const avgG = b.gSum / b.weight;
    const avgB = b.bSum / b.weight;
    const [h, s, l] = rgbToHsl(avgR, avgG, avgB);
    const boostedS =
      brightnessMode === 'dark'
        ? Math.min(0.72, Math.max(0.28, s * 0.95))
        : brightnessMode === 'bright'
        ? Math.min(0.68, Math.max(0.22, s * 0.9))
        : Math.min(0.95, Math.max(0.45, s * 1.18));
    const clampedL = Math.min(targetLMax, Math.max(targetLMin, l));
    return { rgb: hslToRgbString(h, boostedS, clampedL), h, s: boostedS, l: clampedL };
  };

  if (activeBuckets.length === 0) {
    // True black / obsidian album cover: stay genuinely dark instead of falling back to bright purple!
    if (brightnessMode === 'dark') {
      return {
        primaryRgb: '56, 62, 76',
        secondaryRgb: '26, 30, 38',
        tertiaryRgb: '78, 86, 104',
        brightnessMode: 'dark',
        avgLuminance,
      };
    }
    // Pure white / bright monochrome album cover: soft frosted pearl-slate (never blinding white!)
    if (brightnessMode === 'bright') {
      return {
        primaryRgb: '148, 158, 174',
        secondaryRgb: '112, 122, 138',
        tertiaryRgb: '172, 180, 194',
        brightnessMode: 'bright',
        avgLuminance,
      };
    }
    // Mid-tone monochrome / B&W album cover fallback
    if (monoCount > 0) {
      const mr = monoR / monoCount;
      const mg = monoG / monoCount;
      const mb = monoB / monoCount;
      const [h, s, l] = rgbToHsl(mr, mg, mb);
      const baseL = Math.min(0.56, Math.max(0.32, l));
      const baseS = Math.min(0.3, Math.max(0.08, s));
      return {
        primaryRgb: hslToRgbString(h || 220, baseS, baseL),
        secondaryRgb: hslToRgbString(((h || 220) + 25) % 360, baseS, Math.max(0.24, baseL - 0.08)),
        tertiaryRgb: hslToRgbString(((h || 220) + 335) % 360, baseS, Math.min(0.62, baseL + 0.08)),
        brightnessMode,
        avgLuminance,
      };
    }
    return DEFAULT_PALETTE;
  }

  const pLMin = brightnessMode === 'dark' ? 0.28 : brightnessMode === 'bright' ? 0.42 : 0.44;
  const pLMax = brightnessMode === 'dark' ? 0.44 : brightnessMode === 'bright' ? 0.56 : 0.6;
  const primary = normalizeBucketToRgb(activeBuckets[0], pLMin, pLMax);

  // Pick secondary bucket that is visually distinct in hue if available
  const secondBucket =
    activeBuckets.find((b, i) => i > 0 && Math.abs(b.idx - activeBuckets[0].idx) >= 2 && Math.abs(b.idx - activeBuckets[0].idx) <= 10) ||
    activeBuckets[1] ||
    activeBuckets[0];
  const secondary =
    secondBucket !== activeBuckets[0]
      ? normalizeBucketToRgb(secondBucket, Math.max(0.22, pLMin - 0.05), Math.max(0.36, pLMax - 0.04))
      : {
          rgb: hslToRgbString((primary.h + 32) % 360, Math.max(0.32, primary.s * 0.9), Math.max(0.22, primary.l - 0.08)),
          h: (primary.h + 32) % 360,
          s: primary.s,
          l: primary.l,
        };

  const thirdBucket =
    activeBuckets.find(
      (b, i) =>
        i > 1 &&
        b !== secondBucket &&
        Math.abs(b.idx - activeBuckets[0].idx) >= 1
    ) || activeBuckets[2];
  const tertiary = thirdBucket
    ? normalizeBucketToRgb(thirdBucket, pLMin, Math.min(0.62, pLMax + 0.04))
    : {
        rgb: hslToRgbString((primary.h + 325) % 360, Math.min(0.88, primary.s * 1.02), Math.min(0.62, primary.l + 0.06)),
      };

  return {
    primaryRgb: primary.rgb,
    secondaryRgb: secondary.rgb,
    tertiaryRgb: tertiary.rgb,
    brightnessMode,
    avgLuminance,
  };
}

function isEnglishText(s: string): boolean {
  if (!s) return true;
  let alpha = 0;
  let nonLatin = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code > 127) {
      alpha++;
      if (code > 0x024f) nonLatin++;
    }
  }
  if (alpha > 0 && nonLatin / alpha > 0.15) return false;
  return true;
}

function scoreSongMatch(song: SubsonicSong, rawQuery: string): number {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 1;
  const title = (song.title || '').toLowerCase();
  const artist = (song.artist || '').toLowerCase();
  const album = (song.album || '').toLowerCase();
  const combined = `${title} ${artist} ${album}`;

  let baseScore = 0;
  if (title === q) baseScore = 100;
  else if (title.startsWith(q)) baseScore = 85;
  else if (title.includes(q)) baseScore = 70;
  else if (artist.includes(q)) baseScore = 55;
  else if (album.includes(q)) baseScore = 40;
  else {
    const tokens = q.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && tokens.every((t) => combined.includes(t))) {
      baseScore = 50;
    } else {
      let qi = 0;
      for (let i = 0; i < title.length && qi < q.length; i++) {
        if (title[i] === q[qi]) qi++;
      }
      if (qi === q.length) baseScore = 25;
    }
  }

  if (baseScore > 0 && isEnglishText(`${song.title || ''} ${song.artist || ''}`)) {
    baseScore += 15;
  }

  return baseScore;
}

interface QueueItemRowProps {
  song: SubsonicSong;
  idx: number;
  isCurrent: boolean;
  isSelected: boolean;
  isDownloaded: boolean;
  thumbUrl: string | null;
  primaryRgb: string;
  isFirst: boolean;
  isLast: boolean;
  onToggleSelect: (idx: number, isShift?: boolean) => void;
  onPlay: (song: SubsonicSong, idx: number) => void;
  onReorderUp: (idx: number) => void;
  onReorderDown: (idx: number) => void;
  onAddToPlaylist: (song: SubsonicSong) => void;
  onRemove: (idx: number) => void;
  isDragging?: boolean;
  isDragOver?: 'before' | 'after' | null;
  onRowDragStart?: (e: React.DragEvent, idx: number) => void;
  onRowDragOver?: (e: React.DragEvent, idx: number) => void;
  onRowDragLeave?: (e: React.DragEvent, idx: number) => void;
  onRowDrop?: (e: React.DragEvent, idx: number) => void;
  onRowDragEnd?: (e: React.DragEvent) => void;
}

const QueueItemRow = React.memo<QueueItemRowProps>(
  ({
    song,
    idx,
    isCurrent,
    isSelected,
    isDownloaded,
    thumbUrl,
    primaryRgb,
    isFirst,
    isLast,
    onToggleSelect,
    onPlay,
    onReorderUp,
    onReorderDown,
    onAddToPlaylist,
    onRemove,
    isDragging,
    isDragOver,
    onRowDragStart,
    onRowDragOver,
    onRowDragLeave,
    onRowDrop,
    onRowDragEnd,
  }) => {
    return (
      <div
        draggable
        onDragStart={(e) => onRowDragStart?.(e, idx)}
        onDragOver={(e) => onRowDragOver?.(e, idx)}
        onDragLeave={(e) => onRowDragLeave?.(e, idx)}
        onDrop={(e) => onRowDrop?.(e, idx)}
        onDragEnd={(e) => onRowDragEnd?.(e)}
        style={
          isCurrent
            ? {
                backgroundColor: `rgba(${primaryRgb}, 0.22)`,
                borderColor: `rgba(${primaryRgb}, 0.45)`,
              }
            : isSelected
            ? {
                backgroundColor: `rgba(${primaryRgb}, 0.12)`,
                borderColor: `rgba(${primaryRgb}, 0.28)`,
              }
            : undefined
        }
        className={`group flex items-center justify-between p-2 rounded-2xl border transition relative select-none ${
          isDragging ? 'opacity-40 scale-[0.98]' : ''
        } ${
          isDragOver === 'before'
            ? 'border-t-2 !border-t-purple-400'
            : isDragOver === 'after'
            ? 'border-b-2 !border-b-purple-400'
            : isCurrent || isSelected
            ? ''
            : 'border-transparent hover:bg-white/10'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/80 transition -mr-1 p-0.5 hidden sm:flex items-center shrink-0"
            title="Drag to reorder (Shift-select multiple to move as a group)"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(idx, e.shiftKey);
            }}
            className={`w-4 h-4 rounded-md border shrink-0 flex items-center justify-center transition ${
              isSelected
                ? 'border-transparent text-white'
                : 'border-white/30 bg-black/25 hover:border-white/60'
            }`}
            style={isSelected ? { backgroundColor: `rgb(${primaryRgb})` } : undefined}
            title="Select song (Shift-click to select range)"
          >
            {isSelected && <Check className="w-3 h-3" />}
          </button>

          <div
            onClick={(e) => {
              if (e.shiftKey) {
                e.preventDefault();
                onToggleSelect(idx, true);
              } else {
                onPlay(song, idx);
              }
            }}
            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
          >
            <span className="text-xs font-mono opacity-50 w-4 text-center shrink-0">
              {idx + 1}
            </span>
            <div className="w-9 h-9 rounded-xl overflow-hidden bg-black/30 border border-white/10 shrink-0 flex items-center justify-center">
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={song.title}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    const fallback = `/api/discover/cover?id=${encodeURIComponent(song.id)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`;
                    if (!e.currentTarget.src.includes('/api/discover/cover')) {
                      e.currentTarget.src = fallback;
                    }
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc3 className="w-4 h-4 opacity-40" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate flex items-center gap-1.5">
                <span className="truncate">{song.title}</span>
                {isDownloaded && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                    title="Saved offline"
                  />
                )}
              </p>
              <p className="text-[11px] opacity-60 truncate">
                {song.artist} • {formatTime(song.duration)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-75 group-hover:opacity-100">
          <button
            onClick={() => onReorderUp(idx)}
            disabled={isFirst}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-20"
            title="Move Up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onReorderDown(idx)}
            disabled={isLast}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-20"
            title="Move Down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onAddToPlaylist(song)}
            className="p-1 rounded hover:bg-white/10 text-xs"
            title="Add to Playlist"
          >
            <ListPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemove(idx)}
            className="p-1 rounded hover:bg-red-500/20 text-red-300"
            title="Remove from Queue"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }
);

interface LibraryItemRowProps {
  song: SubsonicSong;
  isDownloaded: boolean;
  isDownloading: boolean;
  thumbUrl: string | null;
  primaryRgb: string;
  onPlay: (song: SubsonicSong) => void;
  onAddToQueue: (song: SubsonicSong) => void;
  onShare: (song: SubsonicSong) => void;
  onDownloadToggle: (song: SubsonicSong) => void;
  onAddToPlaylist: (song: SubsonicSong) => void;
  onDeleteFromDatabase?: (song: SubsonicSong) => void;
}

const LibraryItemRow = React.memo<LibraryItemRowProps>(
  ({
    song,
    isDownloaded,
    isDownloading,
    thumbUrl,
    primaryRgb,
    onPlay,
    onAddToQueue,
    onShare,
    onDownloadToggle,
    onAddToPlaylist,
    onDeleteFromDatabase,
  }) => {
    return (
      <div className="group relative flex items-center justify-between p-2 rounded-2xl hover:bg-white/10 transition">
        <div
          onClick={() => onPlay(song)}
          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/30 border border-white/10 shrink-0 flex items-center justify-center">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={song.title}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  const fallback = `/api/discover/cover?id=${encodeURIComponent(song.id)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`;
                  if (!e.currentTarget.src.includes('/api/discover/cover')) {
                    e.currentTarget.src = fallback;
                  }
                }}
                className="w-full h-full object-cover"
              />
            ) : (
              <Disc3 className="w-4 h-4 opacity-40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate flex items-center gap-1.5">
              <span className="truncate">{song.title}</span>
              {song.starred && (
                <Heart className="w-3 h-3 text-pink-400 fill-current shrink-0" />
              )}
            </p>
            <p className="text-[11px] opacity-60 truncate">
              {song.artist} • {song.album || 'Unknown Album'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] opacity-40 font-mono hidden sm:inline mr-1">
            {formatTime(song.duration)}
          </span>
          <button
            onClick={() => onAddToQueue(song)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-xs text-white/75 hover:text-white"
            title="Add to Queue"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onShare(song)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-xs opacity-60 hover:opacity-100"
            title="Share via FileBrowser Public Link"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDownloadToggle(song)}
            disabled={isDownloading}
            className={`p-1.5 rounded-lg text-xs transition ${
              isDownloaded
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'hover:bg-white/10 text-white/70'
            }`}
            title={
              isDownloaded
                ? 'Downloaded offline (tap to remove)'
                : 'Download for 100% offline playback'
            }
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isDownloaded ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => onAddToPlaylist(song)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-xs"
            title="Add to Playlist"
          >
            <ListPlus
              className="w-3.5 h-3.5"
              style={{ color: `rgb(${primaryRgb})` }}
            />
          </button>
          {onDeleteFromDatabase && (
            <button
              onClick={() => onDeleteFromDatabase(song)}
              className="p-1.5 rounded-lg hover:bg-red-500/20 text-xs text-red-400/60 hover:text-red-300 transition"
              title="Delete Song from Database (Permanent)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

export const App: React.FC = () => {
  const {
    theme,
    setTheme,
    toggleTheme,
    uiStyle,
    setUiStyle,
    shareServerUrl,
    shareApiToken,
    setShareServerConfig,
    activeView,
    setActiveView,
    visualizerMode,
    setVisualizerMode,
    cycleVisualizerMode,
    visualizerBarAlign,
    setVisualizerBarAlign,
    cycleVisualizerBarAlign,
    streamQuality,
    cycleStreamQuality,
    searchQuery,
    setSearchQuery,
    authModalOpen,
    setAuthModalOpen,
    eqBands,
    eqPreset,
    bassBoost,
    playbackRate,
    preservePitch,
    crossfadeSeconds,
    setEqBand,
    applyEqPreset,
    setBassBoost,
    setPlaybackRate,
    setPreservePitch,
    setCrossfadeSeconds,
    lyricColorMode,
    lyricCustomColor,
    setLyricColorMode,
    setLyricCustomColor,
    resetLyricColor,
    allowListenAlong,
    setAllowListenAlong,
    listeningAlongTo,
    setListeningAlongTo,
    discordRpcEnabled,
    setDiscordRpcEnabled,
    baseUrl,
    username,
    isConnected,
    isLoading,
    isResyncing,
    resyncProgress,
    resyncLibrary,
    error,
    client,
    librarySongs,
    starredSongs,
    playlists,
    playlistFolders,
    savedArtists,
    selectedPlaylist,
    createPlaylistFolder,
    renamePlaylistFolder,
    deletePlaylistFolder,
    assignPlaylistToFolder,
    toggleSaveArtist,
    copyPublicPlaylistToMine,
    removeMultipleSongsFromPlaylist,
    queue,
    currentIndex,
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    shuffle,
    currentLyrics,
    lyricsLoading,
    downloadedIds: downloadedSongIds,
    downloadingIds: downloadingSongIds,
    offlineSongs,
    offlinePlaylists,
    offlineSongPlaylists,
    offlineCoverUrls,
    listeningStats,
    initFromStorage,
    reconnectAndSync,
    connectServer,
    searchLibrary,
    loadPlaylists,
    selectPlaylist,
    createNewPlaylist,
    deleteExistingPlaylist,
    addSongToPlaylist,
    addSongsToPlaylist,
    removeSongFromPlaylist,
    reorderPlaylistTracks,
    movePlaylistTracks,
    toggleStarSong,
    playSong,
    playQueueIndex,
    playNextInQueue,
    setIsPlaying,
    setVolume,
    toggleMute,
    nextTrack,
    prevTrack,
    reorderQueue,
    moveQueueSongs,
    removeFromQueue,
    removeMultipleFromQueue,
    clearQueue,
    addToQueue,
    toggleShuffle,
    cycleRepeat,
    loadLyricsForSong,
    setCurrentLyrics,
    downloadSongForOffline,
    removeOfflineSong,
    clearAllOfflineSongs,
    createOfflinePlaylist,
    deleteOfflinePlaylist,
    assignSongToOfflinePlaylist,
    removeSongFromOfflinePlaylist,
    syncWrappedWithServer,
    deleteSongFromDatabase,
  } = usePlayerStore();

  const [serverInput, setServerInput] = useState(baseUrl || '');
  const [newPlaylistFolderName, setNewPlaylistFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({});
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [librarySection, setLibrarySection] = useState<'overview' | 'offline' | 'liked' | 'playlists' | 'artists'>('overview');
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [selectedPlaylistTrackIndices, setSelectedPlaylistTrackIndices] = useState<number[]>([]);
  const [randomSeed, setRandomSeed] = useState<number>(() => Date.now());
  const [discoverOffset, setDiscoverOffset] = useState<number>(0);
  const [discoverHasMore, setDiscoverHasMore] = useState<boolean>(false);
  const [discoverLoadingMore, setDiscoverLoadingMore] = useState<boolean>(false);
  const [userInput, setUserInput] = useState(username || '');
  const [passInput, setPassInput] = useState('');
  const [shareServerInput, setShareServerInput] = useState(shareServerUrl || '');
  const [shareTokenInput, setShareTokenInput] = useState(shareApiToken || '');
  const [showShareConfigInAuth, setShowShareConfigInAuth] = useState(false);
  const [likedSearchQuery, setLikedSearchQuery] = useState('');
  const [queueSearchQuery, setQueueSearchQuery] = useState('');
  const [shareToast, setShareToast] = useState<string | null>(null);
  const notify = useCallback((msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 3200);
  }, []);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistDropdownSongId, setPlaylistDropdownSongId] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<
    'queue' | 'library' | 'liked' | 'playlists' | 'offline' | 'discover'
  >('queue');

  // Unique per-tab/per-device session ID so multiple listeners or devices on the same Navidrome login never collide in Listen Along
  const clientSessionId = useMemo(() => {
    try {
      const existing = sessionStorage.getItem('liquid_client_session_id');
      if (existing) return existing;
      const created = `sess_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      sessionStorage.setItem('liquid_client_session_id', created);
      return created;
    } catch {
      return `sess_${Math.random().toString(36).slice(2, 10)}`;
    }
  }, []);

  const [listenerDisplayName, setListenerDisplayName] = useState<string>(() => {
    try {
      return localStorage.getItem('liquid_listener_display_name') || '';
    } catch {
      return '';
    }
  });
  const [selectedQueueIndices, setSelectedQueueIndices] = useState<number[]>([]);
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isNetworkOffline, setIsNetworkOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  // Offline Playlist Organization, Search & Remove All Downloads Confirmation on Phone/PC
  const [selectedOfflinePlaylist, setSelectedOfflinePlaylist] = useState<string>('ALL');
  const [offlineSearchQuery, setOfflineSearchQuery] = useState<string>('');
  const [newOfflinePlaylistName, setNewOfflinePlaylistName] = useState('');
  const [offlineDropdownSongId, setOfflineDropdownSongId] = useState<string | null>(null);
  const [confirmClearAllOffline, setConfirmClearAllOffline] = useState(false);

  // Equalizer & Crossfade Studio Modal
  const [eqModalOpen, setEqModalOpen] = useState(false);

  // Add to Playlist Modal state (Supports single song or multiple selected queue songs)
  const [addToPlaylistSongs, setAddToPlaylistSongs] = useState<SubsonicSong[] | null>(null);
  const [newPlaylistNameInput, setNewPlaylistNameInput] = useState('');
  const [creatingNewPlaylist, setCreatingNewPlaylist] = useState(false);

  // FileBrowser Public Share Link Modal (Default expiration: 1 hour)
  const [shareModalData, setShareModalData] = useState<FileBrowserShareResult | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareExpires, setShareExpires] = useState<string>('1h');

  // Live Users Listening & "Listen Along" state
  const [activeListeners, setActiveListeners] = useState<ActiveListenerSession[]>([]);
  const [listenAlongModalOpen, setListenAlongModalOpen] = useState(false);

  // Privacy-Safe Discord Rich Presence (RPC) state
  const [discordModalOpen, setDiscordModalOpen] = useState(false);
  const [discordBridgeStatus, setDiscordBridgeStatus] = useState<
    'idle' | 'connected' | 'bridge_offline'
  >('idle');
  const [discordPublicArtwork, setDiscordPublicArtwork] = useState<string>('');

  // Shareable Liquid Wrapped Story Card state
  const [wrappedCardUrl, setWrappedCardUrl] = useState<string | null>(null);
  const [wrappedCardModalOpen, setWrappedCardModalOpen] = useState(false);
  const [generatingWrappedCard, setGeneratingWrappedCard] = useState(false);

  // Permanent Delete Song from Database state
  const [songToDelete, setSongToDelete] = useState<SubsonicSong | null>(null);
  const [isDeletingSong, setIsDeletingSong] = useState(false);

  // Enhanced Library Search & Filtering state
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'starred' | 'offline'>('all');
  const [librarySort, setLibrarySort] = useState<'title' | 'artist' | 'duration'>('title');
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [spotlightQuery, setSpotlightQuery] = useState('');
  const [spotlightServerResults, setSpotlightServerResults] = useState<SubsonicSong[]>([]);
  const spotlightDebounceTimer = useRef<number | null>(null);
  const searchDebounceTimer = useRef<number | null>(null);

  // 3D Floating Mouse-Reactive Album Cover state (Desktop)
  const [artTilt, setArtTilt] = useState<{
    rotateX: number;
    rotateY: number;
    glareX: number;
    glareY: number;
    active: boolean;
  }>({
    rotateX: 0,
    rotateY: 0,
    glareX: 50,
    glareY: 50,
    active: false,
  });
  const artworkCardRef = useRef<HTMLDivElement | null>(null);

  // Pop-Out Mini Player state + Close/Hide Main Window while Mini Player Open + Cover-Only & 1-Line Lyric on Cover
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [inAppMiniPlayer, setInAppMiniPlayer] = useState(false);
  const [mainWindowHidden, setMainWindowHidden] = useState(false);
  const [miniCoverOnly, setMiniCoverOnly] = useState(false);
  const [miniShowLyricOnCover, setMiniShowLyricOnCover] = useState(true);
  const [miniPlayerSize, setMiniPlayerSize] = useState<{ width: number; height: number }>({
    width: 310,
    height: 390,
  });
  const [isDraggingVol, setIsDraggingVol] = useState(false);

  // Discover / Add Music & Full Playlist Importer state
  const [discoverSource, setDiscoverSource] = useState<'spotify' | 'soundcloud' | 'youtube'>(
    'spotify'
  );
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([]);
  const [discoverIsPlaylist, setDiscoverIsPlaylist] = useState(false);
  const [discoverPlaylistName, setDiscoverPlaylistName] = useState('');
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [importingIds, setImportingIds] = useState<Record<string, boolean>>({});
  const [importedIds, setImportedIds] = useState<Record<string, boolean>>({});
  const [importedFileMap, setImportedFileMap] = useState<Record<string, string>>({});
  const [importedNavIds, setImportedNavIds] = useState<Record<string, string>>({});
  const [importedCoverMap, setImportedCoverMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('liquid_imported_covers');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Mobile optimization: Progressive display limits to eliminate mobile DOM bloat and memory pressure
  const [queueDisplayLimit, setQueueDisplayLimit] = useState(60);
  const [libraryDisplayLimit, setLibraryDisplayLimit] = useState(60);
  const thumbUrlCacheRef = useRef<Map<string, string | null>>(new Map());

  const saveImportedCovers = (entries: Record<string, string>) => {
    setImportedCoverMap((prev) => {
      const next = { ...prev, ...entries };
      try {
        localStorage.setItem('liquid_imported_covers', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // User Stats Comparison in Wrapped section
  const [compareUser, setCompareUser] = useState<string | null>(null);
  const [compareStats, setCompareStats] = useState<ListeningStatsData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [availableWrappedUsers, setAvailableWrappedUsers] = useState<string[]>([]);
  const [comparingDropdownOpen, setComparingDropdownOpen] = useState(false);

  const fetchAvailableWrappedUsers = async () => {
    try {
      const res = await fetch('/api/wrapped-users');
      if (res.ok) {
        const data = await res.json();
        if (data && data.status === 'ok' && Array.isArray(data.users)) {
          setAvailableWrappedUsers(data.users);
        }
      }
    } catch {}
  };

  const handleSelectCompareUser = async (targetUser: string) => {
    if (!targetUser) {
      setCompareUser(null);
      setCompareStats(null);
      return;
    }
    setCompareUser(targetUser);
    setCompareLoading(true);
    setComparingDropdownOpen(false);
    try {
      const res = await fetch(`/api/wrapped/${encodeURIComponent(targetUser)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && data.stats) {
          setCompareStats(data.stats);
          notify(`Loaded Liquid Wrapped stats for "${targetUser}"`);
        }
      }
    } catch {
      notify(`Unable to load stats for "${targetUser}"`);
    } finally {
      setCompareLoading(false);
    }
  };

  const [bulkImportProgress, setBulkImportProgress] = useState<{
    done: number;
    total: number;
    name: string;
  } | null>(null);

  // Lyrics editor & custom color picker state
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [manualLyricsText, setManualLyricsText] = useState('');

  const activeLyricRef = useRef<HTMLDivElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const lyricLineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [userScrolledLyrics, setUserScrolledLyrics] = useState(false);
  const userScrollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  // Handle opening shared track via LiquidPlayer link (?share=<hash>&song=<id>)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const shareHash = params.get('share');
    const songId = params.get('song');
    if (!shareHash) return;

    // Clean URL search parameters without page refresh
    window.history.replaceState({}, document.title, window.location.pathname);

    (async () => {
      notify('Opening shared track in LiquidPlayer...');
      try {
        const query = songId ? `?song_id=${encodeURIComponent(songId)}` : '';
        const res = await fetch(`/api/share/track/${encodeURIComponent(shareHash)}${query}`);
        const data = await res.json();
        if (res.ok && data.status === 'ok' && data.song) {
          playSong(data.song);
          setActiveView('home');
          notify(`Playing shared track "${data.song.title}" (${data.song.artist})!`);
        } else {
          notify(data.message || 'This shared track link has expired or is invalid.');
        }
      } catch {
        notify('Could not load shared track.');
      }
    })();
  }, []);

  useEffect(() => {
    if (baseUrl) setServerInput(baseUrl);
    if (username) setUserInput(username);
    setShareServerInput(shareServerUrl || '');
    setShareTokenInput(shareApiToken || '');
  }, [baseUrl, username, shareServerUrl, shareApiToken]);

  const joinListenAlongSession = useCallback(
    async (hostSession: ActiveListenerSession) => {
      const state = usePlayerStore.getState();
      const targetKey = hostSession.sessionId || hostSession.username;
      state.setListeningAlongTo(targetKey);

      let matchedSong: SubsonicSong | undefined =
        state.librarySongs.find((s) => s.id === hostSession.songId) ||
        state.offlineSongs.find((s) => s.id === hostSession.songId);

      if (!matchedSong && state.client && !hostSession.songId.startsWith('local:') && !hostSession.songId.startsWith('imported-')) {
        try {
          const searched = await state.client.fetchSongs(hostSession.title);
          matchedSong =
            searched.find((s) => s.id === hostSession.songId) ||
            searched.find(
              (s) =>
                s.title.toLowerCase().trim() === hostSession.title.toLowerCase().trim() &&
                s.artist.toLowerCase().trim() === hostSession.artist.toLowerCase().trim()
            ) ||
            searched[0];
        } catch {}
      }

      const fallbackStream =
        hostSession.directStreamUrl ||
        (hostSession.songId.startsWith('local:') || hostSession.songId.startsWith('imported-')
          ? `/api/discover/stream?file=${encodeURIComponent(
              hostSession.songId.replace(/^local:/, '')
            )}&title=${encodeURIComponent(hostSession.title)}&artist=${encodeURIComponent(
              hostSession.artist
            )}`
          : undefined);

      const fallbackCover =
        hostSession.directCoverUrl ||
        `/api/discover/cover?id=${encodeURIComponent(hostSession.songId)}&title=${encodeURIComponent(
          hostSession.title
        )}&artist=${encodeURIComponent(hostSession.artist)}`;

      const playableSong: SubsonicSong = matchedSong
        ? ({
            ...matchedSong,
            directStreamUrl: (matchedSong as any).directStreamUrl || fallbackStream,
            directCoverUrl: (matchedSong as any).directCoverUrl || fallbackCover,
          } as SubsonicSong)
        : ({
            id: hostSession.songId,
            title: hostSession.title,
            artist: hostSession.artist,
            album: hostSession.album || 'LiquidPlayer',
            duration: hostSession.duration || 180,
            coverArt: hostSession.coverArt || hostSession.songId,
            directStreamUrl: fallbackStream,
            directCoverUrl: fallbackCover,
          } as SubsonicSong);

      const targetTime = Math.max(0, hostSession.currentTime || 0);
      audioController.pendingResumeTime = targetTime;
      state.playSong(playableSong);
      state.setCurrentTime(targetTime);
      if (!hostSession.isPlaying) {
        state.setIsPlaying(false);
      }
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('liquid-seek', { detail: targetTime }));
      }, 280);
    },
    []
  );

  // Live Users Listening Heartbeat & Real-Time "Listen Along" Synchronization
  const lastListenersSigRef = useRef<string>('');
  useEffect(() => {
    if (isNetworkOffline) return;

    const syncPresence = async () => {
      const state = usePlayerStore.getState();
      // Mobile battery & CPU optimization: skip background polling when screen is locked unless actively listening along or playing
      if (document.hidden && !state.listeningAlongTo && !state.isPlaying) return;
      const myAccountName = (state.username || 'guest').trim() || 'guest';
      const customNick = listenerDisplayName.trim();
      const myDisplayName = customNick || myAccountName;

      try {
        if (state.currentSong) {
          const curSongAny = state.currentSong as any;
          await fetch('/api/presence/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: clientSessionId,
              username: myAccountName,
              displayName: myDisplayName,
              song: {
                id: state.currentSong.id,
                title: state.currentSong.title,
                artist: state.currentSong.artist,
                album: state.currentSong.album || '',
                coverArt: state.currentSong.coverArt || state.currentSong.id,
                duration: state.duration || state.currentSong.duration || 0,
                directStreamUrl: curSongAny.directStreamUrl || '',
                directCoverUrl: curSongAny.directCoverUrl || '',
              },
              currentTime: state.currentTime,
              duration: state.duration || state.currentSong.duration || 0,
              isPlaying: state.isPlaying,
              playbackRate: state.playbackRate || 1,
              allowJoin: state.allowListenAlong,
              listeningToHost: state.listeningAlongTo,
            }),
          });
        }

        const res = await fetch('/api/presence/active');
        if (!res.ok) return;
        const data = await res.json();
        const sessions: ActiveListenerSession[] = (data.users || [])
          .filter((u: any) => u && u.song && u.song.id)
          .map((u: any) => ({
            sessionId: u.sessionId || u.userKey || u.username,
            username: u.username,
            songId: u.song.id,
            title: u.song.title || 'Unknown',
            artist: u.song.artist || '',
            album: u.song.album || '',
            coverArt: u.song.coverArt || u.song.id,
            directStreamUrl: u.song.directStreamUrl || '',
            directCoverUrl: u.song.directCoverUrl || '',
            currentTime: u.currentTime || 0,
            duration: u.duration || u.song.duration || 0,
            isPlaying: Boolean(u.isPlaying),
            allowJoin: Boolean(u.allowJoin),
            listeningTo: u.listeningToHost || null,
            listeners: u.listeners || [],
            updatedAt: Date.now() - (u.secondsAgo || 0) * 1000,
          }));
        const sig = sessions
          .map(
            (s) =>
              `${s.sessionId}:${s.username}:${s.songId}:${s.isPlaying ? 1 : 0}:${
                s.allowJoin ? 1 : 0
              }:${s.listeners.length}:${Math.floor(s.currentTime / 3)}`
          )
          .join('|');
        if (sig !== lastListenersSigRef.current || state.listeningAlongTo || listenAlongModalOpen) {
          lastListenersSigRef.current = sig;
          setActiveListeners(sessions);
        }

        // If user is currently "Listening Along" to another user, keep their song, play/pause, and timestamp synced
        const targetHost = state.listeningAlongTo;
        if (targetHost) {
          const hostSession = sessions.find(
            (s) =>
              s.sessionId.toLowerCase() === targetHost.toLowerCase() ||
              s.username.toLowerCase() === targetHost.toLowerCase()
          );
          if (!hostSession || !hostSession.allowJoin) {
            state.setListeningAlongTo(null);
            setShareToast(
              hostSession && !hostSession.allowJoin
                ? `${hostSession.username} turned off Listen Along`
                : `Host stopped listening`
            );
            setTimeout(() => setShareToast(null), 3200);
            return;
          }

          if (hostSession.songId && state.currentSong?.id !== hostSession.songId) {
            await joinListenAlongSession(hostSession);
          } else if (state.currentSong?.id === hostSession.songId) {
            if (state.isPlaying !== hostSession.isPlaying) {
              state.setIsPlaying(hostSession.isPlaying);
            }
            const drift = Math.abs((state.currentTime || 0) - (hostSession.currentTime || 0));
            if (drift > 2.4) {
              window.dispatchEvent(
                new CustomEvent('liquid-seek', { detail: hostSession.currentTime })
              );
            }
          }
        }
      } catch {
        // Ignore transient network errors
      }
    };

    syncPresence();
    const timer = setInterval(syncPresence, 2800);
    return () => clearInterval(timer);
  }, [
    isNetworkOffline,
    clientSessionId,
    listenerDisplayName,
    listeningAlongTo,
    listenAlongModalOpen,
    currentSong?.id,
    isPlaying,
    joinListenAlongSession,
  ]);

  // Resolve privacy-safe public artwork URL for Discord RPC (never exposes private server domain)
  useEffect(() => {
    if (!currentSong) {
      setDiscordPublicArtwork('');
      return;
    }
    let cancelled = false;
    fetch(
      `/api/discord-rpc/artwork?title=${encodeURIComponent(
        currentSong.title || ''
      )}&artist=${encodeURIComponent(currentSong.artist || '')}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDiscordPublicArtwork(d.artworkUrl || '');
      })
      .catch(() => {
        if (!cancelled) setDiscordPublicArtwork('');
      });
    return () => {
      cancelled = true;
    };
  }, [currentSong?.id]);

  // Privacy-Safe Discord Rich Presence (RPC) Local IPC Bridge + Cloud Poll Sync (Zero URLs / Zero Buttons)
  useEffect(() => {
    const syncUser = (username || 'guest').trim().toLowerCase() || 'guest';
    if (!discordRpcEnabled) {
      setDiscordBridgeStatus('idle');
      fetch('/api/discord-rpc/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: syncUser, isPlaying: false }),
      }).catch(() => {});
      fetch('http://127.0.0.1:6473/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ isPlaying: false }),
      }).catch(() => {});
      return;
    }

    const pushDiscordRpc = async () => {
      const state = usePlayerStore.getState();
      const payload = {
        username: syncUser,
        title: state.currentSong?.title || '',
        artist: state.currentSong?.artist || '',
        album: state.currentSong?.album || 'LiquidPlayer',
        currentTime: state.currentTime || 0,
        duration: state.duration || state.currentSong?.duration || 0,
        isPlaying: Boolean(state.currentSong && state.isPlaying),
        artworkUrl: discordPublicArtwork || '',
      };

      let localConnected = false;
      let cloudBridgeConnected = false;

      try {
        const syncRes = await fetch('/api/discord-rpc/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          if (syncData?.bridgeConnected) {
            cloudBridgeConnected = true;
          }
        }
      } catch {
        // ignore network error
      }

      try {
        const localRes = await fetch(
          payload.isPlaying ? 'http://127.0.0.1:6473/rpc' : 'http://127.0.0.1:6473/clear',
          {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify(payload),
          }
        );
        if (localRes.ok) {
          localConnected = true;
        }
      } catch {
        // Localhost fetch may be blocked by browser Private Network Access when using HTTPS; cloud poll handles it automatically
      }

      if (localConnected || cloudBridgeConnected) {
        setDiscordBridgeStatus('connected');
      } else {
        setDiscordBridgeStatus('bridge_offline');
      }
    };

    pushDiscordRpc();
    const interval = setInterval(pushDiscordRpc, 3500);
    return () => clearInterval(interval);
  }, [discordRpcEnabled, currentSong?.id, isPlaying, discordPublicArtwork, username]);

  // Recover lyrics, connection, and features automatically when waking from inactivity or switching to Lyrics view
  useEffect(() => {
    const recoverAfterInactivity = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const st = usePlayerStore.getState();
      if (navigator.onLine) {
        setIsNetworkOffline(false);
        reconnectAndSync();
      }
      if (st.currentSong) {
        const lyr = st.currentLyrics;
        const missingLyrics =
          !lyr ||
          lyr.songId !== st.currentSong.id ||
          (!lyr.isTranscribing &&
            (!Array.isArray(lyr.syncedLines) || lyr.syncedLines.length === 0) &&
            !lyr.plainText);
        if (missingLyrics) {
          st.loadLyricsForSong(st.currentSong);
        }
      }
    };

    const onOnline = () => {
      setIsNetworkOffline(false);
      recoverAfterInactivity();
    };
    const onOffline = () => setIsNetworkOffline(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recoverAfterInactivity();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', recoverAfterInactivity);
    window.addEventListener('pageshow', recoverAfterInactivity);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', recoverAfterInactivity);
      window.removeEventListener('pageshow', recoverAfterInactivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [reconnectAndSync]);

  // Ensure switching to the Lyrics view always triggers lyric loading if empty after inactivity
  useEffect(() => {
    if (activeView !== 'lyrics' || !currentSong) return;
    const missingLyrics =
      !currentLyrics ||
      currentLyrics.songId !== currentSong.id ||
      (!currentLyrics.isTranscribing &&
        (!Array.isArray(currentLyrics.syncedLines) || currentLyrics.syncedLines.length === 0) &&
        !currentLyrics.plainText);
    if (missingLyrics && !lyricsLoading) {
      loadLyricsForSong(currentSong);
    }
  }, [activeView, currentSong?.id]);

  // Capture Chrome/Edge desktop PWA install prompt
  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        if (spotlightOpen) setSpotlightOpen(false);
        if (eqModalOpen) setEqModalOpen(false);
        if (shareModalData) setShareModalData(null);
        if (authModalOpen) setAuthModalOpen(false);
        if (listenAlongModalOpen) setListenAlongModalOpen(false);
        if (discordModalOpen) setDiscordModalOpen(false);
        if (wrappedCardModalOpen) setWrappedCardModalOpen(false);
        if (songToDelete) setSongToDelete(null);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        setIsPlaying(!usePlayerStore.getState().isPlaying);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    authModalOpen,
    spotlightOpen,
    eqModalOpen,
    shareModalData,
    listenAlongModalOpen,
    discordModalOpen,
    wrappedCardModalOpen,
    songToDelete,
    setAuthModalOpen,
    setIsPlaying,
  ]);



  const isGenericPlaylistAlbum = (album?: string) => {
    const a = (album || '').toLowerCase().trim();
    return (
      a === 'spotify' ||
      a === 'soundcloud' ||
      a === 'youtube' ||
      a === 'imported playlist' ||
      a === 'spotify playlist'
    );
  };

  const coverUrl = currentSong
    ? offlineCoverUrls[currentSong.id] ||
      ((currentSong as any).directCoverUrl as string | undefined) ||
      importedCoverMap[currentSong.id] ||
      importedCoverMap[
        `${(currentSong.title || '').toLowerCase().trim()}---${(
          currentSong.artist || ''
        )
          .toLowerCase()
          .trim()}`
      ] ||
      importedCoverMap[(currentSong.title || '').toLowerCase().trim()] ||
      (currentSong.coverArt &&
      (currentSong.coverArt.startsWith('http://') ||
        currentSong.coverArt.startsWith('https://') ||
        currentSong.coverArt.startsWith('data:'))
        ? currentSong.coverArt
        : null) ||
      (isGenericPlaylistAlbum(currentSong.album)
        ? `/api/discover/cover?id=${encodeURIComponent(currentSong.id)}&title=${encodeURIComponent(currentSong.title)}&artist=${encodeURIComponent(currentSong.artist)}`
        : null) ||
      (client && !currentSong.id.startsWith('local:') && !currentSong.id.startsWith('imported-')
        ? client.getCoverArtUrl(currentSong.coverArt || currentSong.id, 600)
        : null) ||
      `/api/discover/cover?id=${encodeURIComponent(currentSong.id)}&title=${encodeURIComponent(currentSong.title)}&artist=${encodeURIComponent(currentSong.artist)}`
    : null;

  const getSongThumbUrl = useCallback((song: SubsonicSong): string | null => {
    if (!song) return null;
    if (offlineCoverUrls[song.id]) return offlineCoverUrls[song.id];
    if ((song as any).directCoverUrl) return (song as any).directCoverUrl;

    if (thumbUrlCacheRef.current.size > 1500) {
      thumbUrlCacheRef.current.clear();
    }
    const cached = thumbUrlCacheRef.current.get(song.id);
    if (cached !== undefined) return cached;

    const normT = (song.title || '').toLowerCase().trim();
    const normA = (song.artist || '').toLowerCase().trim();
    const mapped =
      importedCoverMap[song.id] ||
      importedCoverMap[`${normT}---${normA}`] ||
      importedCoverMap[normT];
    if (mapped) {
      thumbUrlCacheRef.current.set(song.id, mapped);
      return mapped;
    }

    if (
      song.coverArt &&
      (song.coverArt.startsWith('http://') ||
        song.coverArt.startsWith('https://') ||
        song.coverArt.startsWith('data:'))
    ) {
      thumbUrlCacheRef.current.set(song.id, song.coverArt);
      return song.coverArt;
    }

    if (
      song.id.startsWith('local:') ||
      isGenericPlaylistAlbum(song.album) ||
      (song.coverArt && song.coverArt.startsWith('/api/discover/cover'))
    ) {
      const u =
        (song.coverArt && song.coverArt.startsWith('/api/discover/cover') ? song.coverArt : null) ||
        `/api/discover/cover?id=${encodeURIComponent(song.id)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`;
      thumbUrlCacheRef.current.set(song.id, u);
      return u;
    }

    if (client && !song.id.startsWith('imported-')) {
      const u = client.getCoverArtUrl(song.coverArt || song.id, 140);
      thumbUrlCacheRef.current.set(song.id, u);
      return u;
    }

    const u = `/api/discover/cover?id=${encodeURIComponent(song.id)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}`;
    thumbUrlCacheRef.current.set(song.id, u);
    return u;
  }, [client, importedCoverMap, offlineCoverUrls]);

  // Shift-select and drag-and-drop state for Queue & Playlists
  const lastSelectedQueueIdxRef = useRef<number | null>(null);
  const [dragOverQueueIdx, setDragOverQueueIdx] = useState<{
    idx: number;
    pos: 'before' | 'after';
  } | null>(null);
  const [isDraggingQueue, setIsDraggingQueue] = useState<boolean>(false);

  const [selectedPlaylistIndices, setSelectedPlaylistIndices] = useState<number[]>([]);
  const lastSelectedPlaylistIdxRef = useRef<number | null>(null);
  const [dragOverPlaylistIdx, setDragOverPlaylistIdx] = useState<{
    idx: number;
    pos: 'before' | 'after';
  } | null>(null);
  const [isDraggingPlaylist, setIsDraggingPlaylist] = useState<boolean>(false);

  // Stable callbacks for memoized Queue and Library rows
  const handleToggleSelectQueue = useCallback((idx: number, isShift?: boolean) => {
    setSelectedQueueIndices((prev) => {
      if (isShift && lastSelectedQueueIdxRef.current !== null) {
        const start = Math.min(lastSelectedQueueIdxRef.current, idx);
        const end = Math.max(lastSelectedQueueIdxRef.current, idx);
        const range: number[] = [];
        for (let i = start; i <= end; i++) range.push(i);
        return Array.from(new Set([...prev, ...range]));
      } else {
        lastSelectedQueueIdxRef.current = idx;
        return prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx];
      }
    });
  }, []);

  const handleQueueDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      const activeIndices = selectedQueueIndices.includes(idx)
        ? selectedQueueIndices
        : [idx];
      if (!selectedQueueIndices.includes(idx)) {
        setSelectedQueueIndices([idx]);
        lastSelectedQueueIdxRef.current = idx;
      }
      setIsDraggingQueue(true);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(
        'application/json',
        JSON.stringify({ type: 'queue', indices: activeIndices })
      );
    },
    [selectedQueueIndices]
  );

  const handleQueueDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setDragOverQueueIdx((prev) => (prev?.idx === idx && prev?.pos === pos ? prev : { idx, pos }));
  }, []);

  const handleQueueDragLeave = useCallback((e: React.DragEvent, idx: number) => {
    setDragOverQueueIdx((prev) => (prev?.idx === idx ? null : prev));
  }, []);

  const handleQueueDrop = useCallback(
    (e: React.DragEvent, targetIdx: number) => {
      e.preventDefault();
      const dropPos = dragOverQueueIdx?.pos || 'before';
      setDragOverQueueIdx(null);
      setIsDraggingQueue(false);
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.type === 'queue' && Array.isArray(data.indices) && data.indices.length > 0) {
          const newIndices = moveQueueSongs(data.indices, targetIdx, dropPos);
          setSelectedQueueIndices(newIndices);
          const count = data.indices.length;
          notify(`Moved ${count} song${count === 1 ? '' : 's'} in queue`);
        }
      } catch (err) {
        console.error('Queue drop error:', err);
      }
    },
    [dragOverQueueIdx, moveQueueSongs, notify]
  );

  const handleQueueDragEnd = useCallback(() => {
    setDragOverQueueIdx(null);
    setIsDraggingQueue(false);
  }, []);

  // Playlist Shift-select and Drag & Drop callbacks
  const handleToggleSelectPlaylistTrack = useCallback((idx: number, isShift?: boolean) => {
    setSelectedPlaylistIndices((prev) => {
      if (isShift && lastSelectedPlaylistIdxRef.current !== null) {
        const start = Math.min(lastSelectedPlaylistIdxRef.current, idx);
        const end = Math.max(lastSelectedPlaylistIdxRef.current, idx);
        const range: number[] = [];
        for (let i = start; i <= end; i++) range.push(i);
        return Array.from(new Set([...prev, ...range]));
      } else {
        lastSelectedPlaylistIdxRef.current = idx;
        return prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx];
      }
    });
  }, []);

  const handlePlaylistDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      const activeIndices = selectedPlaylistIndices.includes(idx)
        ? selectedPlaylistIndices
        : [idx];
      if (!selectedPlaylistIndices.includes(idx)) {
        setSelectedPlaylistIndices([idx]);
        lastSelectedPlaylistIdxRef.current = idx;
      }
      setIsDraggingPlaylist(true);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(
        'application/json',
        JSON.stringify({ type: 'playlist', indices: activeIndices })
      );
    },
    [selectedPlaylistIndices]
  );

  const handlePlaylistDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after';
    setDragOverPlaylistIdx((prev) =>
      prev?.idx === idx && prev?.pos === pos ? prev : { idx, pos }
    );
  }, []);

  const handlePlaylistDragLeave = useCallback((e: React.DragEvent, idx: number) => {
    setDragOverPlaylistIdx((prev) => (prev?.idx === idx ? null : prev));
  }, []);

  const handlePlaylistDrop = useCallback(
    async (e: React.DragEvent, targetIdx: number) => {
      e.preventDefault();
      const dropPos = dragOverPlaylistIdx?.pos || 'before';
      setDragOverPlaylistIdx(null);
      setIsDraggingPlaylist(false);
      if (!selectedPlaylist) return;
      try {
        const raw = e.dataTransfer.getData('application/json');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.type === 'playlist' && Array.isArray(data.indices) && data.indices.length > 0) {
          const newIndices = await movePlaylistTracks(
            selectedPlaylist.id,
            data.indices,
            targetIdx,
            dropPos
          );
          setSelectedPlaylistIndices(newIndices);
          const count = data.indices.length;
          notify(
            `Moved ${count} song${count === 1 ? '' : 's'} in playlist "${selectedPlaylist.name}"`
          );
        }
      } catch (err) {
        console.error('Playlist drop error:', err);
      }
    },
    [dragOverPlaylistIdx, movePlaylistTracks, selectedPlaylist, notify]
  );

  const handlePlaylistDragEnd = useCallback(() => {
    setDragOverPlaylistIdx(null);
    setIsDraggingPlaylist(false);
  }, []);

  const handlePlaySongCallback = useCallback((song: SubsonicSong) => {
    playSong(song);
  }, [playSong]);

  const handlePlayQueueItemCallback = useCallback(
    (_song: SubsonicSong, idx: number) => {
      playQueueIndex(idx);
    },
    [playQueueIndex]
  );

  const handleReorderUpCallback = useCallback((idx: number) => {
    reorderQueue(idx, idx - 1);
  }, [reorderQueue]);

  const handleReorderDownCallback = useCallback((idx: number) => {
    reorderQueue(idx, idx + 1);
  }, [reorderQueue]);

  const handleAddToPlaylistCallback = useCallback((song: SubsonicSong) => {
    openAddToPlaylistModal(song);
  }, []);

  const handleRemoveFromQueueCallback = useCallback((idx: number) => {
    setSelectedQueueIndices((prev) =>
      prev.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i))
    );
    removeFromQueue(idx);
  }, [removeFromQueue]);

  const handleAddToQueueCallback = useCallback((song: SubsonicSong) => {
    addToQueue(song);
    notify(`Added "${song.title}" to queue`);
  }, [addToQueue]);

  const handleShareSongCallback = useCallback((song: SubsonicSong) => {
    handleShare(song);
  }, []);

  const handleLibraryDownloadToggle = useCallback((song: SubsonicSong) => {
    if (downloadedSongIds[song.id]) {
      removeOfflineSong(song.id);
      notify(`Removed "${song.title}" from offline storage`);
    } else {
      notify(`Saving "${song.title}" for offline playback...`);
      downloadSongForOffline(song).then(() =>
        notify(`Saved "${song.title}" for offline mode!`)
      );
    }
  }, [downloadedSongIds, removeOfflineSong, downloadSongForOffline]);

  const handleDeleteSongPrompt = useCallback((song: SubsonicSong) => {
    setSongToDelete(song);
  }, []);

  const handleConfirmDeleteSong = useCallback(async () => {
    if (!songToDelete) return;
    setIsDeletingSong(true);
    try {
      const ok = await deleteSongFromDatabase(songToDelete.id);
      if (ok) {
        notify(`Permanently deleted "${songToDelete.title}" from server database`);
        setSongToDelete(null);
      } else {
        notify(`Failed to delete "${songToDelete.title}" from server`);
      }
    } catch (e: any) {
      notify(`Error deleting song: ${e?.message || 'Server error'}`);
    } finally {
      setIsDeletingSong(false);
    }
  }, [songToDelete, deleteSongFromDatabase, notify]);

  // Keep queue display limit synced with active track so current playing song is always rendered
  useEffect(() => {
    if (currentIndex >= queueDisplayLimit) {
      setQueueDisplayLimit((prev) => Math.min(queue.length, Math.max(prev, currentIndex + 30)));
    }
  }, [currentIndex, queue.length, queueDisplayLimit]);

  const filteredQueueEntries = useMemo(() => {
    const withIdx = queue.map((song, originalIdx) => ({ song, originalIdx }));
    const q = queueSearchQuery.trim();
    if (!q) return withIdx;
    return withIdx.filter(({ song }) => scoreSongMatch(song, q) > 0);
  }, [queue, queueSearchQuery]);

  const displayedQueueEntries = useMemo(() => {
    if (queueSearchQuery.trim()) {
      return filteredQueueEntries;
    }
    return filteredQueueEntries.slice(0, queueDisplayLimit);
  }, [filteredQueueEntries, queueSearchQuery, queueDisplayLimit]);

  const resolveWrappedSong = (stat: SongPlayStat) => {
    const normT = (stat.title || '').toLowerCase().trim();
    const normA = (stat.artist || '').toLowerCase().trim();
    const realId = (stat as any).realId;

    const matchedSong =
      (realId ? librarySongs.find((s) => s.id === realId) : null) ||
      librarySongs.find((s) => s.id === stat.id) ||
      offlineSongs.find((s) => s.id === stat.id) ||
      librarySongs.find(
        (s) =>
          (s.title || '').toLowerCase().trim() === normT &&
          (s.artist || '').toLowerCase().trim() === normA
      ) ||
      librarySongs.find((s) => (s.title || '').toLowerCase().trim() === normT) ||
      offlineSongs.find((s) => (s.title || '').toLowerCase().trim() === normT);

    const playableSong: SubsonicSong = matchedSong || {
      id: realId || stat.id,
      title: stat.title,
      artist: stat.artist,
      album: stat.album || 'Unknown Album',
      duration: stat.duration || stat.seconds || 180,
      coverArt: stat.coverArt || stat.id,
    };

    let thumb: string | null = matchedSong ? getSongThumbUrl(matchedSong) : null;
    if (!thumb) {
      thumb =
        importedCoverMap[stat.id] ||
        (realId ? importedCoverMap[realId] : null) ||
        importedCoverMap[`${normT}---${normA}`] ||
        importedCoverMap[normT] ||
        offlineCoverUrls[stat.id] ||
        null;
    }
    if (!thumb && stat.coverArt) {
      if (
        stat.coverArt.startsWith('http://') ||
        stat.coverArt.startsWith('https://') ||
        stat.coverArt.startsWith('data:')
      ) {
        thumb = stat.coverArt;
      } else if (
        client &&
        !stat.coverArt.startsWith('local:') &&
        !stat.coverArt.startsWith('imported-') &&
        !stat.coverArt.startsWith('/api')
      ) {
        thumb = client.getCoverArtUrl(stat.coverArt, 140);
      }
    }
    if (!thumb) {
      const artId = realId || stat.id;
      thumb = `/api/discover/cover?id=${encodeURIComponent(artId)}&title=${encodeURIComponent(stat.title)}&artist=${encodeURIComponent(stat.artist)}`;
    }

    return { matchedSong, playableSong, thumb };
  };

  // Extract accurate vibrant color palette from cover art when song changes (with same-origin fallback if external cover blocks CORS)
  useEffect(() => {
    if (!coverUrl) {
      setPalette(DEFAULT_PALETTE);
      return;
    }

    let cancelled = false;
    let triedFallback = false;

    const loadAndExtract = (targetSrc: string) => {
      const img = new Image();
      if (!targetSrc.startsWith('blob:') && !targetSrc.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        if (cancelled) return;
        try {
          const extracted = extractAccurateAlbumPalette(img);
          setPalette(extracted);
        } catch {
          if (!triedFallback && currentSong) {
            triedFallback = true;
            loadAndExtract(
              `/api/discover/cover?id=${encodeURIComponent(
                currentSong.id
              )}&title=${encodeURIComponent(
                currentSong.title || ''
              )}&artist=${encodeURIComponent(currentSong.artist || '')}`
            );
          } else {
            setPalette(DEFAULT_PALETTE);
          }
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        if (!triedFallback && currentSong) {
          triedFallback = true;
          loadAndExtract(
            `/api/discover/cover?id=${encodeURIComponent(
              currentSong.id
            )}&title=${encodeURIComponent(
              currentSong.title || ''
            )}&artist=${encodeURIComponent(currentSong.artist || '')}`
          );
        } else {
          setPalette(DEFAULT_PALETTE);
        }
      };
      img.src = targetSrc;
    };

    loadAndExtract(coverUrl);
    return () => {
      cancelled = true;
    };
  }, [coverUrl, currentSong?.id]);

  // Desktop 3D Mouse-Reactive Album Art Tilt handler
  const handleNowPlayingMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = artworkCardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const normX = Math.max(-1.35, Math.min(1.35, (e.clientX - centerX) / (rect.width * 0.85)));
    const normY = Math.max(-1.35, Math.min(1.35, (e.clientY - centerY) / (rect.height * 0.85)));

    const maxDeg = 15;
    const rotateY = normX * maxDeg;
    const rotateX = -normY * maxDeg;
    const glareX = Math.round(50 + normX * 38);
    const glareY = Math.round(50 + normY * 38);

    setArtTilt({
      rotateX,
      rotateY,
      glareX,
      glareY,
      active: true,
    });
  };

  const handleNowPlayingMouseLeave = () => {
    setArtTilt({
      rotateX: 0,
      rotateY: 0,
      glareX: 50,
      glareY: 50,
      active: false,
    });
  };

  // Pop-Out Mini Player launcher (with complete white-bar & focus-ring suppression)
  const toggleMiniPlayer = async () => {
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      return;
    }
    if (inAppMiniPlayer) {
      setInAppMiniPlayer(false);
      return;
    }

    const docPip = (window as any).documentPictureInPicture;
    if (docPip && typeof docPip.requestWindow === 'function') {
      try {
        const win: Window = await docPip.requestWindow({
          width: 360,
          height: 460,
        });

        [...document.styleSheets].forEach((styleSheet) => {
          try {
            const cssRules = [...styleSheet.cssRules].map((r) => r.cssText).join('');
            const style = win.document.createElement('style');
            style.textContent = cssRules;
            win.document.head.appendChild(style);
          } catch {
            if (styleSheet.href) {
              const link = win.document.createElement('link');
              link.rel = 'stylesheet';
              link.href = styleSheet.href;
              win.document.head.appendChild(link);
            }
          }
        });

        // Explicitly lock html & body background and overflow inside PiP window so no white bar ever appears on click/skip
        const lockStyle = win.document.createElement('style');
        lockStyle.textContent = `
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            overflow: hidden !important;
            background: #0e0f14 !important;
            border: none !important;
            outline: none !important;
          }
          * {
            outline: none !important;
            scrollbar-width: none !important;
          }
          *::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        `;
        win.document.head.appendChild(lockStyle);

        win.document.title = 'Liquid Audio • Mini Player';
        if (theme === 'dark') {
          win.document.documentElement.classList.add('dark');
        }

        win.addEventListener('pagehide', () => {
          setPipWindow(null);
          setMainWindowHidden(false);
        });

        setPipWindow(win);
        return;
      } catch (err) {
        console.warn('Document PiP fallback to floating mini player:', err);
      }
    }

    setInAppMiniPlayer(true);
  };

  // Filtered & sorted existing songs for Library tab
  const filteredLibrarySongs = useMemo(() => {
    const q = searchQuery.trim();
    const pool = [...librarySongs];

    const filtered = pool.filter((song) => {
      if (libraryFilter === 'starred' && !song.starred) return false;
      if (libraryFilter === 'offline' && !downloadedSongIds[song.id]) return false;
      if (!q) return true;
      return scoreSongMatch(song, q) > 0;
    });

    filtered.sort((a, b) => {
      if (q) {
        const diff = scoreSongMatch(b, q) - scoreSongMatch(a, q);
        if (diff !== 0) return diff;
      }
      if (librarySort === 'artist') {
        return (a.artist || '').localeCompare(b.artist || '');
      }
      if (librarySort === 'duration') {
        return (b.duration || 0) - (a.duration || 0);
      }
      return (a.title || '').localeCompare(b.title || '');
    });

    return filtered;
  }, [librarySongs, searchQuery, libraryFilter, librarySort, downloadedSongIds]);

  // Reset library limit on search/filter changes
  useEffect(() => {
    setLibraryDisplayLimit(60);
  }, [searchQuery, libraryFilter, librarySort]);

  const displayedLibrarySongs = useMemo(() => {
    return filteredLibrarySongs.slice(0, libraryDisplayLimit);
  }, [filteredLibrarySongs, libraryDisplayLimit]);

  // All Liked / Starred songs (merges starredSongs from Navidrome getStarred2 + starred items in librarySongs & offlineSongs)
  const allLikedSongs = useMemo(() => {
    const map = new Map<string, SubsonicSong>();
    for (const s of starredSongs) {
      if (s && s.id) map.set(s.id, { ...s, starred: s.starred || 'true' });
    }
    for (const s of librarySongs) {
      if (s && s.starred && !map.has(s.id)) map.set(s.id, s);
    }
    for (const s of offlineSongs) {
      if (s && s.starred && !map.has(s.id)) map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [starredSongs, librarySongs, offlineSongs]);

  const filteredLikedSongs = useMemo(() => {
    const q = likedSearchQuery.trim();
    if (!q) return allLikedSongs;
    return allLikedSongs
      .map((song) => ({ song, score: scoreSongMatch(song, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.song);
  }, [allLikedSongs, likedSearchQuery]);

  // Filtered Offline songs by selected Offline Playlist AND Offline Search Query on phone/PC
  const filteredOfflineSongs = useMemo(() => {
    const basePool =
      selectedOfflinePlaylist === 'ALL'
        ? offlineSongs
        : offlineSongs.filter((s) =>
            (offlineSongPlaylists[s.id] || []).includes(selectedOfflinePlaylist)
          );
    const q = offlineSearchQuery.trim();
    if (!q) return basePool;
    return basePool
      .map((song) => ({ song, score: scoreSongMatch(song, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.song);
  }, [offlineSongs, offlineSongPlaylists, selectedOfflinePlaylist, offlineSearchQuery]);

  // Debounced server search for Spotlight
  useEffect(() => {
    const q = spotlightQuery.trim();
    if (spotlightDebounceTimer.current) {
      window.clearTimeout(spotlightDebounceTimer.current);
      spotlightDebounceTimer.current = null;
    }
    if (!q || q.length < 2) {
      setSpotlightServerResults([]);
      return;
    }
    spotlightDebounceTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/library/search?q=${encodeURIComponent(q)}&limit=35`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'ok' && Array.isArray(data.songs)) {
            setSpotlightServerResults(data.songs);
          }
        }
      } catch {
        // ignore
      }
    }, 220);

    return () => {
      if (spotlightDebounceTimer.current) {
        window.clearTimeout(spotlightDebounceTimer.current);
      }
    };
  }, [spotlightQuery]);

  // Instant Spotlight search results (merges in-memory songs + fast server search results)
  const spotlightResults = useMemo(() => {
    const map = new Map<string, SubsonicSong>();
    for (const s of librarySongs) map.set(s.id, s);
    for (const s of offlineSongs) if (!map.has(s.id)) map.set(s.id, s);
    for (const s of spotlightServerResults) if (!map.has(s.id)) map.set(s.id, s);
    const all = Array.from(map.values());
    const q = spotlightQuery.trim();
    if (!q) return all.slice(0, 25);

    return all
      .map((song) => ({ song, score: scoreSongMatch(song, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.song);
  }, [librarySongs, offlineSongs, spotlightServerResults, spotlightQuery]);

  // Computed Liquid Wrapped Top Songs & Top Artists
  const topPlayedSongs = useMemo(() => {
    return Object.values(listeningStats.songStats || {})
      .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
      .slice(0, 8);
  }, [listeningStats]);

  const topPlayedArtists = useMemo(() => {
    return Object.values(listeningStats.artistStats || {})
      .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
      .slice(0, 5);
  }, [listeningStats]);

  const compareTopSongs = useMemo(() => {
    if (!compareStats) return [] as SongPlayStat[];
    return (Object.values(compareStats.songStats || {}) as SongPlayStat[])
      .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
      .slice(0, 8);
  }, [compareStats]);

  const compareTopArtists = useMemo(() => {
    if (!compareStats) return [] as ArtistPlayStat[];
    return (Object.values(compareStats.artistStats || {}) as ArtistPlayStat[])
      .sort((a, b) => b.seconds - a.seconds || b.plays - a.plays)
      .slice(0, 5);
  }, [compareStats]);

  const musicCompatibility = useMemo(() => {
    if (!compareStats) return null;
    const myArtists = new Set(
      Object.keys(listeningStats.artistStats || {}).map((a) => a.toLowerCase().trim())
    );
    const theirArtists = new Set(
      Object.keys(compareStats.artistStats || {}).map((a) => a.toLowerCase().trim())
    );
    if (myArtists.size === 0 || theirArtists.size === 0) {
      return { score: 50, sharedCount: 0, sharedArtists: [] as string[] };
    }

    const shared: string[] = [];
    for (const a of myArtists) {
      if (theirArtists.has(a)) {
        shared.push(a);
      }
    }

    const unionSize = new Set([...myArtists, ...theirArtists]).size;
    const rawScore = unionSize > 0 ? Math.round((shared.length / unionSize) * 100) : 0;
    const score = Math.min(
      100,
      Math.max(25, Math.round(rawScore * 1.6 + (shared.length > 0 ? 35 : 15)))
    );

    return {
      score,
      sharedCount: shared.length,
      sharedArtists: shared.slice(0, 5),
    };
  }, [listeningStats, compareStats]);

  const isDark = true;
  const isSpaceUi = uiStyle === 'space';
  const glassClass = isSpaceUi
    ? 'space-surface-dark text-white'
    : 'glass-surface-dark text-white';
  const bgClass = isSpaceUi ? 'space-bg-dark text-white' : 'liquid-bg-dark text-white';
  const bubblePlayState = isPlaying ? 'bubble-playing' : 'bubble-paused';

  const isCoverDark = palette.brightnessMode === 'dark';
  const isCoverBright = palette.brightnessMode === 'bright';

  const dynamicBgStyle: React.CSSProperties = useMemo(() => {
    if (isSpaceUi) {
      return {
        background: `radial-gradient(ellipse at 50% 0%, #090d1b 0%, #05070e 58%, #020307 100%)`,
      };
    }

    // Liquid Theme (Default)
    if (isCoverDark) {
      return {
        background: `radial-gradient(circle at 16% 16%, rgba(${palette.primaryRgb}, 0.18) 0%, transparent 50%), radial-gradient(circle at 84% 82%, rgba(${palette.secondaryRgb}, 0.14) 0%, transparent 54%), linear-gradient(145deg, #040508 0%, #07080d 55%, #030406 100%)`,
      };
    }
    if (isCoverBright) {
      return {
        background: `radial-gradient(circle at 16% 16%, rgba(${palette.primaryRgb}, 0.28) 0%, transparent 54%), radial-gradient(circle at 84% 82%, rgba(${palette.secondaryRgb}, 0.22) 0%, transparent 56%), radial-gradient(circle at 50% 44%, rgba(${palette.tertiaryRgb}, 0.16) 0%, transparent 64%), linear-gradient(145deg, rgba(${palette.primaryRgb}, 0.12) 0%, #11141c 56%, #0c0f16 100%)`,
      };
    }
    return {
      background: `radial-gradient(circle at 16% 16%, rgba(${palette.primaryRgb}, 0.44) 0%, transparent 54%), radial-gradient(circle at 84% 82%, rgba(${palette.secondaryRgb}, 0.38) 0%, transparent 56%), radial-gradient(circle at 50% 44%, rgba(${palette.tertiaryRgb}, 0.24) 0%, transparent 64%), linear-gradient(145deg, rgba(${palette.primaryRgb}, 0.16) 0%, #090a10 56%, #0d1018 100%)`,
    };
  }, [isSpaceUi, isCoverDark, isCoverBright, palette.primaryRgb, palette.secondaryRgb, palette.tertiaryRgb]);

  // Grouped Artist Index across Library + Offline Songs (for Artist Search & Saved Artists)
  const allArtistsIndex = useMemo(() => {
    const map = new Map<string, { name: string; songs: SubsonicSong[]; sampleSong: SubsonicSong }>();
    const combined = [...librarySongs, ...offlineSongs];
    const seenSongIds = new Set<string>();
    for (const s of combined) {
      if (!s || !s.id || seenSongIds.has(s.id)) continue;
      seenSongIds.add(s.id);
      const rawArtist = (s.artist || 'Unknown Artist').trim();
      const key = rawArtist.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.songs.push(s);
      } else {
        map.set(key, { name: rawArtist, songs: [s], sampleSong: s });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.songs.length - a.songs.length);
  }, [librarySongs, offlineSongs]);

  const spotlightMatchingArtists = useMemo(() => {
    const q = spotlightQuery.trim().toLowerCase();
    if (!q) return allArtistsIndex.slice(0, 6);
    return allArtistsIndex
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allArtistsIndex, spotlightQuery]);

  const selectedArtistSongs = useMemo(() => {
    if (!selectedArtistName) return [];
    const target = selectedArtistName.toLowerCase();
    const match = allArtistsIndex.find((a) => a.name.toLowerCase() === target);
    if (match) return match.songs;
    return librarySongs.filter((s) => (s.artist || '').toLowerCase().includes(target));
  }, [selectedArtistName, allArtistsIndex, librarySongs]);

  const publicPlaylists = useMemo(() => {
    const me = (username || '').trim().toLowerCase();
    return playlists.filter((pl) => Boolean(pl.public) || (pl.owner && me && pl.owner.toLowerCase() !== me));
  }, [playlists, username]);

  const myPlaylists = useMemo(() => {
    const me = (username || '').trim().toLowerCase();
    if (!me) return playlists;
    const owned = playlists.filter((pl) => !pl.owner || pl.owner.toLowerCase() === me);
    return owned.length > 0 ? owned : playlists;
  }, [playlists, username]);

  const recentlyPlayedSongs = useMemo(() => {
    const libMap = new Map(librarySongs.map((s) => [s.id, s]));
    const statsList = Object.values(listeningStats.songStats || {})
      .filter((st) => st && st.lastPlayedAt > 0)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
    const out: SubsonicSong[] = [];
    const seen = new Set<string>();
    for (const st of statsList) {
      const real = libMap.get(st.realId || st.id) || libMap.get(st.id);
      if (real && !seen.has(real.id)) {
        seen.add(real.id);
        out.push(real);
      }
      if (out.length >= 10) break;
    }
    if (out.length < 6) {
      for (const s of librarySongs) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          out.push(s);
        }
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [listeningStats, librarySongs]);

  const randomHomeSongs = useMemo(() => {
    if (librarySongs.length === 0) return [];
    const copy = [...librarySongs];
    let seed = randomSeed % 2147483647;
    const nextRand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(nextRand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, 12);
  }, [librarySongs, randomSeed]);

  const openArtistPage = useCallback(
    (artistName: string) => {
      setSelectedArtistName(artistName);
      setActiveView('library');
      setLibrarySection('artists');
      setSpotlightOpen(false);
    },
    [setActiveView]
  );

  const dynamicAccentStyle: React.CSSProperties = {
    backgroundColor: `rgb(${palette.primaryRgb})`,
    boxShadow: `0 0 26px rgba(${palette.primaryRgb}, 0.48)`,
    color: '#ffffff',
  };

  const dockActiveAccentStyle: React.CSSProperties = {
    backgroundColor: `rgb(${palette.primaryRgb})`,
    boxShadow: `inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 2px 10px rgba(${palette.primaryRgb}, 0.36)`,
    color: '#ffffff',
  };

  // Toggle closing/hiding the main window while keeping the Mini-Player open
  const handleToggleCloseMainWindow = () => {
    const nextHidden = !mainWindowHidden;
    setMainWindowHidden(nextHidden);
    if (nextHidden) {
      if (!pipWindow && !inAppMiniPlayer) {
        setInAppMiniPlayer(true);
      }
      try {
        window.resizeTo(380, 480);
      } catch {
        // Browser tabs ignore resizeTo, standalone PWA windows resize cleanly
      }
      notify('Main window closed — Mini Player active');
    } else {
      try {
        window.resizeTo(1280, 840);
      } catch {}
      notify('Main window restored');
    }
  };

  // Generate Shareable 1080x1920 Liquid Wrapped Story Card PNG (Linked with Account & Server Stats)
  const handleGenerateWrappedCard = async () => {
    setGeneratingWrappedCard(true);
    try {
      await syncWrappedWithServer();
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      // Deep Liquid Glass Background
      const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
      bgGrad.addColorStop(0, '#07080d');
      bgGrad.addColorStop(0.5, '#10121d');
      bgGrad.addColorStop(1, '#090a10');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1920);

      // Ambient Album Palette Orbs
      const drawOrb = (x: number, y: number, r: number, rgb: string, alpha: number) => {
        const g = ctx.createRadialGradient(x, y, 10, x, y, r);
        g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      };
      drawOrb(220, 280, 560, palette.primaryRgb, 0.44);
      drawOrb(880, 960, 620, palette.secondaryRgb, 0.36);
      drawOrb(340, 1620, 540, palette.tertiaryRgb, 0.34);

      const roundRect = (x: number, y: number, w: number, h: number, radius: number) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
      };

      // Outer Glass Card Frame
      ctx.save();
      roundRect(64, 76, 952, 1768, 56);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.stroke();
      ctx.restore();

      // Header & Linked Account Badge
      const acctName = (username || 'guest').trim() || 'guest';
      const rankLabel =
        listeningStats.totalSecondsListened > 3600 ? 'VAULT CONNOISSEUR' : '999 CLUB';

      ctx.fillStyle = `rgb(${palette.primaryRgb})`;
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('LIQUID AUDIO • WRAPPED STORY', 120, 162);

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 66px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`@${acctName}`, 120, 244);

      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '600 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(
        `Account Linked • Rank: ${rankLabel} • ${new Date().getFullYear()}`,
        120,
        292
      );

      // 3 Hero Stat Boxes
      const statsBoxes = [
        {
          label: 'TIME LISTENED',
          value: formatDurationHuman(listeningStats.totalSecondsListened),
        },
        { label: 'TOTAL PLAYS', value: `${listeningStats.totalPlays}` },
        {
          label: 'DAILY STREAK',
          value: `${listeningStats.dailyStreak} ${
            listeningStats.dailyStreak === 1 ? 'Day' : 'Days'
          }`,
        },
      ];

      statsBoxes.forEach((box, idx) => {
        const bx = 120 + idx * 288;
        const by = 345;
        roundRect(bx, by, 264, 175, 32);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.065)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
        ctx.font = 'bold 21px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(box.label, bx + 28, by + 58);

        ctx.fillStyle = '#ffffff';
        ctx.font = '800 44px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(box.value, bx + 28, by + 128);
      });

      // Top Played Tracks Section
      ctx.fillStyle = `rgb(${palette.primaryRgb})`;
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('TOP PLAYED TRACKS', 120, 595);

      const top5Songs = topPlayedSongs.slice(0, 5);
      if (top5Songs.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('Listen to tracks to populate your Top 5!', 120, 665);
      } else {
        top5Songs.forEach((song, i) => {
          const sy = 625 + i * 124;
          roundRect(120, sy, 840, 104, 26);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.fill();

          ctx.fillStyle = `rgb(${palette.primaryRgb})`;
          ctx.font = '800 34px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillText(`#${i + 1}`, 152, sy + 64);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 31px -apple-system, BlinkMacSystemFont, sans-serif';
          const cleanTitle =
            song.title.length > 28 ? song.title.slice(0, 26) + '…' : song.title;
          ctx.fillText(cleanTitle, 232, sy + 48);

          ctx.fillStyle = 'rgba(255,255,255,0.62)';
          ctx.font = '500 24px -apple-system, BlinkMacSystemFont, sans-serif';
          const cleanArtist =
            song.artist.length > 34 ? song.artist.slice(0, 32) + '…' : song.artist;
          ctx.fillText(cleanArtist, 232, sy + 82);

          ctx.textAlign = 'right';
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.fillText(`${song.plays} plays`, 928, sy + 50);

          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '500 22px monospace';
          ctx.fillText(formatDurationHuman(song.seconds), 928, sy + 82);
          ctx.textAlign = 'left';
        });
      }

      // Top Artists Section
      ctx.fillStyle = `rgb(${palette.secondaryRgb})`;
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('TOP ARTISTS', 120, 1310);

      const top3Artists = topPlayedArtists.slice(0, 3);
      top3Artists.forEach((ar, i) => {
        const ay = 1340 + i * 110;
        roundRect(120, ay, 840, 92, 24);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(`${i + 1}. ${ar.artist}`, 154, ay + 56);

        ctx.textAlign = 'right';
        ctx.fillStyle = `rgb(${palette.primaryRgb})`;
        ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(
          `${ar.plays} plays • ${formatDurationHuman(ar.seconds)}`,
          928,
          ay + 56
        );
        ctx.textAlign = 'left';
      });

      // Privacy-safe footer (No private URLs exposed)
      ctx.fillStyle = 'rgba(255,255,255,0.48)';
      ctx.font = '600 24px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('LIQUIDPLAYER • SYNCED ACCOUNT WRAPPED', 120, 1775);

      const dataUrl = canvas.toDataURL('image/png');
      setWrappedCardUrl(dataUrl);
      setWrappedCardModalOpen(true);
    } catch (err: any) {
      notify(`Could not generate Wrapped card: ${err?.message || 'Error'}`);
    } finally {
      setGeneratingWrappedCard(false);
    }
  };

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    window.dispatchEvent(new CustomEvent('liquid-seek', { detail: val }));
  };

  // Safe clipboard copy helper (supports iOS Safari & mobile browsers)
  const copyToClipboardSafe = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Async gesture expired or permission blocked on mobile browser
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.width = '2em';
      ta.style.height = '2em';
      ta.style.padding = '0';
      ta.style.border = 'none';
      ta.style.outline = 'none';
      ta.style.boxShadow = 'none';
      ta.style.background = 'transparent';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, 99999);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  // Add to Playlist modal handlers (Supports single or multiple selected songs)
  const openAddToPlaylistModal = (songs: SubsonicSong | SubsonicSong[]) => {
    const list = Array.isArray(songs) ? songs : [songs];
    if (list.length === 0) return;
    setAddToPlaylistSongs(list);
    setNewPlaylistNameInput('');
    setCreatingNewPlaylist(false);
  };

  const handleAddSongsToPlaylistTarget = async (playlistId: string, playlistTitle: string) => {
    if (!addToPlaylistSongs || addToPlaylistSongs.length === 0) return;
    const ids = addToPlaylistSongs.map((s) => s.id);
    const count = ids.length;
    await addSongsToPlaylist(playlistId, ids);
    setAddToPlaylistSongs(null);
    notify(
      count === 1
        ? `Added "${addToPlaylistSongs[0].title}" to "${playlistTitle}"`
        : `Added ${count} songs to "${playlistTitle}"`
    );
  };

  const handleCreateAndAddSongsToPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlaylistNameInput.trim();
    if (!name || !addToPlaylistSongs || addToPlaylistSongs.length === 0) return;
    const ids = addToPlaylistSongs.map((s) => s.id);
    const count = ids.length;
    await createNewPlaylist(name, ids);
    setAddToPlaylistSongs(null);
    setNewPlaylistNameInput('');
    setCreatingNewPlaylist(false);
    notify(
      count === 1
        ? `Created "${name}" & added "${addToPlaylistSongs[0].title}"`
        : `Created "${name}" & added ${count} songs`
    );
  };

  // Share via FileBrowser Public Share Link (Defaults to 1 hour expiration, rock-solid on mobile)
  const handleShare = async (
    songToShare?: SubsonicSong | null,
    overrideExp?: string
  ) => {
    const target =
      songToShare ||
      (shareModalData?.songId
        ? ({ id: shareModalData.songId, title: shareModalData.title, artist: shareModalData.artist } as SubsonicSong)
        : null) ||
      currentSong;
    if (!target) return;
    setShareLoading(true);
    const expKey = overrideExp || shareExpires;
    let expVal = '1';
    let unitVal = 'hours';
    if (expKey === '6h') {
      expVal = '6';
      unitVal = 'hours';
    } else if (expKey === '24h') {
      expVal = '24';
      unitVal = 'hours';
    } else if (expKey === '7d') {
      expVal = '7';
      unitVal = 'days';
    } else if (expKey === '30d') {
      expVal = '30';
      unitVal = 'days';
    } else if (expKey === 'never') {
      expVal = 'never';
      unitVal = 'days';
    }

    notify(
      `Generating link for "${target.title}" (${expKey === 'never' ? 'permanent' : expKey === '1h' ? '1 hour default' : expKey})...`
    );
    try {
      const res = await fetch(
        `/api/share/${encodeURIComponent(target.id)}?expires=${encodeURIComponent(expVal)}&unit=${encodeURIComponent(unitVal)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shareServerUrl: shareServerUrl || '',
            shareApiToken: shareApiToken || '',
            title: target.title || '',
            artist: target.artist || '',
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') {
        throw new Error(data.message || 'Could not generate FileBrowser share link');
      }
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'https://music.example.com';
      const playerShareUrl = `${origin}/?share=${data.hash}&song=${encodeURIComponent(target.id)}`;
      data.songId = target.id;
      data.shareUrl = playerShareUrl;
      data.playerShareUrl = playerShareUrl;

      // Always show the share dialog modal FIRST so mobile & desktop users immediately see the link
      setShareModalData(data);

      // Attempt background clipboard copy (non-fatal if browser blocks async clipboard)
      const copied = await copyToClipboardSafe(data.shareUrl);

      // Trigger native system share sheet on mobile devices if available
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `${target.title} - ${target.artist}`,
            text: `Listen to "${target.title}" by ${target.artist}`,
            url: data.shareUrl,
          });
        } catch {
          // user cancelled share sheet
        }
      }

      if (copied) {
        notify(`Copied share link! (Expires: ${data.expiresText || '1 hour'})`);
      } else {
        notify(`Share link generated! (Expires: ${data.expiresText || '1 hour'})`);
      }
    } catch (err: any) {
      notify(`Share error: ${err?.message || 'Could not reach FileBrowser'}`);
    } finally {
      setShareLoading(false);
    }
  };

  const handleRemoveAllDownloads = async () => {
    if (offlineSongs.length === 0) return;
    if (!confirmClearAllOffline) {
      setConfirmClearAllOffline(true);
      notify(`Tap "Confirm Remove (${offlineSongs.length})" again to delete all offline downloads`);
      setTimeout(() => setConfirmClearAllOffline(false), 4500);
      return;
    }
    const count = offlineSongs.length;
    setConfirmClearAllOffline(false);
    setSelectedOfflinePlaylist('ALL');
    await clearAllOfflineSongs();
    notify(`Removed all ${count} offline downloads from this device`);
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShareServerConfig(shareServerInput, shareTokenInput);
    await connectServer(serverInput, userInput, passInput);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchDebounceTimer.current) {
      window.clearTimeout(searchDebounceTimer.current);
      searchDebounceTimer.current = null;
    }
    const clean = val.trim();
    if (!clean) {
      searchLibrary('');
      return;
    }
    searchDebounceTimer.current = window.setTimeout(() => {
      searchLibrary(clean);
    }, 240);
  };

  const handleResyncAllSongs = async () => {
    notify('Starting server library resync & scan...');
    await resyncLibrary();
    const count = usePlayerStore.getState().librarySongs.length;
    notify(`Server library resynced! Loaded ${count} songs.`);
  };

  const handlePlayNext = (song: SubsonicSong) => {
    playNextInQueue(song);
    notify(`Playing "${song.title}" next`);
  };

  const handleDiscoverSearch = async (
    e?: React.FormEvent,
    overrideSource?: 'spotify' | 'soundcloud' | 'youtube',
    overrideQuery?: string,
    loadMore = false
  ) => {
    if (e) e.preventDefault();
    const q = (overrideQuery !== undefined ? overrideQuery : discoverQuery).trim();
    if (!q) return;
    const src = overrideSource || discoverSource;
    const nextOffset = loadMore ? discoverOffset + 12 : 0;
    if (loadMore) {
      setDiscoverLoadingMore(true);
    } else {
      setDiscoverLoading(true);
      setDiscoverIsPlaylist(false);
      setDiscoverPlaylistName('');
      setDiscoverOffset(0);
      setDiscoverHasMore(false);
    }
    try {
      const res = await fetch(
        `/api/discover/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(src)}&limit=12&offset=${nextOffset}`
      );
      const data = await res.json();
      const results: DiscoverResult[] = data.results || [];
      if (loadMore) {
        setDiscoverResults((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const fresh = results.filter((r) => !existingIds.has(r.id));
          return [...prev, ...fresh];
        });
        setDiscoverOffset(nextOffset);
      } else {
        setDiscoverResults(results);
        setDiscoverOffset(0);
      }
      setDiscoverIsPlaylist(Boolean(data.isPlaylist));
      setDiscoverPlaylistName(data.playlistName || '');
      setDiscoverHasMore(Boolean(data.hasMore) && !data.isPlaylist && results.length > 0);

      if (Array.isArray(results) && results.length > 0 && !data.isPlaylist) {
        const batch: Record<string, string> = {};
        for (const r of results) {
          if (r.artworkUrl && !r.artworkUrl.startsWith('/api/')) {
            batch[r.id] = r.artworkUrl;
            const normT = (r.title || '').toLowerCase().trim();
            const normA = (r.artist || '').toLowerCase().trim();
            if (normT) {
              batch[normT] = r.artworkUrl;
              if (normA) batch[`${normT}---${normA}`] = r.artworkUrl;
            }
          }
        }
        saveImportedCovers(batch);
      }
    } catch {
      notify('Search failed — please check connection');
    } finally {
      setDiscoverLoading(false);
      setDiscoverLoadingMore(false);
    }
  };

  const handleImportTrack = async (
    item: DiscoverResult,
    silent = false
  ): Promise<{ ok: boolean; fileName?: string; navidromeSongId?: string; playableSong?: SubsonicSong }> => {
    if (importedIds[item.id]) {
      return {
        ok: true,
        fileName: importedFileMap[item.id],
        navidromeSongId: importedNavIds[item.id],
        playableSong: toPlayableImportedSong(item) || undefined,
      };
    }
    if (importingIds[item.id]) {
      return { ok: true };
    }
    setImportingIds((prev) => ({ ...prev, [item.id]: true }));
    if (!silent) {
      notify(`Downloading & tagging "${item.title}" (${item.artist})...`);
    }

    try {
      const res = await fetch('/api/discover/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: item.source,
          url: item.url,
          title: item.title,
          artist: item.artist,
          album: item.album,
          artworkUrl: item.artworkUrl,
          releaseYear: item.releaseYear,
          duration: item.duration || 0,
          isExplicit: item.isExplicit,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') {
        throw new Error(data.message || 'Import failed');
      }

      setImportedIds((prev) => ({ ...prev, [item.id]: true }));
      if (data.fileName) {
        setImportedFileMap((prev) => ({ ...prev, [item.id]: data.fileName }));
      }
      if (data.navidromeSongId) {
        setImportedNavIds((prev) => ({ ...prev, [item.id]: data.navidromeSongId }));
      }
      const art = data.directCoverUrl || item.artworkUrl;
      if (art) {
        const normT = item.title.toLowerCase().trim();
        const normA = item.artist.toLowerCase().trim();
        const batch: Record<string, string> = {
          [item.id]: art,
          [`${normT}---${normA}`]: art,
          [normT]: art,
        };
        if (data.navidromeSongId) {
          batch[data.navidromeSongId] = art;
          thumbUrlCacheRef.current.set(data.navidromeSongId, art);
        }
        if (data.fileName) batch[`local:${data.fileName}`] = art;
        saveImportedCovers(batch);
      }

      const immediatePlayable: SubsonicSong = data.navidromeSong || {
        id: data.navidromeSongId || (data.fileName ? `local:${data.fileName}` : `imported-${item.id}`),
        title: item.title,
        artist: item.artist,
        album: data.album || item.album || 'Imported Track',
        duration: item.duration || 180,
        coverArt: art,
        directStreamUrl:
          data.directStreamUrl ||
          (data.fileName ? `/api/discover/stream?file=${encodeURIComponent(data.fileName)}` : undefined),
        directCoverUrl: art,
      };

      const curLib = usePlayerStore.getState().librarySongs;
      if (!curLib.some((s) => s.id === immediatePlayable.id)) {
        usePlayerStore.setState({ librarySongs: [immediatePlayable, ...curLib] });
      }

      if (!silent) {
        notify(`Added "${item.title}" to Navidrome with album cover!`);
        if (client) {
          client.startScan().catch(() => {});
          setTimeout(() => {
            searchLibrary(searchQuery);
          }, 2200);
        }
      }
      return {
        ok: true,
        fileName: data.fileName,
        navidromeSongId: data.navidromeSongId,
        playableSong: immediatePlayable,
      };
    } catch (err: any) {
      if (!silent) {
        notify(`Error adding "${item.title}": ${err?.message || 'Download error'}`);
      }
      return { ok: false };
    } finally {
      setImportingIds((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  // Convert a downloaded DiscoverResult into a playable SubsonicSong so the user can listen immediately while a playlist is still downloading
  const toPlayableImportedSong = (item: DiscoverResult): SubsonicSong | null => {
    const navId = importedNavIds[item.id];
    if (navId) {
      const matchedById = librarySongs.find((s) => s.id === navId);
      if (matchedById) return matchedById;
    }

    const normTitle = item.title.toLowerCase().trim();
    const normArtist = item.artist.toLowerCase().trim();
    const matchedInLib =
      librarySongs.find(
        (s) =>
          (s.title || '').toLowerCase().trim() === normTitle &&
          (s.artist || '').toLowerCase().trim() === normArtist
      ) ||
      librarySongs.find((s) => (s.title || '').toLowerCase().trim() === normTitle);
    if (matchedInLib) return matchedInLib;

    const fileName = importedFileMap[item.id];
    if (!fileName) return null;

    const art =
      item.artworkUrl ||
      importedCoverMap[item.id] ||
      importedCoverMap[normTitle] ||
      `/api/discover/cover?file=${encodeURIComponent(fileName)}`;

    return {
      id: navId || `local:${fileName}`,
      title: item.title,
      artist: item.artist,
      album: item.album || 'Imported Track',
      duration: item.duration || 180,
      coverArt: art,
      directStreamUrl: `/api/discover/stream?file=${encodeURIComponent(fileName)}`,
      directCoverUrl: art,
    } as SubsonicSong & { directStreamUrl: string; directCoverUrl: string };
  };

  const handlePlayImportedTrack = async (item: DiscoverResult) => {
    const existingPlayable = toPlayableImportedSong(item);
    if (existingPlayable) {
      playSong(existingPlayable);
      notify(`Playing "${item.title}"`);
      return;
    }
    notify(`Loading & playing "${item.title}" (${item.artist})...`);
    const res = await handleImportTrack(item, true);
    if (res.ok && res.playableSong) {
      playSong(res.playableSong);
      notify(`Playing "${item.title}"!`);
    } else {
      notify(`Could not load "${item.title}" for playback.`);
    }
  };

  const handlePlayAllDownloadedImports = () => {
    const allDownloadedPool = discoverResults
      .filter((r) => importedIds[r.id])
      .map((r) => toPlayableImportedSong(r))
      .filter((s): s is SubsonicSong => Boolean(s));

    if (allDownloadedPool.length === 0) {
      notify('Wait for at least 1 track to finish downloading first!');
      return;
    }
    playSong(allDownloadedPool[0], allDownloadedPool);
    notify(`Playing ${allDownloadedPool.length} downloaded tracks while import continues!`);
  };

  // Full Playlist Importer (Creates Navidrome Playlist immediately, updates it live after each track, and verifies 100% of tracks via SQLite resolver)
  const handleBulkImportPlaylist = async () => {
    if (!discoverResults.length || bulkImportProgress) return;
    const plName =
      discoverPlaylistName.trim() || `Imported ${discoverSource.toUpperCase()} Playlist`;
    const total = discoverResults.length;
    setBulkImportProgress({ done: 0, total, name: plName });

    // Create or find the target playlist right away so tracks save into it live while downloading
    let targetPlaylistId: string | null = null;
    if (client) {
      try {
        const existing = playlists.find(
          (p) => p.name.toLowerCase().trim() === plName.toLowerCase().trim()
        );
        if (existing) {
          targetPlaylistId = existing.id;
        } else {
          const created = await client.createPlaylist(plName, []);
          if (created?.id) {
            targetPlaylistId = created.id;
            await loadPlaylists();
          }
        }
      } catch {}
    }

    const collectedNavIds: string[] = [];
    const collectedItems: { fileName: string; title: string; artist: string }[] = [];

    for (let i = 0; i < discoverResults.length; i++) {
      const item = discoverResults[i];
      const result = await handleImportTrack(item, true);
      if (result.fileName) {
        collectedItems.push({
          fileName: result.fileName,
          title: item.title,
          artist: item.artist,
        });
      }
      if (result.navidromeSongId && !collectedNavIds.includes(result.navidromeSongId)) {
        collectedNavIds.push(result.navidromeSongId);
        // Live incremental save into the Navidrome playlist as each track finishes
        if (client && targetPlaylistId) {
          await client.replacePlaylistTracks(targetPlaylistId, plName, collectedNavIds);
          await loadPlaylists();
        }
      }
      setBulkImportProgress({ done: i + 1, total, name: plName });
    }

    if (client) {
      notify(`Finalizing playlist "${plName}" (${discoverResults.length} tracks)...`);
      try {
        // Resolve all imported tracks directly against Navidrome's SQLite DB so 100% of tracks are matched (never limited by 250-song fetch)
        const resolvePayload =
          collectedItems.length > 0
            ? collectedItems
            : discoverResults.map((r) => ({
                fileName: importedFileMap[r.id] || '',
                title: r.title,
                artist: r.artist,
              }));

        const res = await fetch('/api/discover/resolve-songs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: resolvePayload }),
        });
        if (res.ok) {
          const data = await res.json();
          const resolvedIds: string[] = data.songIds || [];
          for (const id of resolvedIds) {
            if (id && !collectedNavIds.includes(id)) {
              collectedNavIds.push(id);
            }
          }
          if (Array.isArray(data.songs) && data.songs.length > 0) {
            const curLib = usePlayerStore.getState().librarySongs;
            const existingMap = new Map(curLib.map((s) => [s.id, s]));
            for (const s of data.songs) {
              existingMap.set(s.id, s);
            }
            usePlayerStore.setState({ librarySongs: Array.from(existingMap.values()) });
          }
        }
      } catch {}

      if (targetPlaylistId) {
        await client.replacePlaylistTracks(targetPlaylistId, plName, collectedNavIds);
        await loadPlaylists();
        await selectPlaylist(targetPlaylistId);
      } else {
        await createNewPlaylist(plName, collectedNavIds);
      }
      notify(`Saved playlist "${plName}" with ${collectedNavIds.length} tracks!`);
    }

    setBulkImportProgress(null);
  };

  const handleManualLyricSave = async () => {
    if (!currentSong) return;
    const res = await saveManualLyricOverride(
      currentSong.id,
      currentSong.title,
      currentSong.artist,
      manualLyricsText
    );
    setCurrentLyrics(res);
    setEditingLyrics(false);
  };

  const activeSyncedIndex =
    currentLyrics?.syncedLines.reduce((acc, line, idx) => {
      if (currentTime + 0.08 >= line.time) return idx;
      return acc;
    }, -1) ?? -1;

  // Lookahead index (0.55s early) so the upcoming lyric line scrolls into view right BEFORE the artist sings it
  const scrollTargetIndex =
    currentLyrics?.syncedLines.reduce((acc, line, idx) => {
      if (currentTime + 0.55 >= line.time) return idx;
      return acc;
    }, -1) ?? -1;

  const activeLyricLine =
    activeSyncedIndex >= 0 && currentLyrics?.syncedLines[activeSyncedIndex]
      ? currentLyrics.syncedLines[activeSyncedIndex]
      : null;

  const nextLyricLineTime =
    activeSyncedIndex >= 0 &&
    currentLyrics?.syncedLines &&
    currentLyrics.syncedLines[activeSyncedIndex + 1]
      ? currentLyrics.syncedLines[activeSyncedIndex + 1].time
      : (activeLyricLine?.time || 0) + 4.2;

  const activeLyricLineText = activeLyricLine ? activeLyricLine.text : null;

  const scrollLyricsToIndex = useCallback(
    (targetIdx: number, smooth = true) => {
      const container = lyricsContainerRef.current;
      const lineEl = lyricLineRefs.current[targetIdx];
      if (!container || !lineEl || targetIdx < 0) return;

      const containerRect = container.getBoundingClientRect();
      const lineRect = lineEl.getBoundingClientRect();
      const relativeTop = lineRect.top - containerRect.top + container.scrollTop;
      const targetScrollTop = Math.max(
        0,
        relativeTop - container.clientHeight * 0.34 + lineRect.height * 0.5
      );

      container.scrollTo({
        top: targetScrollTop,
        behavior: smooth ? 'smooth' : 'auto',
      });
    },
    []
  );

  const handleUserManualLyricScroll = useCallback(() => {
    setUserScrolledLyrics(true);
    if (userScrollTimerRef.current) {
      window.clearTimeout(userScrollTimerRef.current);
    }
    userScrollTimerRef.current = window.setTimeout(() => {
      setUserScrolledLyrics(false);
    }, 7000);
  }, []);

  // Reset manual scroll lock when song changes
  useEffect(() => {
    setUserScrolledLyrics(false);
    lyricLineRefs.current = {};
    if (userScrollTimerRef.current) {
      window.clearTimeout(userScrollTimerRef.current);
      userScrollTimerRef.current = null;
    }
  }, [currentSong?.id]);

  // Smooth scroll upcoming/active synced lyric line into view inside the lyrics container (never jumping to top or overriding manual scroll)
  useEffect(() => {
    if (editingLyrics || userScrolledLyrics || activeView !== 'lyrics') return;
    const idxToScroll = scrollTargetIndex >= 0 ? scrollTargetIndex : activeSyncedIndex;
    if (idxToScroll >= 0) {
      scrollLyricsToIndex(idxToScroll, true);
    }
  }, [scrollTargetIndex, activeSyncedIndex, editingLyrics, userScrolledLyrics, activeView, scrollLyricsToIndex]);

  // Compute CSS variables & gradient colors for Lyrics based on selected Lyric Color Mode (Default: Album Cover / Shimmer / Custom)
  const getLyricColorCssVars = (): React.CSSProperties => {
    if (lyricColorMode === 'shimmer') {
      return {
        '--lyric-c1': '#38bdf8',
        '--lyric-c2': '#818cf8',
        '--lyric-c3': '#e879f9',
        '--lyric-glow': 'rgba(56, 189, 248, 0.55)',
      } as React.CSSProperties;
    }
    if (lyricColorMode === 'custom') {
      return {
        '--lyric-c1': lyricCustomColor,
        '--lyric-c2': '#ffffff',
        '--lyric-c3': `rgb(${palette.primaryRgb})`,
        '--lyric-glow': `${lyricCustomColor}88`,
      } as React.CSSProperties;
    }
    // Default & Album Cover Palette — automatically contrast-boosted so lyrics are ALWAYS readable on dark, bright, or colored backgrounds
    const c1 = adjustRgbForLyricContrast(palette.primaryRgb, isDark);
    const c2 = adjustRgbForLyricContrast(palette.secondaryRgb, isDark);
    const c3 = adjustRgbForLyricContrast(palette.tertiaryRgb, isDark);
    return {
      '--lyric-c1': `rgb(${c1})`,
      '--lyric-c2': `rgb(${c2})`,
      '--lyric-c3': `rgb(${c3})`,
      '--lyric-glow': isDark ? `rgba(${c1}, 0.55)` : `rgba(${c1}, 0.25)`,
      '--lyric-shadow': isDark ? 'rgba(0, 0, 0, 0.78)' : 'rgba(255, 255, 255, 0.65)',
    } as React.CSSProperties;
  };

  // Render an active lyric verse where text stays completely normal and the liquid wavy color smoothly sweeps through as the artist sings
  const renderLiquidWaterLine = (
    lineText: string,
    lineStartTime: number,
    lineEndTime: number,
    compact = false
  ) => {
    const words = lineText.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;

    const spanDuration = Math.max(1.0, Math.min(10.0, (lineEndTime - lineStartTime) * 0.92));
    const lineProgress = Math.max(
      0,
      Math.min(1, (currentTime - lineStartTime) / spanDuration)
    );
    const totalChars = Math.max(
      1,
      words.reduce((sum, w) => sum + w.length, 0)
    );

    const baseTextColor = isDark ? 'rgba(255, 255, 255, 0.62)' : 'rgba(15, 23, 42, 0.62)';
    const baseTextShadow = isDark
      ? '0 1px 6px rgba(0, 0, 0, 0.65)'
      : '0 1px 4px rgba(255, 255, 255, 0.6)';
    const cssVars = getLyricColorCssVars();

    let charCursor = 0;

    return (
      <span
        style={cssVars}
        className={`inline-flex flex-wrap items-baseline ${
          compact ? 'gap-x-1 justify-center' : 'gap-x-1.5 gap-y-0.5'
        }`}
      >
        {words.map((word, wIdx) => {
          const wordStartRatio = charCursor / totalChars;
          charCursor += word.length;
          const wordEndRatio = charCursor / totalChars;
          const wordSpan = Math.max(0.04, wordEndRatio - wordStartRatio);
          const wordProgress = Math.max(
            0,
            Math.min(1, (lineProgress - wordStartRatio) / wordSpan)
          );

          const fillPct = Math.min(100, Math.max(0, wordProgress * 100));

          return (
            <span
              key={`${wIdx}-${word}`}
              className="relative inline-block"
            >
              {/* Base layer: Uncolored normal text (stays crisp, natural, and high-contrast on any background) */}
              <span
                style={{ color: baseTextColor, textShadow: baseTextShadow }}
                className="select-text inline-block font-bold"
              >
                {word}
              </span>

              {/* Liquid Water Overlay: Sweeps across the word with animated wavy colors as sung */}
              <span
                className="absolute inset-0 pointer-events-none select-none inline-block"
                style={{
                  clipPath: `inset(-8px ${100 - fillPct}% -8px -4px)`,
                  WebkitClipPath: `inset(-8px ${100 - fillPct}% -8px -4px)`,
                  transition: 'clip-path 0.28s linear, -webkit-clip-path 0.28s linear',
                  opacity: fillPct > 0 ? 1 : 0,
                }}
              >
                <span className="liquid-water-text whitespace-nowrap inline-block font-bold">
                  {word}
                </span>
              </span>
            </span>
          );
        })}
      </span>
    );
  };

  const totalDuration = duration || currentSong?.duration || 100;
  const seekPercent = totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  // Shared Liquid Glass Mini Player UI (Supports "Cover Only", "Close/Hide Main Window", & "Small 1-Line Lyric on Album Cover" with Fluid Responsive Sizing)
  const renderMiniPlayerContent = (isPopoutWindow: boolean) => {
    const switchMiniCoverMode = (coverOnly: boolean) => {
      setMiniCoverOnly(coverOnly);
      if (pipWindow) {
        try {
          if (coverOnly) {
            pipWindow.resizeTo(260, 260);
          } else {
            pipWindow.resizeTo(330, 410);
          }
        } catch {}
      }
    };

    if (miniCoverOnly) {
      return (
        <div
          className={`mini-player-root group absolute inset-0 w-full h-full overflow-hidden select-none bg-[#0e0f14]`}
        >
          {/* Full-Bleed Album Cover Art */}
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={currentSong?.title || 'Cover'}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black/60">
              <Disc3
                className="w-16 h-16 opacity-45"
                style={{ color: `rgb(${palette.primaryRgb})` }}
              />
              <span className="text-xs opacity-60 mt-2">
                {currentSong?.title || 'No Track Playing'}
              </span>
            </div>
          )}

          {/* Top Bar Controls (Visible on Hover so the Album Cover stays 100% clean) */}
          <div className="absolute top-2 inset-x-2 z-20 flex items-center justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex items-center gap-1 min-w-0 flex-wrap">
              <button
                onMouseUp={(e) => e.currentTarget.blur()}
                onClick={() => switchMiniCoverMode(false)}
                className="px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md text-[10px] font-bold text-white border border-white/15 hover:bg-black/80 transition"
                title="Switch to Full Mini Player"
              >
                Full UI
              </button>
              <button
                onMouseUp={(e) => e.currentTarget.blur()}
                onClick={() => setMiniShowLyricOnCover((v) => !v)}
                style={miniShowLyricOnCover ? dynamicAccentStyle : undefined}
                className={`px-2 py-0.5 rounded-lg backdrop-blur-md text-[10px] font-bold border border-white/15 transition ${
                  miniShowLyricOnCover ? '' : 'bg-black/65 text-white/75 hover:text-white'
                }`}
                title="Toggle 1-Line Lyric on Album Cover"
              >
                Lyric
              </button>
              <button
                onMouseUp={(e) => e.currentTarget.blur()}
                onClick={handleToggleCloseMainWindow}
                className={`px-2 py-0.5 rounded-lg backdrop-blur-md text-[10px] font-bold border border-white/15 transition ${
                  mainWindowHidden
                    ? 'bg-emerald-500/80 text-white'
                    : 'bg-black/65 text-white/75 hover:text-white'
                }`}
                title={
                  mainWindowHidden
                    ? 'Restore Main Player Window'
                    : 'Close Main Window & Keep Only Mini Player Open'
                }
              >
                {mainWindowHidden ? 'Show Main' : 'Hide Main'}
              </button>
            </div>

            <button
              onMouseUp={(e) => e.currentTarget.blur()}
              onClick={() => {
                setMainWindowHidden(false);
                if (isPopoutWindow && pipWindow) {
                  pipWindow.close();
                  setPipWindow(null);
                } else {
                  setInAppMiniPlayer(false);
                }
              }}
              className="p-1.5 rounded-lg bg-black/65 backdrop-blur-md text-white border border-white/15 hover:bg-black/80 transition shrink-0"
              title="Return to Full Player"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Center Hover Transport Overlay */}
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onMouseUp={(e) => e.currentTarget.blur()}
              onClick={prevTrack}
              className="p-2 rounded-full bg-black/55 text-white hover:bg-black/75 transition"
              title="Previous"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onMouseUp={(e) => e.currentTarget.blur()}
              onClick={() => setIsPlaying(!isPlaying)}
              style={dynamicAccentStyle}
              className="w-11 h-11 rounded-full flex items-center justify-center transition transform hover:scale-105 active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <button
              onMouseUp={(e) => e.currentTarget.blur()}
              onClick={nextTrack}
              className="p-2 rounded-full bg-black/55 text-white hover:bg-black/75 transition"
              title="Next"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Small 1-Line Synced Lyric Overlay Directly on the Album Cover with Clean Verse Transition & Liquid Water Sync */}
          {miniShowLyricOnCover && activeLyricLine && (
            <div className="pointer-events-none absolute bottom-2.5 inset-x-2.5 z-20 flex justify-center overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeSyncedIndex}-${activeLyricLine.time}`}
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="px-2.5 py-1 rounded-xl bg-black/70 backdrop-blur-md border border-white/15 text-[10px] font-semibold text-white truncate max-w-full shadow-lg"
                >
                  ♪{' '}
                  {renderLiquidWaterLine(
                    activeLyricLine.text,
                    activeLyricLine.time,
                    nextLyricLineTime,
                    true
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className={`mini-player-root absolute inset-0 w-full h-full overflow-hidden flex flex-col justify-between p-2.5 gap-1.5 select-none ${bgClass}`}
        style={{ containerType: 'size', ...dynamicBgStyle }}
      >
        {/* Ambient Liquid Bubbles + Liquid Splash in Mini Player */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
          {coverUrl && (
            <div
              key={`mini-bg-splash-${currentSong?.id || coverUrl}`}
              className="bg-liquid-splash-bloom absolute inset-0 blur-2xl scale-125"
              style={{
                '--bg-ambient-opacity': '0.28',
                backgroundImage: `url(${coverUrl})`,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
              } as React.CSSProperties}
            />
          )}
          {currentSong && (
            <div
              key={`mini-bg-rings-${currentSong.id}`}
              className="absolute inset-0 overflow-hidden"
            >
              <div
                className="bg-liquid-splash-ring-1 absolute left-1/2 top-1/2 w-40 h-40"
                style={{
                  background: `radial-gradient(circle, rgba(${palette.primaryRgb}, 0.14) 0%, rgba(${palette.primaryRgb}, 0.42) 55%, rgba(${palette.secondaryRgb}, 0) 76%)`,
                  boxShadow: `0 0 26px rgba(${palette.primaryRgb}, 0.35), inset 0 0 18px rgba(255,255,255,0.28)`,
                }}
              />
            </div>
          )}
          <div
            className={`liquid-bubble-1 ${bubblePlayState} absolute -top-12 -left-12 w-48 h-48 rounded-full blur-[55px]`}
            style={{
              background: `radial-gradient(circle, rgba(${palette.primaryRgb}, 0.45) 0%, transparent 70%)`,
            }}
          />
          <div
            className={`liquid-bubble-2 ${bubblePlayState} absolute -bottom-12 -right-12 w-52 h-52 rounded-full blur-[60px]`}
            style={{
              background: `radial-gradient(circle, rgba(${palette.secondaryRgb}, 0.4) 0%, transparent 70%)`,
            }}
          />
        </div>

        {/* Mini Header with Cover-Only, Close Main Window & 1-Line Lyric Toggles */}
        <div className="relative z-10 shrink-0 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <Disc3
              className={`w-3.5 h-3.5 shrink-0 ${isPlaying ? 'animate-spin' : ''}`}
              style={{
                color: `rgb(${palette.primaryRgb})`,
                animationDuration: '6s',
              }}
            />
            <span className="text-[9px] uppercase tracking-wider font-bold opacity-75 truncate">
              Mini
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onMouseUp={(e) => e.currentTarget.blur()}
              onClick={handleToggleCloseMainWindow}
              className={`px-1.5 py-0.5 rounded-lg text-[9px] font-semibold transition focus:outline-none ${
                mainWindowHidden
                  ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
              title={
                mainWindowHidden
                  ? 'Restore Main Player Window'
                  : 'Close Main Window whilst having Mini Player open'
              }
            >
              {mainWindowHidden ? 'Show Main' : 'Close Main'}
            </button>
            <button
              onMouseUp={(e) => e.currentTarget.blur()}
              onClick={() => switchMiniCoverMode(true)}
              className="px-1.5 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-[9px] font-semibold transition focus:outline-none"
              title="Show Just the Album Cover"
            >
              Cover Only
            </button>
            <button
              onMouseUp={(e) => e.currentTarget.blur()}
              onClick={() => setMiniShowLyricOnCover((v) => !v)}
              style={miniShowLyricOnCover ? dynamicAccentStyle : undefined}
              className={`px-1.5 py-0.5 rounded-lg text-[9px] font-semibold transition focus:outline-none ${
                miniShowLyricOnCover ? '' : 'bg-white/10 opacity-70 hover:opacity-100'
              }`}
              title="Toggle small 1-line lyric directly on the album cover"
            >
              Lyric
            </button>
            <button
              onMouseUp={(e) => e.currentTarget.blur()}
              onClick={() => {
                setMainWindowHidden(false);
                if (isPopoutWindow && pipWindow) {
                  pipWindow.close();
                  setPipWindow(null);
                } else {
                  setInAppMiniPlayer(false);
                }
              }}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 transition focus:outline-none"
              title="Return to Full Player"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Fluid Resizable Cover Art + Track Info + Visualizer */}
        <div className="relative z-10 flex-1 min-h-0 w-full flex flex-col items-center justify-center overflow-hidden gap-1">
          <div className="relative flex-1 min-h-[2.75rem] max-h-[calc(100%-2.75rem)] aspect-square max-w-[78%] rounded-2xl overflow-hidden recessed-artwork border border-white/15 bg-black/30 flex items-center justify-center">
            {coverUrl ? (
              <div
                key={`mini-cover-splash-${currentSong?.id || coverUrl}`}
                className="relative w-full h-full overflow-hidden"
              >
                <img
                  src={coverUrl}
                  alt={currentSong?.title || 'Cover'}
                  className="cover-liquid-splash-impact w-full h-full object-cover"
                />
                <div
                  className="cover-liquid-ripple-ring-1 pointer-events-none absolute left-1/2 top-1/2 w-[78%] h-[78%]"
                  style={{
                    border: `2px solid rgba(255, 255, 255, 0.55)`,
                    boxShadow: `0 0 18px rgba(${palette.primaryRgb}, 0.65), inset 0 0 14px rgba(255, 255, 255, 0.45)`,
                    background: `radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(${palette.primaryRgb}, 0.25) 52%, transparent 74%)`,
                  }}
                />
                <div
                  className="cover-liquid-caustic-sheen pointer-events-none absolute inset-0"
                  style={{
                    background: `linear-gradient(165deg, transparent 15%, rgba(255,255,255,0.42) 48%, rgba(${palette.primaryRgb}, 0.35) 58%, transparent 82%)`,
                  }}
                />
              </div>
            ) : (
              <Disc3
                className="w-10 h-10 opacity-40"
                style={{ color: `rgb(${palette.primaryRgb})` }}
              />
            )}

            {/* Small 1-Line Synced Lyric Directly on the Album Cover with Clean Verse Transition */}
            {miniShowLyricOnCover && activeLyricLine && (
              <div className="pointer-events-none absolute bottom-1.5 inset-x-1.5 z-10 flex justify-center overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeSyncedIndex}-${activeLyricLine.time}`}
                    initial={{ opacity: 0, y: 7, filter: 'blur(3px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -7, filter: 'blur(3px)' }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md border border-white/15 text-[9px] font-semibold text-white truncate max-w-full shadow"
                  >
                    ♪{' '}
                    {renderLiquidWaterLine(
                      activeLyricLine.text,
                      activeLyricLine.time,
                      nextLyricLineTime,
                      true
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="shrink-0 text-center w-full px-1 leading-tight">
            <h3 className="text-xs font-bold truncate">
              {currentSong?.title || 'No Track Playing'}
            </h3>
            <p className="text-[10px] opacity-65 truncate">
              {currentSong?.artist || 'Liquid Audio'}
            </p>
          </div>

          <div className="w-full shrink-0">
            <AudioVisualizerCanvas
              mode={visualizerMode === 'off' ? 'spectrum' : visualizerMode}
              barAlign={visualizerBarAlign}
              accentRgb={palette.primaryRgb}
              secondaryRgb={palette.secondaryRgb}
              className="h-4"
            />
          </div>
        </div>

        {/* Mini Seek & Controls Board (Compact inline volume stays 100% inside the board) */}
        <div className={`relative z-10 shrink-0 rounded-2xl px-2.5 py-2 space-y-1.5 ${glassClass}`}>
          <div className="flex flex-col gap-0.5">
            <div className="relative w-full h-1.5 rounded-full bg-white/15 flex items-center">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${seekPercent}%`,
                  backgroundColor: `rgb(${palette.primaryRgb})`,
                  boxShadow: `0 0 10px rgba(${palette.primaryRgb}, 0.65)`,
                }}
              />
              <input
                type="range"
                min={0}
                max={totalDuration}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                onMouseUp={(e) => e.currentTarget.blur()}
                className="glass-slider absolute inset-0 w-full h-full focus:outline-none"
              />
            </div>
            <div className="flex justify-between text-[9px] opacity-60 font-mono leading-none">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration || currentSong?.duration || 0)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-1">
            {/* Left: Favorite / Heart Button */}
            <div className="flex items-center justify-start w-16 shrink-0">
              <button
                onMouseUp={(e) => e.currentTarget.blur()}
                onClick={() => currentSong && toggleStarSong(currentSong)}
                className={`p-1.5 rounded-full transition focus:outline-none ${
                  currentSong?.starred ? 'text-pink-400' : 'opacity-60 hover:opacity-100'
                }`}
                title="Favorite"
              >
                <Heart className={`w-3.5 h-3.5 ${currentSong?.starred ? 'fill-current' : ''}`} />
              </button>
            </div>

            {/* Center: Perfectly centered Play/Pause and skip controls */}
            <div className="flex items-center justify-center gap-1.5 shrink-0">
              <button
                onMouseUp={(e) => e.currentTarget.blur()}
                onClick={prevTrack}
                className="p-1 rounded-full hover:bg-white/10 transition focus:outline-none"
                title="Previous"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onMouseUp={(e) => e.currentTarget.blur()}
                onClick={() => {
                  audioController.unlockIOSKeepAlive();
                  setIsPlaying(!isPlaying);
                }}
                style={dynamicAccentStyle}
                className="w-9 h-9 rounded-full flex items-center justify-center transition transform hover:scale-105 active:scale-95 focus:outline-none shrink-0 shadow-lg"
                title={isPlaying ? 'Pause' : 'Resume'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>

              <button
                onMouseUp={(e) => e.currentTarget.blur()}
                onClick={nextTrack}
                className="p-1 rounded-full hover:bg-white/10 transition focus:outline-none"
                title="Next"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Right: Compact inline volume inside the controls board (never leaves board or covers skip buttons) */}
            <div
              className="flex items-center justify-end gap-1 w-16 shrink-0"
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.05 : -0.05;
                const cur = isMuted ? 0 : volume;
                setVolume(Math.max(0, Math.min(1, cur + delta)));
              }}
            >
              <button
                onMouseUp={(e) => e.currentTarget.blur()}
                onClick={toggleMute}
                className="p-1 rounded-full opacity-75 hover:opacity-100 hover:bg-white/10 transition focus:outline-none shrink-0"
                title={
                  isMuted || volume === 0
                    ? 'Unmute'
                    : `Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`
                }
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
              <div className="relative w-9 h-1.5 rounded-full bg-white/15 border border-white/20 flex items-center overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `calc(3px + ${(isMuted ? 0 : volume)} * (100% - 6px))`,
                    backgroundColor: `rgb(${palette.primaryRgb})`,
                  }}
                />
                <div
                  className="pointer-events-none absolute top-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-sm"
                  style={{
                    left: `calc(3px + ${(isMuted ? 0 : volume)} * (100% - 6px))`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onMouseDown={() => setIsDraggingVol(true)}
                  onTouchStart={() => setIsDraggingVol(true)}
                  onMouseUp={(e) => {
                    setIsDraggingVol(false);
                    e.currentTarget.blur();
                  }}
                  onTouchEnd={() => setIsDraggingVol(false)}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={dynamicBgStyle}
      className={`app-safe-shell fixed inset-0 overflow-hidden flex flex-col justify-between transition-all duration-700 ${bgClass}`}
    >
      <AudioEngineBridge />

      {/* OS POP-OUT MINI PLAYER PORTAL (Document Picture-in-Picture Window) */}
      {pipWindow && createPortal(renderMiniPlayerContent(true), pipWindow.document.body)}

      {/* IN-APP DRAGGABLE & RESIZABLE FLOATING MINI PLAYER OVERLAY */}
      <AnimatePresence>
        {inAppMiniPlayer && (
          <motion.div
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            style={{
              width: miniCoverOnly ? Math.min(miniPlayerSize.width, 250) : miniPlayerSize.width,
              height: miniCoverOnly ? Math.min(miniPlayerSize.width, 250) : miniPlayerSize.height,
            }}
            className="fixed bottom-20 right-6 z-50 rounded-3xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.65)] border border-white/20 cursor-grab active:cursor-grabbing"
          >
            {renderMiniPlayerContent(false)}
            {/* Bottom-right corner resize handle for In-App Mini Player */}
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX;
                const startY = e.clientY;
                const startW = miniCoverOnly
                  ? Math.min(miniPlayerSize.width, 250)
                  : miniPlayerSize.width;
                const startH = miniCoverOnly
                  ? Math.min(miniPlayerSize.width, 250)
                  : miniPlayerSize.height;
                const onMove = (ev: PointerEvent) => {
                  const nextW = Math.max(240, Math.min(520, startW + (ev.clientX - startX)));
                  const nextH = miniCoverOnly
                    ? nextW
                    : Math.max(280, Math.min(620, startH + (ev.clientY - startY)));
                  setMiniPlayerSize({ width: nextW, height: nextH });
                };
                const onUp = () => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
              }}
              className="absolute bottom-1 right-1 z-30 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 opacity-50 hover:opacity-100"
              title="Drag to resize Mini Player"
            >
              <div className="w-2 h-2 border-r-2 border-b-2 border-white/70 rounded-br-sm" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN WINDOW CLOSED OVERLAY (Mini Player stays open on top) */}
      {mainWindowHidden && (pipWindow || inAppMiniPlayer) && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[#07080d]">
          <Minimize2 className="w-8 h-8 opacity-50" />
          <p className="text-xs opacity-60">Main window closed — Mini Player is active</p>
          <button
            onClick={handleToggleCloseMainWindow}
            style={dynamicAccentStyle}
            className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" /> Restore Main Window
          </button>
        </div>
      )}

      {/* THEME BACKGROUND: METEOR SHOWER / SPACE VISUALIZER OR LIQUID GLASS AMBIENT BUBBLES */}
      {isSpaceUi ? (
        <SpaceMeteorBackground
          primaryRgb={palette.primaryRgb}
          secondaryRgb={palette.secondaryRgb}
          tertiaryRgb={palette.tertiaryRgb}
          isPlaying={isPlaying}
        />
      ) : (
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0 ambient-liquid-layer">
        {coverUrl && (
          <div
            key={`ambient-${currentSong?.id || coverUrl}`}
            className="bg-liquid-splash-bloom absolute inset-0 blur-3xl scale-125 ambient-blur-surface"
            style={{
              '--bg-ambient-opacity': isCoverBright
                ? isDark
                  ? '0.12'
                  : '0.10'
                : isCoverDark
                ? '0.14'
                : isDark
                ? '0.22'
                : '0.15',
              opacity: isCoverBright
                ? isDark
                  ? 0.12
                  : 0.1
                : isCoverDark
                ? 0.14
                : isDark
                ? 0.22
                : 0.15,
              backgroundImage: `url(${coverUrl})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              filter: isCoverBright ? 'brightness(0.68) saturate(0.95)' : undefined,
            } as React.CSSProperties}
          />
        )}

        {/* Soft Anti-Glare Veil for White/Bright Covers & Deepening Vignette for Black/Dark Covers */}
        {(isCoverBright || isCoverDark) && (
          <div
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              background: isCoverDark
                ? 'radial-gradient(circle at 50% 45%, rgba(0, 0, 0, 0.28) 0%, rgba(0, 0, 0, 0.72) 100%)'
                : isDark
                ? 'radial-gradient(circle at 50% 45%, rgba(8, 10, 16, 0.28) 0%, rgba(6, 8, 14, 0.56) 100%)'
                : 'radial-gradient(circle at 50% 45%, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.18) 100%)',
            }}
          />
        )}

        {/* Background Liquid Splash Shockwave Rings & Droplets on Song Change / Skip */}
        {currentSong && (
          <div
            key={`bg-liquid-splash-${currentSong.id}`}
            className="absolute inset-0 overflow-hidden"
          >
            <div
              className="bg-liquid-splash-ring-1 absolute left-1/2 lg:left-[28%] top-[36%] lg:top-[44%] w-[22rem] h-[22rem] sm:w-[28rem] sm:h-[28rem]"
              style={{
                background: `radial-gradient(circle, rgba(${palette.primaryRgb}, 0.08) 0%, rgba(${palette.primaryRgb}, ${
                  isDark ? 0.36 : 0.26
                }) 52%, rgba(${palette.secondaryRgb}, ${
                  isDark ? 0.28 : 0.2
                }) 66%, transparent 78%)`,
                boxShadow: `0 0 60px rgba(${palette.primaryRgb}, 0.32), inset 0 0 38px rgba(255, 255, 255, 0.22)`,
              }}
            />
            <div
              className="bg-liquid-splash-ring-2 absolute left-1/2 lg:left-[28%] top-[36%] lg:top-[44%] w-[18rem] h-[18rem] sm:w-[24rem] sm:h-[24rem]"
              style={{
                background: `radial-gradient(circle, transparent 34%, rgba(${palette.secondaryRgb}, ${
                  isDark ? 0.34 : 0.24
                }) 58%, rgba(${palette.tertiaryRgb}, ${
                  isDark ? 0.24 : 0.18
                }) 70%, transparent 82%)`,
                boxShadow: `0 0 48px rgba(${palette.secondaryRgb}, 0.28), inset 0 0 28px rgba(255, 255, 255, 0.18)`,
              }}
            />
            <div
              className="bg-liquid-splash-droplet absolute left-1/2 lg:left-[28%] top-[36%] lg:top-[44%] w-28 h-28 rounded-full blur-xl"
              style={{
                '--drop-tx': '-210px',
                '--drop-ty': '-155px',
                background: `radial-gradient(circle, rgba(${palette.primaryRgb}, 0.55) 0%, transparent 72%)`,
              } as React.CSSProperties}
            />
            <div
              className="bg-liquid-splash-droplet absolute left-1/2 lg:left-[28%] top-[36%] lg:top-[44%] w-32 h-32 rounded-full blur-xl"
              style={{
                '--drop-tx': '230px',
                '--drop-ty': '-135px',
                background: `radial-gradient(circle, rgba(${palette.secondaryRgb}, 0.52) 0%, transparent 72%)`,
              } as React.CSSProperties}
            />
            <div
              className="bg-liquid-splash-droplet absolute left-1/2 lg:left-[28%] top-[36%] lg:top-[44%] w-28 h-28 rounded-full blur-xl"
              style={{
                '--drop-tx': '-185px',
                '--drop-ty': '175px',
                background: `radial-gradient(circle, rgba(${palette.tertiaryRgb}, 0.5) 0%, transparent 72%)`,
              } as React.CSSProperties}
            />
            <div
              className="bg-liquid-splash-droplet absolute left-1/2 lg:left-[28%] top-[36%] lg:top-[44%] w-32 h-32 rounded-full blur-xl"
              style={{
                '--drop-tx': '215px',
                '--drop-ty': '165px',
                background: `radial-gradient(circle, rgba(${palette.primaryRgb}, 0.48) 0%, transparent 72%)`,
              } as React.CSSProperties}
            />
          </div>
        )}

        <div
          className={`liquid-bubble-1 ${bubblePlayState} ambient-bubble absolute -top-24 -left-20 w-[26rem] h-[26rem] rounded-full blur-[55px] transition-colors duration-1000`}
          style={{
            background: `radial-gradient(circle, rgba(${palette.primaryRgb}, ${
              isCoverDark ? 0.14 : isCoverBright ? 0.16 : isDark ? 0.30 : 0.22
            }) 0%, rgba(${palette.primaryRgb}, ${
              isCoverDark ? 0.05 : 0.10
            }) 45%, rgba(${palette.primaryRgb}, 0) 70%)`,
          }}
        />

        <div
          className={`liquid-bubble-2 ${bubblePlayState} ambient-bubble absolute -bottom-28 -right-20 w-[30rem] h-[30rem] rounded-full blur-[60px] transition-colors duration-1000`}
          style={{
            background: `radial-gradient(circle, rgba(${palette.secondaryRgb}, ${
              isCoverDark ? 0.12 : isCoverBright ? 0.14 : isDark ? 0.28 : 0.20
            }) 0%, rgba(${palette.secondaryRgb}, ${
              isCoverDark ? 0.04 : 0.08
            }) 45%, rgba(${palette.secondaryRgb}, 0) 70%)`,
          }}
        />

        <div
          className={`liquid-bubble-3 ${bubblePlayState} ambient-bubble absolute top-1/3 left-1/2 -translate-x-1/2 w-[22rem] h-[22rem] rounded-full blur-[50px] transition-colors duration-1000`}
          style={{
            background: `radial-gradient(circle, rgba(${palette.tertiaryRgb}, ${
              isCoverDark ? 0.09 : isCoverBright ? 0.11 : isDark ? 0.20 : 0.16
            }) 0%, rgba(${palette.tertiaryRgb}, ${
              isCoverDark ? 0.03 : 0.06
            }) 45%, rgba(${palette.tertiaryRgb}, 0) 70%)`,
          }}
        />
      </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {shareToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-12 sm:top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs font-medium shadow-xl max-w-[90vw] truncate ${glassClass}`}
          >
            {shareToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. UNIFIED TOP NAV BAR (Left: Brand + Navidrome Status | Middle: Search Song | Right: Mini-Player, Listen Along, Wrapped, Settings) */}
      <header
        className={`relative z-20 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl ${glassClass}`}
      >
        {/* Left Side: Liquid Audio + Status of Navidrome connection */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setActiveView('home')}
            className="flex items-center gap-2 text-left min-w-0 hover:opacity-90 transition"
            title="Liquid Audio Home"
          >
            <Disc3
              className={`w-5 h-5 shrink-0 ${isPlaying ? 'animate-spin' : ''}`}
              style={{ color: `rgb(${palette.primaryRgb})`, animationDuration: '8s' }}
            />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold tracking-tight truncate leading-tight">
                Liquid Audio
              </p>
              <p className="text-[9px] sm:text-[10px] font-semibold opacity-75 flex items-center gap-1 truncate leading-tight">
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                    isNetworkOffline
                      ? 'bg-amber-400'
                      : isConnected
                      ? 'bg-emerald-400'
                      : 'bg-rose-400'
                  }`}
                />
                <span className="truncate">
                  {isNetworkOffline
                    ? 'Offline Mode'
                    : isConnected
                    ? 'Navidrome Connected'
                    : 'Not Connected'}
                </span>
              </p>
            </div>
          </button>
        </div>

        {/* Middle: Search Song & Artists */}
        <div className="flex justify-center px-1 sm:px-2 min-w-0">
          <button
            onClick={() => setSpotlightOpen(true)}
            className="w-full max-w-md flex items-center justify-between gap-2 px-3 py-1.5 sm:py-2 rounded-xl text-xs bg-black/30 hover:bg-black/40 border border-white/15 transition"
            title="Search songs & artists (Ctrl+K)"
          >
            <span className="flex items-center gap-2 min-w-0 opacity-80">
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Search songs & artists...</span>
            </span>
            <kbd className="hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 opacity-70 shrink-0">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Side: Mini-Player, Listen Along, Wrapped, Settings */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Mini-Player Button */}
          <button
            onClick={toggleMiniPlayer}
            className={`hidden sm:flex items-center gap-1 p-2 rounded-xl transition ${
              pipWindow || inAppMiniPlayer
                ? 'bg-white/25 text-white'
                : 'bg-white/10 hover:bg-white/20'
            }`}
            title="Mini Player"
          >
            <PictureInPicture2
              className="w-4 h-4"
              style={
                pipWindow || inAppMiniPlayer
                  ? { color: `rgb(${palette.primaryRgb})` }
                  : undefined
              }
            />
          </button>

          {/* Listen Along Button */}
          <button
            onClick={() => setListenAlongModalOpen(true)}
            style={listeningAlongTo ? dynamicAccentStyle : undefined}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              listeningAlongTo ? '' : 'bg-white/10 hover:bg-white/20'
            }`}
            title="Listen Along"
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              {activeListeners.filter((s) => s.sessionId !== clientSessionId).length}
            </span>
          </button>

          {/* Wrapped Button */}
          <button
            onClick={() => setActiveView(activeView === 'stats' ? 'home' : 'stats')}
            style={activeView === 'stats' ? dynamicAccentStyle : undefined}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeView === 'stats' ? '' : 'bg-white/10 hover:bg-white/20'
            }`}
            title="Liquid Wrapped"
          >
            <Trophy
              className="w-3.5 h-3.5"
              style={activeView !== 'stats' ? { color: `rgb(${palette.primaryRgb})` } : undefined}
            />
            <span className="hidden md:inline">Wrapped</span>
          </button>

          {/* Settings Button (Themes, Navidrome Connection, EQ, Discord RPC, Song Sharing) */}
          <button
            onClick={() => setAuthModalOpen(true)}
            className="flex items-center gap-1 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold transition"
            title="Settings (Themes, Navidrome Connection, EQ & More)"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden lg:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE */}
      <main className="relative z-10 flex-1 min-h-0 my-2 sm:my-3 flex flex-col lg:flex-row gap-3 sm:gap-4 overflow-hidden">
        {/* LEFT / CENTER COLUMN: Now Playing Card with 3D Floating Mouse-Reactive Cover Art (Auto-scales to fit viewport without vertical scroll) */}
        <div
          onMouseMove={handleNowPlayingMouseMove}
          onMouseLeave={handleNowPlayingMouseLeave}
          className={`flex-1 min-h-0 flex flex-col justify-between rounded-3xl p-3 sm:p-4 lg:p-5 overflow-hidden ${glassClass} ${
            activeView !== 'home' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* 3D Floating & Mouse-Rotating Artwork Stage */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full overflow-hidden">
            <div className="artwork-3d-stage artwork-levitate shrink-0">
              <div
                ref={artworkCardRef}
                style={{
                  width: 'clamp(7.5rem, min(26vh, 42vw), 16.5rem)',
                  height: 'clamp(7.5rem, min(26vh, 42vw), 16.5rem)',
                  transform: `rotateX(${artTilt.rotateX.toFixed(2)}deg) rotateY(${artTilt.rotateY.toFixed(
                    2
                  )}deg) scale3d(${artTilt.active ? '1.03, 1.03, 1.03' : '1, 1, 1'})`,
                  boxShadow: artTilt.active
                    ? `${(-artTilt.rotateY * 1.3).toFixed(1)}px ${(
                        artTilt.rotateX * 1.3 +
                        22
                      ).toFixed(1)}px 48px rgba(0, 0, 0, 0.55), 0 0 38px rgba(${
                        palette.primaryRgb
                      }, 0.28)`
                    : undefined,
                }}
                className="artwork-3d-card relative rounded-3xl overflow-hidden recessed-artwork bg-black/30 border border-white/20 flex items-center justify-center group"
              >
                {coverUrl ? (
                  <div
                    key={`cover-splash-${currentSong?.id || coverUrl}`}
                    className="absolute inset-0 w-full h-full overflow-hidden rounded-3xl"
                  >
                    <img
                      src={coverUrl}
                      alt={currentSong?.title || 'Album Art'}
                      onError={(e) => {
                        if (currentSong) {
                          const fallback = `/api/discover/cover?id=${encodeURIComponent(
                            currentSong.id
                          )}&title=${encodeURIComponent(
                            currentSong.title
                          )}&artist=${encodeURIComponent(currentSong.artist)}`;
                          if (!e.currentTarget.src.includes('/api/discover/cover')) {
                            e.currentTarget.src = fallback;
                          }
                        }
                      }}
                      className="cover-liquid-splash-impact absolute inset-0 w-full h-full object-cover"
                    />
                    {/* Concentric Liquid Splash Water Ripple Rings & Caustic Sheen across Album Cover Art */}
                    <div
                      className="cover-liquid-ripple-ring-1 pointer-events-none absolute left-1/2 top-1/2 w-[78%] h-[78%]"
                      style={{
                        border: `2px solid rgba(255, 255, 255, 0.58)`,
                        boxShadow: `0 0 26px rgba(${palette.primaryRgb}, 0.72), inset 0 0 20px rgba(255, 255, 255, 0.48)`,
                        background: `radial-gradient(circle, rgba(255, 255, 255, 0.24) 0%, rgba(${palette.primaryRgb}, 0.28) 54%, transparent 74%)`,
                      }}
                    />
                    <div
                      className="cover-liquid-ripple-ring-2 pointer-events-none absolute left-1/2 top-1/2 w-[66%] h-[66%]"
                      style={{
                        border: `1.5px solid rgba(255, 255, 255, 0.45)`,
                        boxShadow: `0 0 22px rgba(${palette.secondaryRgb}, 0.65), inset 0 0 16px rgba(255, 255, 255, 0.36)`,
                        background: `radial-gradient(circle, transparent 36%, rgba(${palette.secondaryRgb}, 0.26) 62%, transparent 78%)`,
                      }}
                    />
                    <div
                      className="cover-liquid-caustic-sheen pointer-events-none absolute inset-0"
                      style={{
                        background: `linear-gradient(165deg, transparent 14%, rgba(255, 255, 255, 0.46) 46%, rgba(${palette.primaryRgb}, 0.36) 56%, transparent 82%)`,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    key="placeholder"
                    className="flex flex-col items-center opacity-45"
                  >
                    <Disc3
                      className="w-16 h-16 sm:w-20 sm:h-20"
                      style={{ color: `rgb(${palette.primaryRgb})` }}
                    />
                    <span className="text-xs mt-2">No Track Loaded</span>
                  </div>
                )}

                {/* Dynamic 3D Specular Glare Overlay */}
                <div
                  className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                  style={{
                    opacity: artTilt.active ? 1 : 0,
                    background: `radial-gradient(circle at ${artTilt.glareX}% ${artTilt.glareY}%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.06) 35%, transparent 68%)`,
                  }}
                />

                {currentSong && downloadedSongIds[currentSong.id] && (
                  <div className="absolute top-2.5 right-2.5 z-10 px-2 py-0.5 rounded-full bg-emerald-500/85 text-white text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg">
                    <Check className="w-2.5 h-2.5" /> Offline
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_2px_10px_rgba(0,0,0,0.55)]" />
              </div>
            </div>

            {/* Track Title & Metadata */}
            <div className="mt-2 sm:mt-3 text-center max-w-md w-full h-11 sm:h-12 flex flex-col justify-center px-2 shrink-0">
              <div>
                <h2 className="text-base sm:text-xl font-bold truncate">
                  {currentSong?.title || 'Connect to Navidrome'}
                </h2>
                <p className="text-xs sm:text-sm opacity-70 truncate mt-0.5">
                  {currentSong
                    ? `${currentSong.artist}${currentSong.album ? ` • ${currentSong.album}` : ''}`
                    : 'Tap the server icon in the top right to sign in'}
                </p>
              </div>
            </div>

            {/* 60fps Audio Visualizer Reactive to Cover Art Palette & 3D Mouse Movement (moves just like the cover card!) */}
            <div className="w-full max-w-md mt-0.5 sm:mt-1.5 relative group artwork-3d-stage artwork-levitate shrink-0">
              <div
                style={{
                  transform: `rotateX(${(artTilt.rotateX * 0.85).toFixed(2)}deg) rotateY(${(
                    artTilt.rotateY * 0.85
                  ).toFixed(2)}deg) scale3d(${artTilt.active ? '1.02, 1.02, 1.02' : '1, 1, 1'})`,
                }}
                className="artwork-3d-card w-full"
              >
                <AudioVisualizerCanvas
                  mode={visualizerMode}
                  barAlign={visualizerBarAlign}
                  accentRgb={palette.primaryRgb}
                  secondaryRgb={palette.secondaryRgb}
                  className={
                    visualizerMode === 'orb'
                      ? 'h-14 sm:h-20 max-h-[9vh]'
                      : 'h-10 sm:h-14 max-h-[6.5vh]'
                  }
                />
              </div>

              <div className="opacity-75 sm:opacity-0 sm:group-hover:opacity-90 transition-opacity absolute right-1 bottom-0 flex items-center gap-1">
                {(visualizerMode === 'spectrum' || visualizerMode === 'mirror') && (
                  <button
                    onClick={cycleVisualizerBarAlign}
                    className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/50 border border-white/15 hover:bg-black/70"
                    title="Switch Bar Visualizer Position: Middle / Left Side / Right Side"
                  >
                    Align:{' '}
                    {visualizerBarAlign === 'center'
                      ? 'Middle'
                      : visualizerBarAlign === 'left'
                      ? 'Left'
                      : 'Right'}
                  </button>
                )}
                <button
                  onClick={cycleVisualizerMode}
                  className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/50 border border-white/15 hover:bg-black/70"
                >
                  Visualizer: {visualizerMode === 'orb' ? 'Halo' : visualizerMode}
                </button>
              </div>
            </div>
          </div>

          {/* Control Deck (Pinned shrink-0 so buttons are always visible without scrolling) */}
          <div className="w-full max-w-lg mx-auto mt-1 sm:mt-2 flex flex-col gap-1.5 sm:gap-2.5 shrink-0">
            {/* Seek Bar */}
            <div className="flex flex-col gap-1">
              <div className="relative w-full h-1.5 rounded-full bg-white/15 flex items-center">
                <div
                  className="h-full rounded-full transition-colors duration-700"
                  style={{
                    width: `${seekPercent}%`,
                    backgroundColor: `rgb(${palette.primaryRgb})`,
                    boxShadow: `0 0 12px rgba(${palette.primaryRgb}, 0.65)`,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={totalDuration}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="glass-slider absolute inset-0 w-full h-full"
                />
              </div>
              <div className="flex justify-between text-[10px] sm:text-[11px] opacity-60 font-mono">
                <span>{formatTime(currentTime)}</span>
                <span className="flex items-center gap-2">
                  {crossfadeSeconds > 0 && (
                    <span className="text-[10px] opacity-75">
                      DJ Mix: {crossfadeSeconds}s
                    </span>
                  )}
                  {playbackRate !== 1 && (
                    <span className="text-[10px] text-amber-300">
                      {playbackRate.toFixed(2)}x
                    </span>
                  )}
                  <span>{formatTime(duration || currentSong?.duration || 0)}</span>
                </span>
              </div>
            </div>

            {/* Primary Playback Controls */}
            <div className="flex items-center justify-center gap-5 sm:gap-6 my-0.5 sm:my-1">
              <button
                onClick={toggleShuffle}
                className={`p-2 rounded-full transition ${
                  shuffle ? 'bg-white/15 opacity-100' : 'opacity-60 hover:opacity-100'
                }`}
                style={shuffle ? { color: `rgb(${palette.primaryRgb})` } : undefined}
                title="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                onClick={prevTrack}
                className="p-2 sm:p-2.5 rounded-full hover:bg-white/10 transition active:scale-95"
                title="Previous Track"
              >
                <SkipBack className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              <button
                onClick={() => {
                  audioController.unlockIOSKeepAlive();
                  setIsPlaying(!isPlaying);
                }}
                style={dynamicAccentStyle}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-500 transform hover:scale-105 active:scale-95"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                ) : (
                  <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={nextTrack}
                className="p-2 sm:p-2.5 rounded-full hover:bg-white/10 transition active:scale-95"
                title="Next Track"
              >
                <SkipForward className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>

              <button
                onClick={cycleRepeat}
                className={`p-2 rounded-full transition ${
                  repeatMode !== 'off'
                    ? 'bg-white/15 opacity-100'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={repeatMode !== 'off' ? { color: `rgb(${palette.primaryRgb})` } : undefined}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Action Dock: Save, Offline, Share (FileBrowser Public Link), EQ & Volume */}
            <div
              className={`flex items-center justify-between px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full ${glassClass}`}
            >
              <button
                onClick={() => currentSong && toggleStarSong(currentSong)}
                className={`flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 py-1 rounded-full transition ${
                  currentSong?.starred
                    ? 'text-pink-400 bg-pink-500/20'
                    : 'opacity-75 hover:opacity-100 hover:bg-white/10'
                }`}
                title="Save / Favorite Track"
              >
                <Heart
                  className={`w-3.5 h-3.5 ${currentSong?.starred ? 'fill-current' : ''}`}
                />
                <span>Save</span>
              </button>

              <button
                onClick={() => {
                  if (!currentSong) return;
                  if (downloadedSongIds[currentSong.id]) {
                    removeOfflineSong(currentSong.id);
                    notify(`Removed "${currentSong.title}" from offline storage`);
                  } else {
                    notify(`Saving "${currentSong.title}" for offline playback...`);
                    downloadSongForOffline(currentSong).then(() =>
                      notify(`Saved "${currentSong.title}" for offline mode!`)
                    );
                  }
                }}
                disabled={!currentSong || Boolean(currentSong && downloadingSongIds[currentSong.id])}
                className={`flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 py-1 rounded-full transition ${
                  currentSong && downloadedSongIds[currentSong.id]
                    ? 'text-emerald-300 bg-emerald-500/20'
                    : 'opacity-75 hover:opacity-100 hover:bg-white/10'
                }`}
                title="Download track, cover art & lyrics for 100% offline iPhone/PC playback"
              >
                {currentSong && downloadingSongIds[currentSong.id] ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving</span>
                  </>
                ) : currentSong && downloadedSongIds[currentSong.id] ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Offline</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Offline</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleShare(currentSong)}
                disabled={!currentSong || shareLoading}
                className="flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 py-1 rounded-full opacity-75 hover:opacity-100 hover:bg-white/10 transition"
                title="Create & Copy Public File Share Link"
              >
                {shareLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                <span>Share</span>
              </button>

              <button
                onClick={() => currentSong && openAddToPlaylistModal(currentSong)}
                disabled={!currentSong}
                className="flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 py-1 rounded-full opacity-75 hover:opacity-100 hover:bg-white/10 transition"
                title="Add Current Track to Playlist"
              >
                <ListPlus className="w-3.5 h-3.5" />
                <span>Playlist</span>
              </button>

              <button
                onClick={() => setEqModalOpen(true)}
                className="flex items-center gap-1 text-[11px] sm:text-xs font-medium px-2 py-1 rounded-full opacity-75 hover:opacity-100 hover:bg-white/10 transition"
                title="Open Equalizer, Bass Boost & Crossfade Studio"
              >
                <Sliders
                  className="w-3.5 h-3.5 transition-colors duration-500"
                  style={{ color: `rgb(${palette.primaryRgb})` }}
                />
                <span>{eqPreset === 'Flat' ? 'EQ' : eqPreset.split(' ')[0]}</span>
              </button>

              <button
                onClick={() => currentSong && handleDeleteSongPrompt(currentSong)}
                disabled={!currentSong}
                className="flex items-center gap-1 text-[11px] sm:text-xs font-medium px-1.5 sm:px-2 py-1 rounded-full opacity-60 hover:opacity-100 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition shrink-0"
                title="Delete Current Song from Database (Permanent)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden 2xl:inline">Delete</span>
              </button>

              <div
                className="hidden sm:flex items-center gap-1 pl-1.5 pr-2 py-0.5 border-l border-white/10 shrink-0"
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.05 : -0.05;
                  const cur = isMuted ? 0 : volume;
                  setVolume(Math.max(0, Math.min(1, cur + delta)));
                }}
              >
                <button
                  onClick={toggleMute}
                  className="opacity-75 hover:opacity-100 p-0.5 rounded-full transition shrink-0"
                  title={
                    isMuted || volume === 0
                      ? 'Unmute'
                      : `Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`
                  }
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
                <div className="relative w-10 h-1.5 rounded-full bg-white/15 border border-white/20 flex items-center overflow-hidden shrink-0">
                  <div
                    className="h-full rounded-full transition-colors duration-300"
                    style={{
                      width: `calc(3px + ${(isMuted ? 0 : volume)} * (100% - 6px))`,
                      backgroundColor: `rgb(${palette.primaryRgb})`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute top-1/2 w-1.5 h-1.5 rounded-full bg-white shadow-sm"
                    style={{
                      left: `calc(3px + ${(isMuted ? 0 : volume)} * (100% - 6px))`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onMouseDown={() => setIsDraggingVol(true)}
                    onTouchStart={() => setIsDraggingVol(true)}
                    onMouseUp={(e) => {
                      setIsDraggingVol(false);
                      e.currentTarget.blur();
                    }}
                    onTouchEnd={() => setIsDraggingVol(false)}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Home Feed, Lyrics, Library, Add, Queue, OR Liquid Wrapped Stats */}
        <div
          className={`flex-1 min-h-0 flex flex-col rounded-3xl p-3.5 sm:p-5 overflow-hidden ${glassClass} ${
            activeView === 'home' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
            {activeView === 'home' ? (
              /* HOME PAGE RIGHT SIDE: Public Playlists, Recently Played, Random Songs */
              <div className="flex flex-col h-full overflow-y-auto pr-1 space-y-5">
                {/* 1. Public Playlists */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-bold flex items-center gap-2">
                      <Users className="w-4 h-4" style={{ color: `rgb(${palette.primaryRgb})` }} />
                      <span>Public Playlists</span>
                    </h3>
                    <span className="text-[10px] opacity-55">
                      {publicPlaylists.length} available
                    </span>
                  </div>
                  {publicPlaylists.length === 0 ? (
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs opacity-60">
                      No public playlists found on Navidrome yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {publicPlaylists.slice(0, 6).map((pl) => (
                        <div
                          key={pl.id}
                          onClick={() => {
                            selectPlaylist(pl.id);
                            setActiveView('library');
                            setLibrarySection('playlists');
                            setQueueTab('playlists');
                          }}
                          className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{pl.name}</p>
                            <p className="text-[10px] opacity-60 truncate">
                              {pl.songCount} tracks • {pl.owner || 'Public'}
                            </p>
                          </div>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const created = await copyPublicPlaylistToMine(pl.id);
                              if (created) {
                                notify(`Added "${pl.name}" to Your Playlists!`);
                              } else {
                                notify(`Could not copy "${pl.name}"`);
                              }
                            }}
                            className="px-2 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-[10px] font-semibold shrink-0 flex items-center gap-1"
                            title="Add this public playlist to Your Playlists"
                          >
                            <Plus className="w-3 h-3" /> Save
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 2. Recently Played */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-bold flex items-center gap-2">
                      <Clock className="w-4 h-4" style={{ color: `rgb(${palette.primaryRgb})` }} />
                      <span>Recently Played</span>
                    </h3>
                    {recentlyPlayedSongs.length > 0 && (
                      <button
                        onClick={() => playSong(recentlyPlayedSongs[0], recentlyPlayedSongs)}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 transition"
                      >
                        Play All
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {recentlyPlayedSongs.slice(0, 6).map((song) => {
                      const thumb = getSongThumbUrl(song);
                      return (
                        <div
                          key={`recent-${song.id}`}
                          onClick={() => playSong(song, recentlyPlayedSongs)}
                          className="flex items-center justify-between gap-2.5 p-2 rounded-2xl hover:bg-white/10 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl overflow-hidden bg-black/30 border border-white/10 shrink-0 flex items-center justify-center">
                              {thumb ? (
                                <img src={thumb} alt={song.title} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <Disc3 className="w-4 h-4 opacity-50" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{song.title}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openArtistPage(song.artist);
                                }}
                                className="text-[11px] opacity-60 hover:opacity-100 hover:underline truncate block text-left"
                              >
                                {song.artist}
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addToQueue(song);
                              notify(`Added "${song.title}" to queue`);
                            }}
                            className="p-1.5 rounded-lg hover:bg-white/10 opacity-75 hover:opacity-100 shrink-0"
                            title="Add to Queue"
                          >
                            <ListPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* 3. Random Songs */}
                <section className="space-y-2 pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-bold flex items-center gap-2">
                      <Shuffle className="w-4 h-4" style={{ color: `rgb(${palette.primaryRgb})` }} />
                      <span>Random Songs</span>
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setRandomSeed(Date.now())}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-1 transition"
                      >
                        <RefreshCw className="w-3 h-3" /> Shuffle
                      </button>
                      {randomHomeSongs.length > 0 && (
                        <button
                          onClick={() => playSong(randomHomeSongs[0], randomHomeSongs)}
                          style={dynamicAccentStyle}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-xl transition"
                        >
                          Play All
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {randomHomeSongs.map((song) => {
                      const thumb = getSongThumbUrl(song);
                      return (
                        <div
                          key={`rand-${song.id}`}
                          onClick={() => playSong(song, randomHomeSongs)}
                          className="flex items-center justify-between gap-2.5 p-2 rounded-2xl hover:bg-white/10 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl overflow-hidden bg-black/30 border border-white/10 shrink-0 flex items-center justify-center">
                              {thumb ? (
                                <img src={thumb} alt={song.title} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <Disc3 className="w-4 h-4 opacity-50" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{song.title}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openArtistPage(song.artist);
                                }}
                                className="text-[11px] opacity-60 hover:opacity-100 hover:underline truncate block text-left"
                              >
                                {song.artist}
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addToQueue(song);
                              notify(`Added "${song.title}" to queue`);
                            }}
                            className="p-1.5 rounded-lg hover:bg-white/10 opacity-75 hover:opacity-100 shrink-0"
                            title="Add to Queue"
                          >
                            <ListPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : activeView === 'stats' ? (
            /* LIQUID WRAPPED & LISTENING STATS DASHBOARD */
            <div className="flex flex-col h-full overflow-y-auto pr-1 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-white/10">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                      <Trophy
                        className="w-4 h-4 shrink-0"
                        style={{ color: `rgb(${palette.primaryRgb})` }}
                      />
                      <span>Liquid Wrapped • {username || 'Local Account'}</span>
                    </h3>
                    <span
                      className="text-[9px] sm:text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
                      style={dynamicAccentStyle}
                    >
                      {listeningStats.totalSecondsListened > 3600
                        ? 'Vault Connoisseur'
                        : '999 Club'}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] opacity-60 truncate mt-0.5">
                    Saved under account "{username || 'guest'}" in server DB (/wrapped-db/users/)
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Compare User Stats Modal Trigger */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        fetchAvailableWrappedUsers();
                        setComparingDropdownOpen(true);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 border transition ${
                        compareUser
                          ? 'bg-purple-500/25 text-purple-200 border-purple-500/50 shadow-sm shadow-purple-500/20'
                          : 'bg-white/10 hover:bg-white/20 border-white/10'
                      }`}
                      title="Compare Wrapped listening stats with another user on the server"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{compareUser ? `vs @${compareUser}` : 'Compare Users'}</span>
                    </button>
                  </div>

                  <button
                    onClick={handleGenerateWrappedCard}
                    disabled={generatingWrappedCard}
                    style={dynamicAccentStyle}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition"
                    title="Create a shareable Wrapped story card linked to your account"
                  >
                    {generatingWrappedCard ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5" />
                    )}
                    <span>Share Wrapped</span>
                  </button>

                  <button
                    onClick={() => {
                      syncWrappedWithServer();
                      notify(`Synced Wrapped stats to server DB for "${username || 'guest'}"!`);
                    }}
                    className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs transition"
                    title="Sync Wrapped Stats with Local Server Database"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Compare User Responsive Modal Overlay (Full mobile modal with backdrop + clean layout) */}
              <AnimatePresence>
                {comparingDropdownOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setComparingDropdownOpen(false)}
                      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 15 }}
                      className="fixed inset-x-4 top-24 sm:top-28 max-w-sm mx-auto p-4 rounded-3xl bg-[#12131a]/95 backdrop-blur-2xl border border-white/20 shadow-2xl z-50 flex flex-col max-h-[75vh]"
                    >
                      <div className="pb-3 border-b border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                            Compare With User
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          {compareUser && (
                            <button
                              onClick={() => {
                                handleSelectCompareUser('');
                                setComparingDropdownOpen(false);
                              }}
                              className="text-[11px] text-red-400 hover:text-red-300 font-semibold"
                            >
                              Reset
                            </button>
                          )}
                          <button
                            onClick={() => setComparingDropdownOpen(false)}
                            className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] opacity-60 mt-2 mb-3">
                        Select a server account to compare total hours, top tracks & compatibility:
                      </p>

                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                        {availableWrappedUsers
                          .filter(
                            (u) =>
                              u.toLowerCase() !== (username || '').toLowerCase()
                          )
                          .map((u) => (
                            <button
                              key={u}
                              onClick={() => {
                                handleSelectCompareUser(u);
                                setComparingDropdownOpen(false);
                              }}
                              className={`w-full text-left p-2.5 rounded-2xl text-xs flex items-center justify-between transition ${
                                compareUser === u
                                  ? 'font-bold text-purple-200 bg-purple-500/25 border border-purple-500/40 shadow-sm'
                                  : 'hover:bg-white/10 bg-white/5 border border-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-purple-500/30 text-purple-200 flex items-center justify-center text-xs font-bold shrink-0">
                                  {u.charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate font-semibold">@{u}</span>
                              </div>
                              {compareUser === u ? (
                                <Check className="w-4 h-4 text-purple-300 shrink-0" />
                              ) : (
                                <span className="text-[10px] opacity-60 px-2 py-0.5 rounded-lg bg-white/10">
                                  Compare
                                </span>
                              )}
                            </button>
                          ))}

                        {availableWrappedUsers.filter(
                          (u) =>
                            u.toLowerCase() !== (username || '').toLowerCase()
                        ).length === 0 && (
                          <div className="py-8 text-center space-y-1">
                            <Users className="w-8 h-8 opacity-30 mx-auto" />
                            <p className="text-xs opacity-60">No other users found on server</p>
                            <p className="text-[10px] opacity-40">
                              Stats will appear once other users listen to tracks.
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* USER STATS COMPARISON VIEW */}
              {compareUser && compareStats ? (
                <div className="space-y-4">
                  {/* Music Blend & Compatibility Banner */}
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-blue-500/20 border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 overflow-hidden">
                    <div className="min-w-0 w-full flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-extrabold tracking-tight break-words">
                          Music Blend: You & @{compareUser}
                        </span>
                        {musicCompatibility && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/30 text-purple-200 border border-purple-400/30 shrink-0">
                            {musicCompatibility.score}% Taste Match
                          </span>
                        )}
                      </div>
                      {musicCompatibility && musicCompatibility.sharedArtists.length > 0 ? (
                        <p className="text-[11px] opacity-80 break-words line-clamp-2 mt-1">
                          Shared favorites: {musicCompatibility.sharedArtists.join(', ')}
                        </p>
                      ) : (
                        <p className="text-[11px] opacity-80 break-words mt-1">
                          Unique vibes! Compare your listening stats below.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setCompareUser(null);
                        setCompareStats(null);
                      }}
                      className="w-full sm:w-auto px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-white/10 hover:bg-white/20 border border-white/10 shrink-0 text-center transition"
                    >
                      Exit Compare
                    </button>
                  </div>

                  {/* 3 Comparison Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Time Listened Comparison */}
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                      <div className="flex items-center justify-between text-[10px] uppercase opacity-60 gap-1">
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock className="w-3.5 h-3.5" /> Time Listened
                        </span>
                        <span className="font-bold text-purple-300 truncate max-w-[50%] text-right">
                          {listeningStats.totalSecondsListened >= compareStats.totalSecondsListened
                            ? 'You lead'
                            : `@${compareUser} leads`}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="opacity-75">You:</span>
                          <span className="font-bold">
                            {formatDurationHuman(listeningStats.totalSecondsListened)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="opacity-75">@{compareUser}:</span>
                          <span className="font-bold">
                            {formatDurationHuman(compareStats.totalSecondsListened)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Total Plays Comparison */}
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                      <div className="flex items-center justify-between text-[10px] uppercase opacity-60 gap-1">
                        <span className="flex items-center gap-1 shrink-0">
                          <Play className="w-3.5 h-3.5" /> Total Plays
                        </span>
                        <span className="font-bold text-purple-300 truncate max-w-[50%] text-right">
                          {listeningStats.totalPlays >= compareStats.totalPlays
                            ? 'You lead'
                            : `@${compareUser} leads`}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="opacity-75">You:</span>
                          <span className="font-bold">{listeningStats.totalPlays} plays</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="opacity-75">@{compareUser}:</span>
                          <span className="font-bold">{compareStats.totalPlays} plays</span>
                        </div>
                      </div>
                    </div>

                    {/* Daily Streak Comparison */}
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                      <div className="flex items-center justify-between text-[10px] uppercase opacity-60 gap-1">
                        <span className="flex items-center gap-1 shrink-0">
                          <Flame className="w-3.5 h-3.5 text-amber-400" /> Daily Streak
                        </span>
                        <span className="font-bold text-amber-400 truncate max-w-[50%] text-right">
                          {Math.max(listeningStats.dailyStreak, compareStats.dailyStreak)}d best
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="opacity-75">You:</span>
                          <span className="font-bold">{listeningStats.dailyStreak} days</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="opacity-75">@{compareUser}:</span>
                          <span className="font-bold">{compareStats.dailyStreak} days</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Side-by-Side Top Tracks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Your Top Tracks */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-70 flex items-center justify-between">
                        <span>Your Top Tracks</span>
                        <span className="text-[10px] opacity-60">Click to Play</span>
                      </h4>
                      {topPlayedSongs.length === 0 ? (
                        <p className="text-xs opacity-50 py-3 text-center">No plays recorded yet</p>
                      ) : (
                        topPlayedSongs.slice(0, 5).map((stat, idx) => {
                          const { playableSong, thumb } = resolveWrappedSong(stat);
                          return (
                            <div
                              key={stat.id}
                              onClick={() => playSong(playableSong)}
                              className="group flex items-center justify-between p-2 rounded-2xl bg-white/[0.04] hover:bg-white/10 border border-white/5 cursor-pointer transition"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span
                                  className="text-xs font-extrabold w-4 text-center shrink-0"
                                  style={{ color: `rgb(${palette.primaryRgb})` }}
                                >
                                  #{idx + 1}
                                </span>
                                <div className="relative w-8 h-8 rounded-xl overflow-hidden bg-black/30 shrink-0 flex items-center justify-center border border-white/10">
                                  {thumb ? (
                                    <img
                                      src={thumb}
                                      alt={stat.title}
                                      onError={(e) => {
                                        const fallback = `/api/discover/cover?title=${encodeURIComponent(stat.title)}&artist=${encodeURIComponent(stat.artist)}`;
                                        if ((e.currentTarget as HTMLImageElement).src !== fallback) {
                                          (e.currentTarget as HTMLImageElement).src = fallback;
                                        }
                                      }}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Disc3 className="w-4 h-4 opacity-40" />
                                  )}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Play className="w-3.5 h-3.5 text-white fill-current" />
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold truncate group-hover:underline">{stat.title}</p>
                                  <p className="text-[10px] opacity-60 truncate">{stat.artist}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 pl-2">
                                <p className="text-[11px] font-bold">{stat.plays} plays</p>
                                <p className="text-[9px] opacity-60 font-mono">
                                  {formatDurationHuman(stat.seconds)}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Compare User's Top Tracks */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-70 flex items-center justify-between">
                        <span>@{compareUser}'s Top Tracks</span>
                        <span className="text-[10px] opacity-60">Click to Play</span>
                      </h4>
                      {compareTopSongs.length === 0 ? (
                        <p className="text-xs opacity-50 py-3 text-center">No plays recorded yet</p>
                      ) : (
                        compareTopSongs.slice(0, 5).map((stat, idx) => {
                          const { playableSong, thumb } = resolveWrappedSong(stat);
                          return (
                            <div
                              key={stat.id}
                              onClick={() => playSong(playableSong)}
                              className="group flex items-center justify-between p-2 rounded-2xl bg-white/[0.04] hover:bg-white/10 border border-white/5 cursor-pointer transition"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span className="text-xs font-extrabold w-4 text-center shrink-0 text-purple-400">
                                  #{idx + 1}
                                </span>
                                <div className="relative w-8 h-8 rounded-xl overflow-hidden bg-black/30 shrink-0 flex items-center justify-center border border-white/10">
                                  {thumb ? (
                                    <img
                                      src={thumb}
                                      alt={stat.title}
                                      onError={(e) => {
                                        const fallback = `/api/discover/cover?title=${encodeURIComponent(stat.title)}&artist=${encodeURIComponent(stat.artist)}`;
                                        if ((e.currentTarget as HTMLImageElement).src !== fallback) {
                                          (e.currentTarget as HTMLImageElement).src = fallback;
                                        }
                                      }}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Disc3 className="w-4 h-4 opacity-40" />
                                  )}
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Play className="w-3.5 h-3.5 text-white fill-current" />
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold truncate group-hover:underline">{stat.title}</p>
                                  <p className="text-[10px] opacity-60 truncate">{stat.artist}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 pl-2">
                                <p className="text-[11px] font-bold">{stat.plays} plays</p>
                                <p className="text-[9px] opacity-60 font-mono">
                                  {formatDurationHuman(stat.seconds)}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Side-by-Side Top Artists */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-70">
                        Your Top Artists
                      </h4>
                      {topPlayedArtists.slice(0, 4).map((ar, i) => (
                        <div
                          key={ar.artist}
                          className="flex items-center justify-between p-1.5 rounded-xl bg-white/[0.03] text-xs"
                        >
                          <span className="font-semibold truncate">
                            {i + 1}. {ar.artist}
                          </span>
                          <span className="text-[11px] opacity-60 shrink-0">
                            {ar.plays} plays
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-70">
                        @{compareUser}'s Top Artists
                      </h4>
                      {compareTopArtists.slice(0, 4).map((ar, i) => (
                        <div
                          key={ar.artist}
                          className="flex items-center justify-between p-1.5 rounded-xl bg-white/[0.03] text-xs"
                        >
                          <span className="font-semibold truncate text-purple-300">
                            {i + 1}. {ar.artist}
                          </span>
                          <span className="text-[11px] opacity-60 shrink-0">
                            {ar.plays} plays
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* STANDARD LIQUID WRAPPED VIEW */
                <>
                  {/* Your Music Taste Mix Banner (100% Mobile Responsive, No Text Border Overflows) */}
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-purple-500/15 via-pink-500/15 to-blue-500/15 border border-purple-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 overflow-hidden">
                    <div className="min-w-0 w-full">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-extrabold tracking-tight">
                          Your Music Taste Mix
                        </span>
                        <span
                          className="text-[9px] sm:text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0"
                          style={dynamicAccentStyle}
                        >
                          {listeningStats.totalSecondsListened > 3600
                            ? 'Vault Connoisseur'
                            : listeningStats.totalPlays > 20
                            ? 'Heavy Rotator'
                            : 'Sound Explorer'}
                        </span>
                      </div>
                      <p className="text-[11px] opacity-75 break-words line-clamp-2 mt-1">
                        {topPlayedArtists.length > 0
                          ? `Anchored in ${topPlayedArtists[0].artist}${
                              topPlayedArtists.length > 1 ? `, ${topPlayedArtists[1].artist}` : ''
                            } • ${formatDurationHuman(listeningStats.totalSecondsListened)} listened`
                          : 'Listen to tracks to unlock your sound persona, taste mix & blend stats'}
                      </p>
                    </div>
                  </div>

                  {/* 4 Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase opacity-60">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Time Listened</span>
                      </div>
                      <p className="text-base font-bold mt-1 truncate">
                        {formatDurationHuman(listeningStats.totalSecondsListened)}
                      </p>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase opacity-60">
                        <Play className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Total Plays</span>
                      </div>
                      <p className="text-base font-bold mt-1 truncate">
                        {listeningStats.totalPlays}
                      </p>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase opacity-60">
                        <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">Daily Streak</span>
                      </div>
                      <p className="text-base font-bold mt-1 truncate">
                        {listeningStats.dailyStreak} {listeningStats.dailyStreak === 1 ? 'day' : 'days'}
                      </p>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase opacity-60 min-w-0">
                          <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate">Offline Vault</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-1 flex-wrap">
                        <p className="text-base font-bold truncate">{offlineSongs.length} songs</p>
                        {offlineSongs.length > 0 && (
                          <button
                            onClick={handleRemoveAllDownloads}
                            className="text-[10px] px-2 py-0.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 font-semibold transition shrink-0"
                            title="Remove All Offline Downloads"
                          >
                            {confirmClearAllOffline ? 'Confirm?' : 'Clear All'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Top Played Songs */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-70">
                        Top Played Tracks
                      </h4>
                      <span className="text-[10px] opacity-60">Click any track to play</span>
                    </div>
                    {topPlayedSongs.length === 0 ? (
                      <p className="text-xs opacity-50 py-4 text-center">
                        Play any track to start building your Liquid Wrapped stats!
                      </p>
                    ) : (
                      topPlayedSongs.map((stat, idx) => {
                        const { playableSong, thumb } = resolveWrappedSong(stat);
                        return (
                          <div
                            key={stat.id}
                            onClick={() => playSong(playableSong)}
                            className="group flex items-center justify-between p-2 rounded-2xl bg-white/[0.04] hover:bg-white/10 border border-white/5 cursor-pointer transition"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span
                                className="text-xs font-extrabold w-5 text-center shrink-0"
                                style={{ color: `rgb(${palette.primaryRgb})` }}
                              >
                                #{idx + 1}
                              </span>
                              <div className="relative w-9 h-9 rounded-xl overflow-hidden bg-black/30 shrink-0 flex items-center justify-center border border-white/10">
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={stat.title}
                                    onError={(e) => {
                                      const fallback = `/api/discover/cover?title=${encodeURIComponent(stat.title)}&artist=${encodeURIComponent(stat.artist)}`;
                                      if ((e.currentTarget as HTMLImageElement).src !== fallback) {
                                        (e.currentTarget as HTMLImageElement).src = fallback;
                                      }
                                    }}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Disc3 className="w-4 h-4 opacity-40" />
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                  <Play className="w-4 h-4 text-white fill-current" />
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold truncate group-hover:underline">{stat.title}</p>
                                <p className="text-[11px] opacity-60 truncate">{stat.artist}</p>
                              </div>
                            </div>

                            <div className="text-right shrink-0 pl-2">
                              <p className="text-xs font-bold">{stat.plays} plays</p>
                              <p className="text-[10px] opacity-60 font-mono">
                                {formatDurationHuman(stat.seconds)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Top Artists */}
                  {topPlayedArtists.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-70">
                        Top Artists
                      </h4>
                      {topPlayedArtists.map((ar, idx) => {
                        const maxPlays = Math.max(1, topPlayedArtists[0].plays);
                        const pct = Math.min(100, Math.round((ar.plays / maxPlays) * 100));
                        return (
                          <div key={ar.artist} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-semibold">
                                {idx + 1}. {ar.artist}
                              </span>
                              <span className="opacity-65 text-[11px]">
                                {ar.plays} plays • {formatDurationHuman(ar.seconds)}
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: `rgb(${palette.primaryRgb})`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : activeView === 'lyrics' ? (
            /* HYBRID EXACT LYRICS VIEW */
            <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden relative">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Mic2
                      className="w-4 h-4 transition-colors duration-500"
                      style={{ color: `rgb(${palette.primaryRgb})` }}
                    />
                    <span>Synced Lyrics</span>
                    {currentLyrics?.isTranscribing ? (
                      <span className="flex items-center gap-1 text-[10px] uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <Radio className="w-3 h-3 animate-pulse" />
                        Syncing
                      </span>
                    ) : currentLyrics && currentLyrics.source !== 'none' ? (
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                        {currentLyrics.source === 'verified-lrc'
                          ? 'Verified Synced LRC'
                          : currentLyrics.source === 'verified-genius'
                          ? '100% Verified • Audio Aligned'
                          : currentLyrics.source === 'embedded-tag'
                          ? 'Embedded Tag'
                          : currentLyrics.source === 'manual'
                          ? 'Manual Override'
                          : 'Acoustic AI'}
                      </span>
                    ) : null}
                  </h3>
                  <p className="text-[11px] opacity-60">
                    {currentLyrics?.isTranscribing
                      ? currentLyrics.statusMessage || 'Matching verified lyrics & aligning timestamps...'
                      : 'Word-for-word verified lyrics synced to your audio file • Cached locally'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => currentSong && loadLyricsForSong(currentSong, true)}
                    className="p-2 rounded-xl hover:bg-white/10 transition"
                    title="Re-sync verified lyrics for this track"
                  >
                    <RefreshCw className={`w-4 h-4 ${lyricsLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => {
                      setManualLyricsText(
                        currentLyrics?.rawLrc || currentLyrics?.plainText || ''
                      );
                      setEditingLyrics(!editingLyrics);
                    }}
                    className="p-2 rounded-xl hover:bg-white/10 transition"
                    title="Edit lyrics manually"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Lyric Colour Controls */}
              <div className="flex items-center gap-1.5 flex-wrap pt-2.5">
                <PaletteIcon className="w-3.5 h-3.5 opacity-70" />
                {(
                  [
                    { id: 'album', label: 'Match Album Cover (Default)' },
                    { id: 'shimmer', label: 'Cyan / Pearl' },
                    { id: 'custom', label: 'Custom' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setLyricColorMode(m.id)}
                    style={lyricColorMode === m.id ? dynamicAccentStyle : undefined}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                      lyricColorMode === m.id ? '' : 'bg-white/10 opacity-75 hover:opacity-100'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
                {lyricColorMode === 'album' && (
                  <span className="flex items-center gap-0.5">
                    {[palette.primaryRgb, palette.secondaryRgb, palette.tertiaryRgb].map((c) => (
                      <span
                        key={c}
                        className="w-3.5 h-3.5 rounded-full border border-white/30"
                        style={{ backgroundColor: `rgb(${c})` }}
                      />
                    ))}
                  </span>
                )}
                {lyricColorMode === 'custom' && (
                  <input
                    type="color"
                    value={lyricCustomColor}
                    onChange={(e) => setLyricCustomColor(e.target.value)}
                    className="w-7 h-6 rounded cursor-pointer bg-transparent border border-white/20"
                    title="Pick lyric colour"
                  />
                )}
                <button
                  onClick={resetLyricColor}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-white/10 hover:bg-white/20 flex items-center gap-1"
                  title="Reset lyric colour to default (Album Cover)"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>

              {editingLyrics ? (
                <div className="flex-1 flex flex-col gap-3 mt-3 overflow-y-auto">
                  <textarea
                    value={manualLyricsText}
                    onChange={(e) => setManualLyricsText(e.target.value)}
                    placeholder="Paste or edit [mm:ss.xx] synced LRC or plain lyrics..."
                    className="flex-1 w-full p-3 rounded-2xl bg-black/25 border border-white/15 text-xs font-mono focus:outline-none resize-none"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingLyrics(false)}
                      className="px-3 py-1.5 rounded-xl text-xs hover:bg-white/10 flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button
                      onClick={handleManualLyricSave}
                      style={dynamicAccentStyle}
                      className="px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Save Override
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  ref={lyricsContainerRef}
                  onWheel={handleUserManualLyricScroll}
                  onTouchMove={handleUserManualLyricScroll}
                  className="flex-1 min-h-0 overflow-y-auto py-4 px-2 space-y-2.5 relative"
                >
                  {userScrolledLyrics && currentLyrics && currentLyrics.syncedLines.length > 0 && (
                    <div className="sticky top-2 z-20 flex justify-end pointer-events-none">
                      <button
                        onClick={() => {
                          setUserScrolledLyrics(false);
                          if (userScrollTimerRef.current) {
                            window.clearTimeout(userScrollTimerRef.current);
                            userScrollTimerRef.current = null;
                          }
                          const idx = scrollTargetIndex >= 0 ? scrollTargetIndex : activeSyncedIndex;
                          if (idx >= 0) scrollLyricsToIndex(idx, true);
                        }}
                        style={dynamicAccentStyle}
                        className="pointer-events-auto px-3 py-1 rounded-full text-[11px] font-bold shadow-lg flex items-center gap-1.5 transition transform hover:scale-105"
                      >
                        <Radio className="w-3 h-3 animate-pulse" />
                        <span>Resume Auto-Scroll</span>
                      </button>
                    </div>
                  )}
                  {currentLyrics && currentLyrics.syncedLines.length > 0 ? (
                    <>
                      {currentLyrics.syncedLines.map((line, idx) => {
                        const isActive = idx === activeSyncedIndex;
                        const isPast = idx < activeSyncedIndex;
                        return (
                          <div
                            key={`${line.time}-${idx}`}
                            ref={(el) => {
                              lyricLineRefs.current[idx] = el;
                              if (isActive) activeLyricRef.current = el;
                            }}
                            onClick={() => {
                              setUserScrolledLyrics(false);
                              window.dispatchEvent(
                                new CustomEvent('liquid-seek', { detail: line.time })
                              );
                            }}
                            style={
                              isActive
                                ? {
                                    backgroundColor: isDark
                                      ? 'rgba(0, 0, 0, 0.28)'
                                      : 'rgba(255, 255, 255, 0.52)',
                                    borderColor: isDark
                                      ? 'rgba(255, 255, 255, 0.1)'
                                      : 'rgba(15, 23, 42, 0.1)',
                                  }
                                : undefined
                            }
                            className={`cursor-pointer rounded-2xl px-3.5 py-2.5 flex items-baseline gap-3 border border-transparent origin-left transition-all duration-300 ${
                              isActive
                                ? 'text-base md:text-xl font-bold opacity-100 scale-[1.015]'
                                : isPast
                                ? 'text-sm md:text-base opacity-55 hover:opacity-90'
                                : 'text-sm md:text-base opacity-70 hover:opacity-95'
                            }`}
                          >
                            <span className="text-[10px] font-mono opacity-55 shrink-0">
                              {formatTime(line.time)}
                            </span>
                            {isActive ? (
                              renderLiquidWaterLine(line.text, line.time, nextLyricLineTime)
                            ) : (
                              <span>{line.text}</span>
                            )}
                          </div>
                        );
                      })}
                      {currentLyrics.isTranscribing && (
                        <div className="px-3.5 py-2 text-xs opacity-60 italic flex items-center gap-2">
                          <Radio className="w-3.5 h-3.5 animate-pulse" />
                          Syncing upcoming lines...
                        </div>
                      )}
                    </>
                  ) : currentLyrics && currentLyrics.plainText ? (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed opacity-85 px-2">
                      {currentLyrics.plainText}
                    </pre>
                  ) : currentLyrics?.isTranscribing ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-75 gap-2.5">
                      <Radio
                        className="w-8 h-8 animate-pulse"
                        style={{ color: `rgb(${palette.primaryRgb})` }}
                      />
                      <p className="text-xs font-medium">
                        Matching exact lyrics for "{currentSong?.title}"...
                      </p>
                      <p className="text-[11px] opacity-60 max-w-xs">
                        Checking verified LRC & Genius leak database and aligning timestamps to your audio file.
                      </p>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-60 gap-2">
                      <Mic2 className="w-8 h-8 stroke-1" />
                      <p className="text-xs">
                        Select a track or click below to load verified synced lyrics.
                      </p>
                      {currentSong && (
                        <button
                          onClick={() => loadLyricsForSong(currentSong, true)}
                          className="px-3.5 py-1.5 rounded-xl text-xs bg-white/10 hover:bg-white/20 transition"
                        >
                          Load Verified Lyrics
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* LIBRARY, ADD MUSIC, OR QUEUE PANEL */
            <div className="flex flex-col h-full">
              {/* Sub-navigation tabs ONLY when inside Library (ordered: Offline, Liked, Your Playlists, Saved Artists, All Songs) */}
              {activeView === 'library' && (
                <div className="pb-2.5 border-b border-white/10">
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-black/25 p-1 liquid-tab-capsule">
                    {[
                      {
                        id: 'offline',
                        label: `Offline (${offlineSongs.length})`,
                        icon: HardDriveDownload,
                      },
                      {
                        id: 'liked',
                        label: `Liked (${allLikedSongs.length})`,
                        icon: Heart,
                      },
                      {
                        id: 'playlists',
                        label: `Playlists (${playlists.length})`,
                        icon: Folder,
                      },
                      {
                        id: 'artists',
                        label: `Artists (${savedArtists.length})`,
                        icon: User,
                      },
                      {
                        id: 'library',
                        label: `All Songs (${librarySongs.length})`,
                        icon: Disc3,
                      },
                    ].map((tab) => {
                      const isTabActive =
                        tab.id === 'artists'
                          ? librarySection === 'artists'
                          : librarySection !== 'artists' && queueTab === tab.id;
                      const IconComp = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            if (tab.id === 'artists') {
                              setLibrarySection('artists');
                            } else {
                              setLibrarySection(tab.id as any);
                              setSelectedArtistName(null);
                              setQueueTab(tab.id as any);
                            }
                          }}
                          className={`relative px-3 py-1.5 text-xs font-semibold shrink-0 rounded-full transition-colors duration-200 select-none flex items-center gap-1 ${
                            isTabActive ? 'text-white' : 'opacity-70 hover:opacity-100 text-white'
                          }`}
                        >
                          {isTabActive && (
                            <div
                              className="absolute inset-0 rounded-full transition-colors duration-200"
                              style={{
                                backgroundColor: `rgb(${palette.primaryRgb})`,
                                boxShadow: `0 2px 10px rgba(${palette.primaryRgb}, 0.45)`,
                              }}
                            />
                          )}
                          <span className="relative z-10 flex items-center gap-1">
                            {IconComp && <IconComp className="w-3.5 h-3.5" />}
                            <span>{tab.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto mt-3 space-y-1.5 pr-1">
                {/* SAVED ARTISTS & ARTIST DETAIL VIEW */}
                {activeView === 'library' && librarySection === 'artists' && (
                  <div className="space-y-3">
                    {selectedArtistName ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              onClick={() => setSelectedArtistName(null)}
                              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition shrink-0"
                              title="Back to Artists"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold truncate">{selectedArtistName}</h3>
                              <p className="text-[11px] opacity-60">
                                {selectedArtistSongs.length} song{selectedArtistSongs.length === 1 ? '' : 's'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => {
                                toggleSaveArtist(selectedArtistName);
                                const isNowSaved = !savedArtists.some(
                                  (a) => a.toLowerCase() === selectedArtistName.toLowerCase()
                                );
                                notify(
                                  isNowSaved
                                    ? `Saved artist "${selectedArtistName}"`
                                    : `Removed "${selectedArtistName}" from Saved Artists`
                                );
                              }}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 flex items-center gap-1 transition"
                            >
                              {savedArtists.some(
                                (a) => a.toLowerCase() === selectedArtistName.toLowerCase()
                              ) ? (
                                <>
                                  <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Saved</span>
                                </>
                              ) : (
                                <>
                                  <Bookmark className="w-3.5 h-3.5" />
                                  <span>Save Artist</span>
                                </>
                              )}
                            </button>
                            {selectedArtistSongs.length > 0 && (
                              <>
                                <button
                                  onClick={async () => {
                                    notify(`Downloading ${selectedArtistSongs.length} tracks by ${selectedArtistName}...`);
                                    for (const s of selectedArtistSongs) {
                                      if (!downloadedSongIds[s.id]) {
                                        await downloadSongForOffline(s, selectedArtistName);
                                      }
                                    }
                                    notify(`Downloaded all songs by ${selectedArtistName}!`);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 flex items-center gap-1 transition"
                                >
                                  <Download className="w-3.5 h-3.5" /> Download All
                                </button>
                                <button
                                  onClick={() => playSong(selectedArtistSongs[0], selectedArtistSongs)}
                                  style={dynamicAccentStyle}
                                  className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" /> Play All
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          {selectedArtistSongs.map((song) => {
                            const thumb = getSongThumbUrl(song);
                            const menuKey = `artist-${song.id}`;
                            return (
                              <div
                                key={song.id}
                                className="flex items-center justify-between gap-2 p-2 rounded-2xl hover:bg-white/10 transition relative"
                              >
                                <div
                                  onClick={() => playSong(song, selectedArtistSongs)}
                                  className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                                >
                                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/30 border border-white/10 shrink-0 flex items-center justify-center">
                                    {thumb ? (
                                      <img src={thumb} alt={song.title} className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                      <Disc3 className="w-4 h-4 opacity-50" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold truncate">{song.title}</p>
                                    <p className="text-[11px] opacity-60 truncate">
                                      {song.album || song.artist} • {formatTime(song.duration)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 relative">
                                  <button
                                    onClick={() => {
                                      addToQueue(song);
                                      notify(`Added "${song.title}" to queue`);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-white/10 opacity-80 hover:opacity-100"
                                    title="Add to Queue"
                                  >
                                    <ListPlus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setOpenRowMenuId(openRowMenuId === menuKey ? null : menuKey)
                                    }
                                    className="p-1.5 rounded-lg hover:bg-white/10 opacity-80 hover:opacity-100"
                                    title="More options"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                  {openRowMenuId === menuKey && (
                                    <div className="absolute right-0 top-9 z-40 w-36 rounded-xl bg-[#10131e] border border-white/15 shadow-2xl py-1 text-xs">
                                      <button
                                        onClick={() => {
                                          setOpenRowMenuId(null);
                                          downloadSongForOffline(song, selectedArtistName);
                                        }}
                                        className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                                      >
                                        <Download className="w-3.5 h-3.5" /> Download
                                      </button>
                                      <button
                                        onClick={() => {
                                          setOpenRowMenuId(null);
                                          handleShare(song);
                                        }}
                                        className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                                      >
                                        <Share2 className="w-3.5 h-3.5" /> Share
                                      </button>
                                      <button
                                        onClick={() => {
                                          setOpenRowMenuId(null);
                                          openAddToPlaylistModal(song);
                                        }}
                                        className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                                      >
                                        <FolderPlus className="w-3.5 h-3.5" /> Add to Playlist
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <h4 className="text-[11px] uppercase tracking-wider font-bold opacity-65 px-1">
                            Saved Artists ({savedArtists.length})
                          </h4>
                          {savedArtists.length === 0 ? (
                            <p className="text-xs opacity-55 px-2 py-3 bg-white/5 rounded-2xl border border-white/10">
                              No saved artists yet — search for any artist or tap an artist below to save them to your account.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {savedArtists.map((artistName) => {
                                const info = allArtistsIndex.find(
                                  (a) => a.name.toLowerCase() === artistName.toLowerCase()
                                );
                                const thumb = info ? getSongThumbUrl(info.sampleSong) : '';
                                return (
                                  <div
                                    key={`saved-artist-${artistName}`}
                                    onClick={() => setSelectedArtistName(artistName)}
                                    className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-10 h-10 rounded-full overflow-hidden bg-black/30 border border-white/15 shrink-0 flex items-center justify-center">
                                        {thumb ? (
                                          <img src={thumb} alt={artistName} className="w-full h-full object-cover" />
                                        ) : (
                                          <User className="w-4 h-4 opacity-60" />
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold truncate">{artistName}</p>
                                        <p className="text-[10px] opacity-60">
                                          {info?.songs.length || 0} songs
                                        </p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSaveArtist(artistName);
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-white/10 text-emerald-400"
                                      title="Remove Saved Artist"
                                    >
                                      <BookmarkCheck className="w-4 h-4" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 pt-2">
                          <h4 className="text-[11px] uppercase tracking-wider font-bold opacity-65 px-1">
                            All Library Artists ({allArtistsIndex.length})
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {allArtistsIndex.slice(0, 40).map((artist) => {
                              const thumb = getSongThumbUrl(artist.sampleSong);
                              const isSaved = savedArtists.some(
                                (a) => a.toLowerCase() === artist.name.toLowerCase()
                              );
                              return (
                                <div
                                  key={`all-artist-${artist.name}`}
                                  onClick={() => setSelectedArtistName(artist.name)}
                                  className="flex items-center justify-between gap-2 p-2 rounded-2xl hover:bg-white/10 cursor-pointer transition"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-full overflow-hidden bg-black/30 border border-white/10 shrink-0 flex items-center justify-center">
                                      {thumb ? (
                                        <img src={thumb} alt={artist.name} className="w-full h-full object-cover" loading="lazy" />
                                      ) : (
                                        <User className="w-4 h-4 opacity-50" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-semibold truncate">{artist.name}</p>
                                      <p className="text-[10px] opacity-55">
                                        {artist.songs.length} track{artist.songs.length === 1 ? '' : 's'}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSaveArtist(artist.name);
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-white/10 opacity-75 hover:opacity-100"
                                    title={isSaved ? 'Unsave Artist' : 'Save Artist'}
                                  >
                                    {isSaved ? (
                                      <BookmarkCheck className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Bookmark className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeView === 'queue' && (
                  <>
                    {queue.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs opacity-50">
                        Queue is empty. Select tracks from Library, Offline, or Playlists.
                      </div>
                    ) : (
                      <>
                        {/* Queue Search Bar */}
                        <div className="relative flex items-center mb-1.5">
                          <Search className="w-3.5 h-3.5 absolute left-3 opacity-60 pointer-events-none" />
                          <input
                            value={queueSearchQuery}
                            onChange={(e) => setQueueSearchQuery(e.target.value)}
                            placeholder={`Search within queue (${queue.length} songs)...`}
                            className="w-full pl-8 pr-20 py-2 rounded-xl bg-black/25 border border-white/15 text-xs focus:outline-none focus:border-white/40"
                          />
                          {queueSearchQuery && (
                            <div className="absolute right-2.5 flex items-center gap-1.5">
                              <span className="text-[10px] opacity-65 font-mono">
                                {filteredQueueEntries.length} match
                                {filteredQueueEntries.length === 1 ? '' : 'es'}
                              </span>
                              <button
                                onClick={() => setQueueSearchQuery('')}
                                className="p-0.5 rounded-full hover:bg-white/15 opacity-75 hover:opacity-100"
                                title="Clear queue search"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Queue Management Bar: Select Songs to Clear + Clear Queue */}
                        <div className="flex items-center justify-between gap-2 px-2.5 py-2 mb-1.5 rounded-2xl bg-white/5 border border-white/10">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              onClick={() => {
                                if (selectedQueueIndices.length === queue.length) {
                                  setSelectedQueueIndices([]);
                                } else {
                                  setSelectedQueueIndices(queue.map((_, i) => i));
                                }
                              }}
                              className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-semibold transition flex items-center gap-1.5"
                              title="Select or Deselect All Songs in Queue"
                            >
                              <div
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition ${
                                  selectedQueueIndices.length === queue.length && queue.length > 0
                                    ? 'bg-purple-500 border-purple-400 text-white'
                                    : 'border-white/35 bg-black/25'
                                }`}
                              >
                                {selectedQueueIndices.length === queue.length &&
                                  queue.length > 0 && <Check className="w-2.5 h-2.5" />}
                              </div>
                              <span>
                                {selectedQueueIndices.length === queue.length
                                  ? 'Deselect All'
                                  : 'Select All'}
                              </span>
                            </button>
                            {selectedQueueIndices.length > 0 && (
                              <span className="text-[11px] opacity-75 truncate">
                                {selectedQueueIndices.length} selected
                                <span className="opacity-60 hidden sm:inline ml-1 font-normal">
                                  (drag to move)
                                </span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {selectedQueueIndices.length > 0 && (
                              <>
                                <button
                                  onClick={() => {
                                    const songs = selectedQueueIndices.map((i) => queue[i]).filter(Boolean);
                                    openAddToPlaylistModal(songs);
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-purple-500/25 hover:bg-purple-500/35 text-purple-200 border border-purple-500/35 text-[11px] font-semibold flex items-center gap-1 transition"
                                  title="Add Selected Songs to Playlist"
                                >
                                  <ListPlus className="w-3.5 h-3.5" />
                                  <span>Add to Playlist ({selectedQueueIndices.length})</span>
                                </button>
                                <button
                                  onClick={() => {
                                    const count = selectedQueueIndices.length;
                                    removeMultipleFromQueue(selectedQueueIndices);
                                    setSelectedQueueIndices([]);
                                    notify(`Cleared ${count} selected song${count === 1 ? '' : 's'} from queue`);
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-red-500/25 hover:bg-red-500/35 text-red-200 border border-red-500/35 text-[11px] font-semibold flex items-center gap-1 transition"
                                  title="Remove Selected Songs from Queue"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Clear Selected ({selectedQueueIndices.length})</span>
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => {
                                setSelectedQueueIndices([]);
                                clearQueue();
                                notify('Cleared entire playback queue');
                              }}
                              className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-red-500/25 hover:text-red-200 text-[11px] font-semibold flex items-center gap-1 transition"
                              title="Clear All Songs from Queue"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Clear Queue</span>
                            </button>
                          </div>
                        </div>

                        {displayedQueueEntries.length === 0 ? (
                          <div className="py-10 text-center text-xs opacity-60">
                            No songs in queue match "{queueSearchQuery}".
                          </div>
                        ) : (
                          displayedQueueEntries.map(({ song, originalIdx }) => {
                            const isCurrent =
                              currentSong?.id === song.id && currentIndex === originalIdx;
                            const isDownloaded = Boolean(downloadedSongIds[song.id]);
                            const isSelected = selectedQueueIndices.includes(originalIdx);
                            const thumbUrl = getSongThumbUrl(song);
                            return (
                              <QueueItemRow
                                key={`${song.id}-${originalIdx}`}
                                song={song}
                                idx={originalIdx}
                                isCurrent={isCurrent}
                                isSelected={isSelected}
                                isDownloaded={isDownloaded}
                                thumbUrl={thumbUrl}
                                primaryRgb={palette.primaryRgb}
                                isFirst={originalIdx === 0}
                                isLast={originalIdx === queue.length - 1}
                                onToggleSelect={handleToggleSelectQueue}
                                onPlay={handlePlayQueueItemCallback}
                                onReorderUp={handleReorderUpCallback}
                                onReorderDown={handleReorderDownCallback}
                                onAddToPlaylist={handleAddToPlaylistCallback}
                                onRemove={handleRemoveFromQueueCallback}
                                isDragging={
                                  isDraggingQueue && selectedQueueIndices.includes(originalIdx)
                                }
                                isDragOver={
                                  dragOverQueueIdx?.idx === originalIdx
                                    ? dragOverQueueIdx.pos
                                    : null
                                }
                                onRowDragStart={handleQueueDragStart}
                                onRowDragOver={handleQueueDragOver}
                                onRowDragLeave={handleQueueDragLeave}
                                onRowDragEnd={handleQueueDragEnd}
                                onRowDrop={handleQueueDrop}
                              />
                            );
                          })
                        )}

                        {!queueSearchQuery.trim() && queue.length > queueDisplayLimit && (
                          <div className="pt-2 pb-1 flex items-center justify-center">
                            <button
                              onClick={() =>
                                setQueueDisplayLimit((prev) =>
                                  Math.min(queue.length, prev + 60)
                                )
                              }
                              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 transition flex items-center gap-1.5"
                            >
                              <span>
                                Load More ({queue.length - queueDisplayLimit} songs remaining)
                              </span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {activeView === 'library' && librarySection !== 'artists' && queueTab === 'library' && (
                  <>
                    <div className="mb-2.5 space-y-2">
                      <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 absolute left-3 opacity-60 pointer-events-none" />
                        <input
                          value={searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          placeholder="Search songs by title, artist, or album..."
                          className="w-full pl-8 pr-16 py-2 rounded-xl bg-black/25 border border-white/15 text-xs focus:outline-none focus:border-white/40"
                        />
                        <div className="absolute right-2.5 flex items-center gap-1.5">
                          {isLoading && (
                            <RefreshCw className="w-3 h-3 animate-spin text-white/50" />
                          )}
                          {searchQuery && (
                            <button
                              onClick={() => handleSearchChange('')}
                              className="p-0.5 rounded-full hover:bg-white/15 opacity-70"
                              title="Clear search"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                          {(
                            [
                              { id: 'all', label: `All (${librarySongs.length})` },
                              { id: 'starred', label: 'Saved ♥' },
                              { id: 'offline', label: `Offline (${offlineSongs.length})` },
                            ] as const
                          ).map((chip) => (
                            <button
                              key={chip.id}
                              onClick={() => setLibraryFilter(chip.id)}
                              style={libraryFilter === chip.id ? dynamicAccentStyle : undefined}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold shrink-0 transition ${
                                libraryFilter === chip.id
                                  ? ''
                                  : 'bg-white/5 opacity-70 hover:opacity-100'
                              }`}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {libraryFilter === 'offline' && offlineSongs.length > 0 && (
                            <button
                              onClick={handleRemoveAllDownloads}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 text-[11px] font-semibold transition"
                              title="Remove All Offline Downloads"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>
                                {confirmClearAllOffline
                                  ? `Confirm (${offlineSongs.length})?`
                                  : 'Remove All'}
                              </span>
                            </button>
                          )}
                          <button
                            onClick={handleResyncAllSongs}
                            disabled={isResyncing}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                              isResyncing
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-white/5 hover:bg-white/10 text-white/80 hover:text-white'
                            }`}
                            title="Resync & scan all songs on server"
                          >
                            <RefreshCw className={`w-3 h-3 ${isResyncing ? 'animate-spin' : ''}`} />
                            <span>{isResyncing ? resyncProgress || 'Scanning...' : 'Resync'}</span>
                          </button>
                          <button
                            onClick={() =>
                              setLibrarySort(
                                librarySort === 'title'
                                  ? 'artist'
                                  : librarySort === 'artist'
                                  ? 'duration'
                                  : 'title'
                              )
                            }
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] opacity-80"
                            title="Cycle Sort Order"
                          >
                            <ArrowUpDown className="w-3 h-3" />
                            <span>
                              Sort:{' '}
                              {librarySort === 'title'
                                ? 'Title'
                                : librarySort === 'artist'
                                ? 'Artist'
                                : 'Duration'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {filteredLibrarySongs.length === 0 ? (
                      <div className="py-10 text-center space-y-3 opacity-75 text-xs">
                        <p>No matching tracks in your library.</p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            onClick={handleResyncAllSongs}
                            disabled={isResyncing}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white transition"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                            <span>{isResyncing ? resyncProgress || 'Scanning Server...' : 'Resync All Songs on Server'}</span>
                          </button>
                          {searchQuery.trim() && (
                            <button
                              onClick={() => {
                                setDiscoverQuery(searchQuery);
                                setActiveView('add');
                                setQueueTab('discover');
                                handleDiscoverSearch(undefined, discoverSource, searchQuery);
                              }}
                              style={dynamicAccentStyle}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              <span>Search "{searchQuery}" on Spotify / SoundCloud</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        {displayedLibrarySongs.map((song) => {
                          const isDownloaded = Boolean(downloadedSongIds[song.id]);
                          const isDownloading = Boolean(downloadingSongIds[song.id]);
                          const thumbUrl = getSongThumbUrl(song);
                          return (
                            <LibraryItemRow
                              key={song.id}
                              song={song}
                              isDownloaded={isDownloaded}
                              isDownloading={isDownloading}
                              thumbUrl={thumbUrl}
                              primaryRgb={palette.primaryRgb}
                              onPlay={handlePlaySongCallback}
                              onAddToQueue={handleAddToQueueCallback}
                              onShare={handleShareSongCallback}
                              onDownloadToggle={handleLibraryDownloadToggle}
                              onAddToPlaylist={handleAddToPlaylistCallback}
                              onDeleteFromDatabase={handleDeleteSongPrompt}
                            />
                          );
                        })}

                        {filteredLibrarySongs.length > libraryDisplayLimit && (
                          <div className="pt-2 pb-1 flex items-center justify-center">
                            <button
                              onClick={() =>
                                setLibraryDisplayLimit((prev) =>
                                  Math.min(filteredLibrarySongs.length, prev + 60)
                                )
                              }
                              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 transition flex items-center gap-1.5"
                            >
                              <span>
                                Load More ({filteredLibrarySongs.length - libraryDisplayLimit} songs remaining)
                              </span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {activeView === 'library' && librarySection !== 'artists' && queueTab === 'liked' && (
                  <div className="space-y-3">
                    {/* Liked Songs Hero Card */}
                    <div
                      className="p-3.5 rounded-2xl border border-white/15 flex flex-wrap items-center justify-between gap-3"
                      style={{
                        background: `linear-gradient(135deg, rgba(${palette.primaryRgb}, 0.28) 0%, rgba(${palette.secondaryRgb}, 0.14) 100%)`,
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
                          style={dynamicAccentStyle}
                        >
                          <Heart className="w-5 h-5 fill-current text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold truncate">Liked Songs</h3>
                          <p className="text-[11px] opacity-75">
                            {allLikedSongs.length} favorite track{allLikedSongs.length === 1 ? '' : 's'} synced with your account
                          </p>
                        </div>
                      </div>

                      {allLikedSongs.length > 0 && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              playSong(allLikedSongs[0], allLikedSongs);
                              notify(`Playing ${allLikedSongs.length} Liked Songs`);
                            }}
                            style={dynamicAccentStyle}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-lg hover:scale-105 active:scale-95 transition"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Play All</span>
                          </button>
                          <button
                            onClick={() => {
                              const shuffled = [...allLikedSongs].sort(() => Math.random() - 0.5);
                              playSong(shuffled[0], shuffled);
                              notify(`Shuffling ${allLikedSongs.length} Liked Songs`);
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 flex items-center gap-1.5 transition"
                          >
                            <Shuffle className="w-3.5 h-3.5" />
                            <span>Shuffle</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Search within Liked Songs */}
                    {allLikedSongs.length > 0 && (
                      <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 absolute left-3 opacity-60 pointer-events-none" />
                        <input
                          value={likedSearchQuery}
                          onChange={(e) => setLikedSearchQuery(e.target.value)}
                          placeholder="Filter your liked songs..."
                          className="w-full pl-8 pr-8 py-2 rounded-xl bg-black/25 border border-white/15 text-xs focus:outline-none focus:border-white/40"
                        />
                        {likedSearchQuery && (
                          <button
                            onClick={() => setLikedSearchQuery('')}
                            className="absolute right-2.5 p-0.5 rounded-full hover:bg-white/15 opacity-70"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {filteredLikedSongs.length === 0 ? (
                      <div className="py-12 text-center space-y-2 opacity-70 text-xs">
                        <Heart className="w-8 h-8 mx-auto opacity-45" />
                        <p className="font-semibold">
                          {allLikedSongs.length === 0
                            ? 'No liked songs yet'
                            : 'No liked songs match your filter'}
                        </p>
                        <p className="text-[11px] opacity-70">
                          Tap the heart icon on any playing track to add it to your Liked Songs.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {filteredLikedSongs.map((song) => {
                          const isDownloaded = Boolean(downloadedSongIds[song.id]);
                          const isDownloading = Boolean(downloadingSongIds[song.id]);
                          const thumbUrl = getSongThumbUrl(song);
                          return (
                            <LibraryItemRow
                              key={`liked-${song.id}`}
                              song={song}
                              isDownloaded={isDownloaded}
                              isDownloading={isDownloading}
                              thumbUrl={thumbUrl}
                              primaryRgb={palette.primaryRgb}
                              onPlay={handlePlaySongCallback}
                              onAddToQueue={handleAddToQueueCallback}
                              onShare={handleShareSongCallback}
                              onDownloadToggle={handleLibraryDownloadToggle}
                              onAddToPlaylist={handleAddToPlaylistCallback}
                              onDeleteFromDatabase={handleDeleteSongPrompt}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {activeView === 'library' && librarySection !== 'artists' && queueTab === 'playlists' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <input
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="New playlist name..."
                        className="flex-1 px-3 py-1.5 rounded-xl bg-black/20 border border-white/15 text-xs focus:outline-none"
                      />
                      <button
                        onClick={() => {
                          if (newPlaylistName.trim()) {
                            createNewPlaylist(
                              newPlaylistName,
                              currentSong ? [currentSong.id] : []
                            );
                            setNewPlaylistName('');
                          }
                        }}
                        style={dynamicAccentStyle}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Create
                      </button>
                    </div>

                    {selectedPlaylist ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between bg-white/5 p-2.5 rounded-2xl">
                          <div>
                            <button
                              onClick={() => selectPlaylist(null)}
                              className="text-[11px] opacity-80 hover:underline flex items-center gap-1"
                              style={{ color: `rgb(${palette.primaryRgb})` }}
                            >
                              <ChevronLeft className="w-3 h-3" /> All Playlists
                            </button>
                            <h4 className="text-sm font-bold mt-0.5">
                              {selectedPlaylist.name}
                            </h4>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                const entries = selectedPlaylist.entry || [];
                                if (!entries.length) return;
                                notify(
                                  `Saving playlist "${selectedPlaylist.name}" (${entries.length} tracks) to Offline Playlists...`
                                );
                                createOfflinePlaylist(selectedPlaylist.name);
                                for (const s of entries) {
                                  await downloadSongForOffline(s, selectedPlaylist.name);
                                }
                                notify(
                                  `Playlist "${selectedPlaylist.name}" saved to your phone's Offline Playlists!`
                                );
                              }}
                              className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 flex items-center gap-1"
                              title="Download entire playlist and sort into Offline Playlists on your phone"
                            >
                              <Download className="w-3.5 h-3.5" /> Offline All
                            </button>
                            <button
                              onClick={() => {
                                const entries = selectedPlaylist.entry || [];
                                if (!entries.length) return;
                                for (const s of entries) {
                                  addToQueue(s);
                                }
                                notify(`Added ${entries.length} songs from "${selectedPlaylist.name}" to queue`);
                              }}
                              className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 flex items-center gap-1"
                              title="Add all songs in this playlist to queue"
                            >
                              <ListPlus className="w-3.5 h-3.5" /> + Queue All
                            </button>
                            <button
                              onClick={() => {
                                if (selectedPlaylist.entry?.length) {
                                  playSong(selectedPlaylist.entry[0], selectedPlaylist.entry);
                                }
                              }}
                              style={dynamicAccentStyle}
                              className="px-3 py-1 rounded-xl text-xs font-semibold"
                            >
                              Play All
                            </button>
                            <button
                              onClick={() => deleteExistingPlaylist(selectedPlaylist.id)}
                              className="p-1.5 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30"
                              title="Delete Playlist"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Playlist Selection & Reordering Bar */}
                        <div className="flex items-center justify-between gap-2 px-2.5 py-2 mb-1.5 rounded-2xl bg-white/5 border border-white/10">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              onClick={() => {
                                const entries = selectedPlaylist.entry || [];
                                if (selectedPlaylistIndices.length === entries.length) {
                                  setSelectedPlaylistIndices([]);
                                } else {
                                  setSelectedPlaylistIndices(entries.map((_, i) => i));
                                }
                              }}
                              className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-semibold transition flex items-center gap-1.5"
                              title="Select or Deselect All Songs in Playlist"
                            >
                              <div
                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition ${
                                  selectedPlaylistIndices.length ===
                                    (selectedPlaylist.entry?.length || 0) &&
                                  (selectedPlaylist.entry?.length || 0) > 0
                                    ? 'bg-purple-500 border-purple-400 text-white'
                                    : 'border-white/35 bg-black/25'
                                }`}
                              >
                                {selectedPlaylistIndices.length ===
                                  (selectedPlaylist.entry?.length || 0) &&
                                  (selectedPlaylist.entry?.length || 0) > 0 && (
                                    <Check className="w-2.5 h-2.5" />
                                  )}
                              </div>
                              <span>
                                {selectedPlaylistIndices.length ===
                                (selectedPlaylist.entry?.length || 0)
                                  ? 'Deselect All'
                                  : 'Select All'}
                              </span>
                            </button>
                            {selectedPlaylistIndices.length > 0 && (
                              <span className="text-[11px] opacity-75 truncate">
                                {selectedPlaylistIndices.length} selected
                                <span className="opacity-60 hidden sm:inline ml-1 font-normal">
                                  (drag to move)
                                </span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {selectedPlaylistIndices.length > 0 && (
                              <>
                                <button
                                  onClick={() => {
                                    const entries = selectedPlaylist.entry || [];
                                    const songs = selectedPlaylistIndices
                                      .map((i) => entries[i])
                                      .filter(Boolean);
                                    for (const s of songs) addToQueue(s);
                                    notify(
                                      `Added ${songs.length} song${
                                        songs.length === 1 ? '' : 's'
                                      } to queue`
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-purple-500/25 hover:bg-purple-500/35 text-purple-200 border border-purple-500/35 text-[11px] font-semibold flex items-center gap-1 transition"
                                >
                                  <ListPlus className="w-3.5 h-3.5" />
                                  <span>+ Queue ({selectedPlaylistIndices.length})</span>
                                </button>
                                <button
                                  onClick={async () => {
                                    const count = selectedPlaylistIndices.length;
                                    const entries = selectedPlaylist.entry || [];
                                    const removeSet = new Set(selectedPlaylistIndices);
                                    const remaining = entries.filter((_, i) => !removeSet.has(i));
                                    setSelectedPlaylistIndices([]);
                                    if (client) {
                                      await client.replacePlaylistTracks(
                                        selectedPlaylist.id,
                                        selectedPlaylist.name,
                                        remaining.map((s) => s.id)
                                      );
                                      await selectPlaylist(selectedPlaylist.id);
                                      notify(
                                        `Removed ${count} song${
                                          count === 1 ? '' : 's'
                                        } from "${selectedPlaylist.name}"`
                                      );
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-red-500/25 hover:bg-red-500/35 text-red-200 border border-red-500/35 text-[11px] font-semibold flex items-center gap-1 transition"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Remove ({selectedPlaylistIndices.length})</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {(selectedPlaylist.entry || []).map((song, idx) => {
                          const isSelected = selectedPlaylistIndices.includes(idx);
                          const isOver = dragOverPlaylistIdx?.idx === idx;
                          return (
                            <div
                              key={`${song.id}-${idx}`}
                              draggable
                              onDragStart={(e) => handlePlaylistDragStart(e, idx)}
                              onDragOver={(e) => handlePlaylistDragOver(e, idx)}
                              onDragLeave={(e) => handlePlaylistDragLeave(e, idx)}
                              onDrop={(e) => handlePlaylistDrop(e, idx)}
                              onDragEnd={handlePlaylistDragEnd}
                              className={`group flex items-center justify-between p-2 rounded-xl transition relative select-none ${
                                isDraggingPlaylist && isSelected ? 'opacity-40 scale-[0.98]' : ''
                              } ${
                                isOver
                                  ? dragOverPlaylistIdx?.pos === 'before'
                                    ? 'border-t-2 !border-t-purple-400 bg-white/5'
                                    : 'border-b-2 !border-b-purple-400 bg-white/5'
                                  : isSelected
                                  ? 'bg-purple-500/15 border border-purple-500/30'
                                  : 'hover:bg-white/10 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div
                                  className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white/90 transition -mr-0.5 p-1 flex items-center shrink-0"
                                  title="Drag to reorder (Shift-select multiple to move as a group)"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </div>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleSelectPlaylistTrack(idx, e.shiftKey);
                                  }}
                                  className={`w-4 h-4 rounded-md border shrink-0 flex items-center justify-center transition ${
                                    isSelected
                                      ? 'border-transparent text-white bg-purple-500'
                                      : 'border-white/30 bg-black/25 hover:border-white/60'
                                  }`}
                                  title="Select track (Shift-click to select range)"
                                >
                                  {isSelected && <Check className="w-3 h-3" />}
                                </button>

                                <div
                                  onClick={(e) => {
                                    if (e.shiftKey) {
                                      e.preventDefault();
                                      handleToggleSelectPlaylistTrack(idx, true);
                                    } else {
                                      playSong(song);
                                    }
                                  }}
                                  className="flex-1 min-w-0 cursor-pointer"
                                >
                                  <p className="text-xs font-semibold truncate">{song.title}</p>
                                  <p className="text-[11px] opacity-60 truncate">{song.artist}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 relative shrink-0">
                                <button
                                  onClick={() => {
                                    addToQueue(song);
                                    notify(`Added "${song.title}" to queue`);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-white/10 text-xs text-white/75 hover:text-white"
                                  title="Add to Queue"
                                >
                                  <ListPlus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const mk = `pl-${selectedPlaylist.id}-${idx}`;
                                    setOpenRowMenuId(openRowMenuId === mk ? null : mk);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/75 hover:text-white"
                                  title="Download, Share, Move, or Delete"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                                {openRowMenuId === `pl-${selectedPlaylist.id}-${idx}` && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-9 z-40 w-40 rounded-xl bg-[#10131e] border border-white/15 shadow-2xl py-1 text-xs"
                                  >
                                    <button
                                      onClick={() => {
                                        setOpenRowMenuId(null);
                                        downloadSongForOffline(song, selectedPlaylist.name);
                                      }}
                                      className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                                    >
                                      <Download className="w-3.5 h-3.5" /> Download
                                    </button>
                                    <button
                                      onClick={() => {
                                        setOpenRowMenuId(null);
                                        handleShare(song);
                                      }}
                                      className="w-full px-3 py-1.5 text-left hover:bg-white/10 flex items-center gap-2"
                                    >
                                      <Share2 className="w-3.5 h-3.5" /> Share
                                    </button>
                                    <button
                                      onClick={() => {
                                        setOpenRowMenuId(null);
                                        reorderPlaylistTracks(selectedPlaylist.id, idx, idx - 1);
                                      }}
                                      disabled={idx === 0}
                                      className="w-full px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-30 flex items-center gap-2"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" /> Move Up
                                    </button>
                                    <button
                                      onClick={() => {
                                        setOpenRowMenuId(null);
                                        reorderPlaylistTracks(selectedPlaylist.id, idx, idx + 1);
                                      }}
                                      disabled={idx === (selectedPlaylist.entry?.length || 1) - 1}
                                      className="w-full px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-30 flex items-center gap-2"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" /> Move Down
                                    </button>
                                    <button
                                      onClick={() => {
                                        setOpenRowMenuId(null);
                                        removeSongFromPlaylist(selectedPlaylist.id, idx);
                                      }}
                                      className="w-full px-3 py-1.5 text-left hover:bg-red-500/20 text-red-300 flex items-center gap-2"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {/* Playlist Folders Toolbar */}
                        <div className="flex items-center justify-between gap-2 px-1 pb-1">
                          <span className="text-[10px] uppercase tracking-wider font-bold opacity-60">
                            {playlistFolders.length > 0
                              ? `${playlistFolders.length} Folder${playlistFolders.length === 1 ? '' : 's'} • ${playlists.length} Playlists`
                              : `${playlists.length} Playlists`}
                          </span>
                          <button
                            onClick={() => setShowNewFolderInput((v) => !v)}
                            className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-semibold flex items-center gap-1 transition"
                            title="Create a folder to organize your playlists"
                          >
                            <FolderPlus className="w-3.5 h-3.5" style={{ color: `rgb(${palette.primaryRgb})` }} />
                            New Folder
                          </button>
                        </div>

                        {showNewFolderInput && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const created = createPlaylistFolder(newPlaylistFolderName);
                              if (created) {
                                setExpandedFolderIds((prev) => ({ ...prev, [created.id]: true }));
                                setNewPlaylistFolderName('');
                                setShowNewFolderInput(false);
                                notify(`Created folder "${created.name}"`);
                              }
                            }}
                            className="flex items-center gap-1.5 p-2 rounded-2xl bg-white/5 border border-white/10"
                          >
                            <input
                              type="text"
                              value={newPlaylistFolderName}
                              onChange={(e) => setNewPlaylistFolderName(e.target.value)}
                              placeholder="Folder name (e.g. Chill, Gym, Late Night)..."
                              className="flex-1 min-w-0 bg-black/25 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none focus:border-white/30"
                              autoFocus
                            />
                            <button
                              type="submit"
                              style={dynamicAccentStyle}
                              className="px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0"
                            >
                              Create
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowNewFolderInput(false);
                                setNewPlaylistFolderName('');
                              }}
                              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        )}

                        {(() => {
                          const assignedPlaylistIds = new Set(
                            playlistFolders.flatMap((f) => f.playlistIds)
                          );
                          const uncategorizedPlaylists = playlists.filter(
                            (pl) => !assignedPlaylistIds.has(pl.id)
                          );

                          const renderPlaylistRow = (pl: (typeof playlists)[0], currentFolderId: string | null) => (
                            <div
                              key={pl.id}
                              onClick={() => selectPlaylist(pl.id)}
                              className="flex items-center justify-between gap-2 p-2.5 rounded-2xl hover:bg-white/10 cursor-pointer transition"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold truncate">{pl.name}</p>
                                <p className="text-[11px] opacity-60 truncate">
                                  {pl.songCount} tracks • {formatTime(pl.duration)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {playlistFolders.length > 0 && (
                                  <select
                                    value={currentFolderId || ''}
                                    onChange={(e) => {
                                      const nextFolderId = e.target.value || null;
                                      assignPlaylistToFolder(pl.id, nextFolderId);
                                      if (nextFolderId) {
                                        setExpandedFolderIds((prev) => ({ ...prev, [nextFolderId]: true }));
                                        const folderName =
                                          playlistFolders.find((f) => f.id === nextFolderId)?.name || 'folder';
                                        notify(`Moved "${pl.name}" to ${folderName}`);
                                      } else {
                                        notify(`Removed "${pl.name}" from folder`);
                                      }
                                    }}
                                    title="Move playlist into a folder"
                                    className="max-w-[6.5rem] bg-black/30 border border-white/10 rounded-lg px-1.5 py-1 text-[10px] font-medium focus:outline-none cursor-pointer"
                                  >
                                    <option value="">No Folder</option>
                                    {playlistFolders.map((f) => (
                                      <option key={f.id} value={f.id}>
                                        📁 {f.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!client) return;
                                    try {
                                      const fullPl = await client.getPlaylist(pl.id);
                                      const entries = fullPl?.entry || [];
                                      if (entries.length > 0) {
                                        for (const s of entries) {
                                          addToQueue(s);
                                        }
                                        notify(`Added ${entries.length} songs from "${pl.name}" to queue`);
                                      } else {
                                        notify(`Playlist "${pl.name}" is empty`);
                                      }
                                    } catch (err) {
                                      notify(`Could not load "${pl.name}" tracks`);
                                    }
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/75 hover:text-white flex items-center gap-1 text-[11px]"
                                  title="Add entire playlist to queue"
                                >
                                  <ListPlus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteExistingPlaylist(pl.id);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-300"
                                  title="Delete Playlist"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );

                          return (
                            <>
                              {/* Render Collapsible Playlist Folders */}
                              {playlistFolders.map((folder) => {
                                const folderPlaylists = playlists.filter((pl) =>
                                  folder.playlistIds.includes(pl.id)
                                );
                                const isExpanded = expandedFolderIds[folder.id] ?? true;
                                const isEditing = editingFolderId === folder.id;

                                return (
                                  <div
                                    key={folder.id}
                                    className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden"
                                  >
                                    <div
                                      onClick={() =>
                                        setExpandedFolderIds((prev) => ({
                                          ...prev,
                                          [folder.id]: !isExpanded,
                                        }))
                                      }
                                      className="flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/10 cursor-pointer transition"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {isExpanded ? (
                                          <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
                                        ) : (
                                          <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                                        )}
                                        {isExpanded ? (
                                          <FolderOpen
                                            className="w-4 h-4 shrink-0"
                                            style={{ color: `rgb(${palette.primaryRgb})` }}
                                          />
                                        ) : (
                                          <Folder
                                            className="w-4 h-4 shrink-0"
                                            style={{ color: `rgb(${palette.primaryRgb})` }}
                                          />
                                        )}
                                        {isEditing ? (
                                          <form
                                            onClick={(e) => e.stopPropagation()}
                                            onSubmit={(e) => {
                                              e.preventDefault();
                                              renamePlaylistFolder(folder.id, editingFolderName);
                                              setEditingFolderId(null);
                                            }}
                                            className="flex items-center gap-1 flex-1 min-w-0"
                                          >
                                            <input
                                              type="text"
                                              value={editingFolderName}
                                              onChange={(e) => setEditingFolderName(e.target.value)}
                                              className="flex-1 min-w-0 bg-black/35 border border-white/20 rounded-lg px-2 py-0.5 text-xs focus:outline-none"
                                              autoFocus
                                            />
                                            <button
                                              type="submit"
                                              className="p-1 rounded-lg bg-emerald-500/25 text-emerald-300"
                                            >
                                              <Check className="w-3 h-3" />
                                            </button>
                                          </form>
                                        ) : (
                                          <div className="min-w-0">
                                            <p className="text-xs font-bold truncate">{folder.name}</p>
                                            <p className="text-[10px] opacity-55">
                                              {folderPlaylists.length} playlist{folderPlaylists.length === 1 ? '' : 's'}
                                            </p>
                                          </div>
                                        )}
                                      </div>

                                      <div
                                        className="flex items-center gap-1 shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          onClick={() => {
                                            setEditingFolderId(folder.id);
                                            setEditingFolderName(folder.name);
                                          }}
                                          className="p-1 rounded-lg hover:bg-white/10 opacity-70 hover:opacity-100"
                                          title="Rename Folder"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            deletePlaylistFolder(folder.id);
                                            notify(`Deleted folder "${folder.name}" (playlists kept)`);
                                          }}
                                          className="p-1 rounded-lg hover:bg-red-500/20 text-red-300"
                                          title="Delete Folder (playlists are kept)"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {isExpanded && (
                                      <div className="px-2 pb-2 pt-1 border-t border-white/10 flex flex-col gap-1">
                                        {folderPlaylists.length === 0 ? (
                                          <p className="text-[11px] opacity-45 px-2 py-2 text-center">
                                            Empty folder — use the folder dropdown on any playlist to move it here.
                                          </p>
                                        ) : (
                                          folderPlaylists.map((pl) => renderPlaylistRow(pl, folder.id))
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}

                              {/* Render Uncategorized Playlists */}
                              {uncategorizedPlaylists.map((pl) => renderPlaylistRow(pl, null))}

                              {/* Public Playlists from other users — Add to Your Playlists */}
                              {publicPlaylists.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-white/10">
                                  <div className="flex items-center justify-between mb-2 px-1">
                                    <span className="text-[11px] uppercase tracking-wider font-bold opacity-65">
                                      Public Playlists
                                    </span>
                                    <span className="text-[10px] opacity-45">
                                      Add any to Your Playlists
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    {publicPlaylists.map((pl) => (
                                      <div
                                        key={`pub-lib-${pl.id}`}
                                        className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition"
                                      >
                                        <button
                                          onClick={() => selectPlaylist(pl.id)}
                                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                                        >
                                          <div
                                            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: `rgba(${palette.primaryRgb}, 0.22)` }}
                                          >
                                            <ListMusic className="w-4 h-4" />
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-xs font-semibold truncate">{pl.name}</p>
                                            <p className="text-[10px] opacity-55 truncate">
                                              {pl.songCount} tracks{pl.owner ? ` • by ${pl.owner}` : ''}
                                            </p>
                                          </div>
                                        </button>
                                        <button
                                          onClick={async () => {
                                            const ok = await copyPublicPlaylistToMine(pl.id);
                                            if (ok) {
                                              notify(`Added "${pl.name}" to Your Playlists!`);
                                            } else {
                                              notify(`Could not add "${pl.name}" to Your Playlists.`);
                                            }
                                          }}
                                          className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-semibold shrink-0 flex items-center gap-1 transition"
                                          title="Copy this public playlist into Your Playlists"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>Add to Mine</span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {activeView === 'library' && librarySection !== 'artists' && queueTab === 'offline' && (
                  /* OFFLINE DEVICE VAULT SORTED INTO PLAYLISTS ON PHONE/PC */
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white/5 p-3 rounded-2xl border border-white/10">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold flex items-center gap-1.5 truncate">
                          <HardDriveDownload
                            className="w-4 h-4 shrink-0"
                            style={{ color: `rgb(${palette.primaryRgb})` }}
                          />
                          <span className="truncate">
                            {selectedOfflinePlaylist === 'ALL'
                              ? `All Offline Songs (${offlineSongs.length})`
                              : `Offline Playlist: ${selectedOfflinePlaylist} (${filteredOfflineSongs.length})`}
                          </span>
                        </h4>
                        <p className="text-[11px] opacity-65 mt-0.5">
                          Sorted into playlists on your phone — works 100% offline in Airplane Mode.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        {selectedOfflinePlaylist !== 'ALL' && (
                          <button
                            onClick={() => {
                              deleteOfflinePlaylist(selectedOfflinePlaylist);
                              setSelectedOfflinePlaylist('ALL');
                            }}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30 flex items-center gap-1"
                            title="Delete Offline Playlist Folder"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Folder</span>
                          </button>
                        )}
                        {offlineSongs.length > 0 && (
                          <button
                            onClick={handleRemoveAllDownloads}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 flex items-center gap-1 transition"
                            title="Delete all offline downloaded songs from this device"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>
                              {confirmClearAllOffline
                                ? `Confirm Remove (${offlineSongs.length})?`
                                : 'Remove All Downloads'}
                            </span>
                          </button>
                        )}
                        {filteredOfflineSongs.length > 0 && (
                          <button
                            onClick={() =>
                              playSong(filteredOfflineSongs[0], filteredOfflineSongs)
                            }
                            style={dynamicAccentStyle}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0"
                          >
                            Play {selectedOfflinePlaylist === 'ALL' ? 'All' : 'Playlist'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Offline Playlist Folders / Filter Chips + Create Offline Playlist */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        <button
                          onClick={() => setSelectedOfflinePlaylist('ALL')}
                          style={selectedOfflinePlaylist === 'ALL' ? dynamicAccentStyle : undefined}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold shrink-0 transition ${
                            selectedOfflinePlaylist === 'ALL'
                              ? ''
                              : 'bg-white/10 opacity-75 hover:opacity-100'
                          }`}
                        >
                          All Tracks ({offlineSongs.length})
                        </button>
                        {offlinePlaylists.map((plName) => {
                          const count = offlineSongs.filter((s) =>
                            (offlineSongPlaylists[s.id] || []).includes(plName)
                          ).length;
                          const isSel = selectedOfflinePlaylist === plName;
                          return (
                            <button
                              key={plName}
                              onClick={() => setSelectedOfflinePlaylist(plName)}
                              style={isSel ? dynamicAccentStyle : undefined}
                              className={`px-3 py-1 rounded-xl text-xs font-semibold shrink-0 transition ${
                                isSel ? '' : 'bg-white/10 opacity-75 hover:opacity-100'
                              }`}
                            >
                              {plName} ({count})
                            </button>
                          );
                        })}
                      </div>

                      {/* Offline Search */}
                      <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 absolute left-3 opacity-60 pointer-events-none" />
                        <input
                          value={offlineSearchQuery}
                          onChange={(e) => setOfflineSearchQuery(e.target.value)}
                          placeholder={
                            selectedOfflinePlaylist === 'ALL'
                              ? 'Search offline songs...'
                              : `Search in "${selectedOfflinePlaylist}"...`
                          }
                          className="w-full pl-8 pr-8 py-2 rounded-xl bg-black/25 border border-white/15 text-xs focus:outline-none focus:border-white/40"
                        />
                        {offlineSearchQuery && (
                          <button
                            onClick={() => setOfflineSearchQuery('')}
                            className="absolute right-2.5 p-0.5 rounded-full hover:bg-white/15 opacity-70"
                            title="Clear search"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Create New Offline Playlist Bar */}
                      <div className="flex gap-2">
                        <input
                          value={newOfflinePlaylistName}
                          onChange={(e) => setNewOfflinePlaylistName(e.target.value)}
                          placeholder="Create offline playlist folder on phone..."
                          className="flex-1 px-3 py-1.5 rounded-xl bg-black/20 border border-white/15 text-xs focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            if (newOfflinePlaylistName.trim()) {
                              createOfflinePlaylist(newOfflinePlaylistName.trim());
                              setSelectedOfflinePlaylist(newOfflinePlaylistName.trim());
                              setNewOfflinePlaylistName('');
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 flex items-center gap-1 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" /> New Folder
                        </button>
                      </div>
                    </div>

                    {filteredOfflineSongs.length === 0 ? (
                      <div className="py-10 text-center opacity-55 text-xs space-y-1">
                        <HardDriveDownload className="w-7 h-7 mx-auto mb-2 opacity-60" />
                        <p className="font-semibold">
                          {selectedOfflinePlaylist === 'ALL'
                            ? 'No songs saved offline yet'
                            : `No songs in "${selectedOfflinePlaylist}" yet`}
                        </p>
                        <p className="text-[11px] opacity-75">
                          Tap "Offline All" on any Playlist or use the folder icon on any offline track to sort it into "{selectedOfflinePlaylist}".
                        </p>
                      </div>
                    ) : (
                      filteredOfflineSongs.map((song) => {
                        const songPls = offlineSongPlaylists[song.id] || [];
                        return (
                          <div
                            key={song.id}
                            className="relative flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/10 transition"
                          >
                            <div
                              onClick={() => playSong(song)}
                              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                            >
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-black/30 shrink-0 border border-white/10 flex items-center justify-center">
                                {offlineCoverUrls[song.id] ? (
                                  <img
                                    src={offlineCoverUrls[song.id]}
                                    alt={song.title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Disc3 className="w-4 h-4 opacity-50" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate">{song.title}</p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] opacity-60 truncate">
                                    {song.artist} • {formatTime(song.duration)}
                                  </span>
                                  {songPls.map((p) => (
                                    <span
                                      key={p}
                                      className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/10 opacity-80"
                                    >
                                      {p}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  addToQueue(song);
                                  notify(`Added "${song.title}" to queue`);
                                }}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-xs text-white/75 hover:text-white"
                                title="Add to Queue"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setOfflineDropdownSongId(
                                    offlineDropdownSongId === song.id ? null : song.id
                                  )
                                }
                                className="p-1.5 rounded-lg hover:bg-white/10 text-xs"
                                title="Assign to Offline Playlist"
                              >
                                <FolderPlus
                                  className="w-3.5 h-3.5"
                                  style={{ color: `rgb(${palette.primaryRgb})` }}
                                />
                              </button>
                              <button
                                onClick={() => {
                                  if (selectedOfflinePlaylist !== 'ALL') {
                                    removeSongFromOfflinePlaylist(
                                      song.id,
                                      selectedOfflinePlaylist
                                    );
                                    notify(
                                      `Removed "${song.title}" from ${selectedOfflinePlaylist}`
                                    );
                                  } else {
                                    removeOfflineSong(song.id);
                                    notify(`Removed "${song.title}" from offline storage`);
                                  }
                                }}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-300"
                                title={
                                  selectedOfflinePlaylist !== 'ALL'
                                    ? `Remove from ${selectedOfflinePlaylist}`
                                    : 'Delete from offline storage'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {offlineDropdownSongId === song.id && (
                              <div
                                className={`absolute right-2 top-11 z-30 p-2 rounded-xl shadow-xl min-w-[170px] ${glassClass}`}
                              >
                                <p className="text-[10px] uppercase opacity-60 px-2 pb-1">
                                  Offline Playlists
                                </p>
                                {offlinePlaylists.length === 0 ? (
                                  <p className="text-xs px-2 py-1 opacity-60">
                                    Create a folder above first
                                  </p>
                                ) : (
                                  offlinePlaylists.map((plName) => {
                                    const inPl = songPls.includes(plName);
                                    return (
                                      <button
                                        key={plName}
                                        onClick={() => {
                                          if (inPl) {
                                            removeSongFromOfflinePlaylist(song.id, plName);
                                          } else {
                                            assignSongToOfflinePlaylist(song.id, plName);
                                          }
                                          setOfflineDropdownSongId(null);
                                        }}
                                        className="w-full flex items-center justify-between text-left text-xs px-2 py-1 rounded-lg hover:bg-white/15"
                                      >
                                        <span className="truncate">{plName}</span>
                                        {inPl && <Check className="w-3 h-3 text-emerald-400" />}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {activeView === 'add' && (
                  <div className="flex flex-col gap-3">
                    {/* Platform Provider Selector */}
                    <div className="flex items-center gap-1.5 bg-black/25 p-1 rounded-xl">
                      {(
                        [
                          { id: 'spotify', label: 'Spotify Songs & Playlists' },
                          { id: 'soundcloud', label: 'SoundCloud & Sets' },
                          { id: 'youtube', label: 'YouTube & Playlists' },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setDiscoverSource(p.id);
                            if (discoverQuery.trim()) {
                              handleDiscoverSearch(undefined, p.id);
                            }
                          }}
                          style={discoverSource === p.id ? dynamicAccentStyle : undefined}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                            discoverSource === p.id ? '' : 'opacity-65 hover:opacity-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {/* Search or Direct Song / Full Playlist URL Input */}
                    <form onSubmit={handleDiscoverSearch} className="flex gap-2">
                      <input
                        value={discoverQuery}
                        onChange={(e) => setDiscoverQuery(e.target.value)}
                        placeholder="Search any song OR paste a Spotify / SoundCloud / YouTube playlist link..."
                        className="flex-1 px-3.5 py-2 rounded-xl bg-black/25 border border-white/15 text-xs focus:outline-none focus:border-white/40"
                      />
                      <button
                        type="submit"
                        disabled={discoverLoading}
                        style={dynamicAccentStyle}
                        className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0"
                      >
                        {discoverLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        <span>Search</span>
                      </button>
                    </form>

                    {/* FULL PLAYLIST BULK IMPORTER BANNER */}
                    {discoverResults.length > 1 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-white/5 border border-white/15">
                        <div className="min-w-0 flex-1">
                          <input
                            value={discoverPlaylistName}
                            onChange={(e) => setDiscoverPlaylistName(e.target.value)}
                            placeholder="Playlist Name in Navidrome..."
                            className="bg-transparent text-xs font-bold focus:outline-none border-b border-white/20 pb-0.5 w-full"
                          />
                          <p className="text-[10px] opacity-65 mt-0.5">
                            {discoverIsPlaylist
                              ? `Detected full playlist (${discoverResults.length} tracks)`
                              : `Bulk import all ${discoverResults.length} results as a Navidrome playlist`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {discoverResults.some((r) => importedIds[r.id]) && (
                            <button
                              onClick={handlePlayAllDownloadedImports}
                              className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 transition"
                              title="Play all tracks that have finished downloading so far"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>
                                Play Downloaded (
                                {discoverResults.filter((r) => importedIds[r.id]).length})
                              </span>
                            </button>
                          )}

                          <button
                            onClick={handleBulkImportPlaylist}
                            disabled={Boolean(bulkImportProgress)}
                            style={dynamicAccentStyle}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0"
                          >
                            {bulkImportProgress ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>
                                  Importing {bulkImportProgress.done}/{bulkImportProgress.total}...
                                </span>
                              </>
                            ) : (
                              <>
                                <FolderPlus className="w-3.5 h-3.5" />
                                <span>Import Full Playlist ({discoverResults.length})</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Results List */}
                    <div className="space-y-2 mt-1">
                      {discoverLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-2 opacity-70 text-xs">
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span>Searching {discoverSource}...</span>
                        </div>
                      ) : discoverResults.length === 0 ? (
                        <div className="py-10 text-center opacity-55 text-xs space-y-1">
                          <Compass className="w-7 h-7 mx-auto mb-2 opacity-60" />
                          <p className="font-semibold">
                            Search any song OR paste a full Spotify / SoundCloud / YouTube Playlist URL
                          </p>
                          <p className="text-[11px] opacity-75">
                            Import individual songs or entire playlists in 320kbps MP3 with embedded cover art & automatic Navidrome playlist creation.
                          </p>
                        </div>
                      ) : (
                        discoverResults.map((item) => {
                          const isImporting = Boolean(importingIds[item.id]);
                          const isImported = Boolean(importedIds[item.id]);
                          return (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-11 h-11 rounded-xl overflow-hidden bg-black/40 shrink-0 border border-white/10 flex items-center justify-center">
                                  {item.artworkUrl ? (
                                    <img
                                      src={item.artworkUrl}
                                      alt={item.title}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Disc3 className="w-5 h-5 opacity-40" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold truncate flex items-center gap-1.5">
                                    <span className="truncate">{item.title}</span>
                                    {item.isExplicit && (
                                      <span
                                        className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-white/20 text-white font-sans shrink-0 uppercase tracking-wider"
                                        title="Explicit Track"
                                      >
                                        E
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] opacity-70 truncate">
                                    {item.artist}
                                    {item.album ? ` • ${item.album}` : ''}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] opacity-55 font-mono">
                                    <span className="uppercase">{item.source}</span>
                                    {item.duration > 0 && <span>• {formatTime(item.duration)}</span>}
                                    {item.releaseYear && <span>• {item.releaseYear}</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handlePlayImportedTrack(item)}
                                  disabled={isImporting}
                                  style={isImported ? dynamicAccentStyle : undefined}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                                    isImported
                                      ? 'hover:scale-105 active:scale-95'
                                      : 'bg-white/10 hover:bg-white/20 text-white'
                                  }`}
                                  title={
                                    isImported
                                      ? 'Play this downloaded track immediately'
                                      : 'Download & play this track immediately'
                                  }
                                >
                                  {isImporting ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                  )}
                                  <span>Play</span>
                                </button>

                                <button
                                  onClick={() => handleImportTrack(item)}
                                  disabled={isImporting || isImported}
                                  style={!isImported && !isImporting ? dynamicAccentStyle : undefined}
                                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition ${
                                    isImported
                                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                                      : isImporting
                                      ? 'bg-white/10 opacity-75'
                                      : 'hover:scale-105 active:scale-95'
                                  }`}
                                >
                                  {isImporting ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>Adding...</span>
                                    </>
                                  ) : isImported ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Added</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3.5 h-3.5" />
                                      <span>Add</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}

                      {/* Load More Songs Button */}
                      {discoverResults.length > 0 && discoverHasMore && !discoverIsPlaylist && (
                        <div className="pt-2 pb-1 flex justify-center">
                          <button
                            type="button"
                            disabled={discoverLoadingMore}
                            onClick={() => handleDiscoverSearch(undefined, discoverSource, discoverQuery, true)}
                            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
                          >
                            {discoverLoadingMore ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Loading more songs...</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Load More Songs</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </main>

      {/* 3. UNIFIED BOTTOM NAVIGATION: Home, Lyrics, Library, Add, Queue */}
      <footer className="relative z-20 flex justify-center w-full">
        <nav
          className={`liquid-dock-nav flex items-center justify-between sm:justify-center w-full sm:w-auto gap-0.5 sm:gap-2 px-1.5 py-1.5 sm:px-3 sm:py-2 shadow-2xl ${glassClass}`}
        >
          {(() => {
            const currentDockKey =
              activeView === 'home'
                ? 'home'
                : activeView === 'lyrics'
                ? 'lyrics'
                : activeView === 'library'
                ? 'library'
                : activeView === 'add'
                ? 'add'
                : activeView === 'queue'
                ? 'queue'
                : 'home';

            const dockItems = [
              {
                id: 'home',
                label: 'Home',
                icon: Home,
                onClick: () => setActiveView('home'),
              },
              {
                id: 'lyrics',
                label: 'Lyrics',
                icon: Mic2,
                onClick: () => setActiveView('lyrics'),
              },
              {
                id: 'library',
                label: 'Library',
                icon: Library,
                onClick: () => {
                  setActiveView('library');
                  setSelectedArtistName(null);
                  if (librarySection === 'overview' || librarySection === 'offline') {
                    setLibrarySection('offline');
                    setQueueTab('offline');
                  } else if (librarySection === 'liked') {
                    setQueueTab('liked');
                  } else if (librarySection === 'playlists') {
                    setQueueTab('playlists');
                  }
                },
              },
              {
                id: 'add',
                label: 'Add',
                icon: Compass,
                onClick: () => {
                  setActiveView('add');
                  setQueueTab('discover');
                },
              },
              {
                id: 'queue',
                label: 'Queue',
                icon: ListMusic,
                onClick: () => {
                  setActiveView('queue');
                  setQueueTab('queue');
                },
              },
            ];

            return dockItems.map((item) => {
              const isActive = currentDockKey === item.id;
              const IconComp = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.onClick}
                  className={`liquid-dock-item relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 flex-1 sm:flex-initial py-1.5 px-2 sm:px-3.5 sm:py-1.5 text-[10px] sm:text-xs font-semibold rounded-full transition-colors duration-200 select-none ${
                    isActive ? 'text-white' : 'opacity-70 hover:opacity-100 text-white'
                  }`}
                >
                  {isActive && (
                    <div
                      className="absolute inset-0 rounded-full transition-colors duration-200"
                      style={dockActiveAccentStyle}
                    />
                  )}
                  <span className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5">
                    <IconComp className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                </button>
              );
            });
          })()}
        </nav>
      </footer>

      {/* EQUALIZER, 808 BASS BOOST, SLOWED/SPEED & SEAMLESS CROSSFADE STUDIO MODAL */}
      <AnimatePresence>
        {eqModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEqModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-lg rounded-3xl p-6 space-y-5 shadow-2xl max-h-[88vh] overflow-y-auto ${glassClass}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <Sliders
                      className="w-4 h-4"
                      style={{ color: `rgb(${palette.primaryRgb})` }}
                    />
                    <span>Equalizer, Bass & Crossfade Studio</span>
                  </h2>
                  <p className="text-xs opacity-60">
                    6-Band Biquad EQ • 808 Sub-Bass Booster • DJ Beat-Mix Crossfade
                  </p>
                </div>
                <button
                  onClick={() => setEqModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* EQ Presets */}
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase opacity-65 font-semibold">
                  Sound Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(EQ_PRESETS).map((name) => (
                    <button
                      key={name}
                      onClick={() => applyEqPreset(name)}
                      style={eqPreset === name ? dynamicAccentStyle : undefined}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                        eqPreset === name ? '' : 'bg-white/10 opacity-75 hover:opacity-100'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6-Band Graphic EQ Sliders */}
              <div className="grid grid-cols-6 gap-2 pt-2 pb-1 px-2 rounded-2xl bg-black/25 border border-white/10">
                {EQ_LABELS.map((label, idx) => {
                  const val = eqBands[idx] || 0;
                  return (
                    <div key={label} className="flex flex-col items-center gap-2">
                      <span className="text-[10px] font-mono opacity-80">
                        {val > 0 ? `+${val}` : val}dB
                      </span>
                      <div className="h-28 flex items-center justify-center">
                        <input
                          type="range"
                          min={-12}
                          max={15}
                          step={1}
                          value={val}
                          onChange={(e) => setEqBand(idx, parseFloat(e.target.value))}
                          className="w-24 h-1.5 -rotate-90 rounded-lg appearance-none cursor-pointer bg-white/20"
                          style={{ accentColor: `rgb(${palette.primaryRgb})` }}
                        />
                      </div>
                      <span className="text-[10px] font-semibold opacity-65">{label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Dedicated 808 Sub-Bass Boost & Seamless Crossfade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>808 Sub-Bass Boost</span>
                    <span style={{ color: `rgb(${palette.primaryRgb})` }}>
                      +{bassBoost} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={1}
                    value={bassBoost}
                    onChange={(e) => setBassBoost(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/20"
                    style={{ accentColor: `rgb(${palette.primaryRgb})` }}
                  />
                  <p className="text-[10px] opacity-55">
                    Enhances deep 60Hz sub-bass & 170Hz punch
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>DJ Stem-Mix Crossfade</span>
                    <span style={{ color: `rgb(${palette.primaryRgb})` }}>
                      {crossfadeSeconds === 0 ? 'Off' : `${crossfadeSeconds}s DJ Mix`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={1}
                    value={crossfadeSeconds}
                    onChange={(e) => setCrossfadeSeconds(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/20"
                    style={{ accentColor: `rgb(${palette.primaryRgb})` }}
                  />
                  <p className="text-[10px] opacity-55">
                    EQ-blends beats with midpoint bass-swap transition
                  </p>
                </div>
              </div>

              {/* Playback Speed / Slowed + Pitch Mode */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" />
                    <span>Speed / Slowed Mode ({playbackRate.toFixed(2)}x)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPlaybackRate(0.86)}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20"
                    >
                      0.86x Slowed
                    </button>
                    <button
                      onClick={() => setPlaybackRate(1.0)}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20"
                    >
                      1.0x Normal
                    </button>
                    <button
                      onClick={() => setPreservePitch(!preservePitch)}
                      className={`text-[10px] px-2 py-0.5 rounded border ${
                        !preservePitch
                          ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                          : 'bg-white/5 border-white/15 opacity-70'
                      }`}
                    >
                      {!preservePitch ? 'Vinyl Pitch Shift ON' : 'Pitch Locked'}
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.25}
                  step={0.01}
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-white/20"
                  style={{ accentColor: `rgb(${palette.primaryRgb})` }}
                />
              </div>

              {/* Permanent UI Theme Style (Default: Liquid Glass vs Spotify UI) & Color Mode */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] uppercase opacity-75 font-semibold flex items-center gap-1.5">
                    <PaletteIcon
                      className="w-3.5 h-3.5"
                      style={{ color: `rgb(${palette.primaryRgb})` }}
                    />
                    <span>Permanent UI Theme & Layout Style</span>
                  </label>
                  <span className="text-[10px] opacity-60">Saved permanently</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'liquid',
                        label: 'Liquid Glass (Default)',
                        desc: 'Frosted glass & 3D album color mesh',
                      },
                      {
                        id: 'space',
                        label: 'Meteor Shower / Space',
                        desc: 'Twinkling stars & audio-reactive meteors',
                      },
                    ] as { id: UiStyleMode; label: string; desc: string }[]
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setUiStyle(st.id)}
                      style={uiStyle === st.id ? dynamicAccentStyle : undefined}
                      className={`p-2.5 rounded-xl text-left transition border ${
                        uiStyle === st.id
                          ? 'border-white/30'
                          : 'bg-white/5 border-white/10 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <p className="text-xs font-bold">{st.label}</p>
                      <p className="text-[10px] opacity-75 mt-0.5">{st.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Visualizer Style Picker */}
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase opacity-65 font-semibold">
                  Visualizer Style (6 Options)
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {(
                    [
                      { id: 'spectrum', label: 'Bars' },
                      { id: 'waveform', label: 'Wave' },
                      { id: 'mirror', label: 'Mirror' },
                      { id: 'orb', label: 'Orb Halo' },
                      { id: 'particles', label: 'Galaxy' },
                      { id: 'off', label: 'Off' },
                    ] as { id: VisualizerMode; label: string }[]
                  ).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVisualizerMode(v.id)}
                      style={visualizerMode === v.id ? dynamicAccentStyle : undefined}
                      className={`py-1.5 rounded-xl text-xs font-semibold transition ${
                        visualizerMode === v.id
                          ? ''
                          : 'bg-white/10 opacity-75 hover:opacity-100'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bar Visualizer Main Energy Alignment Option (Middle / Left Side / Right Side) */}
              {(visualizerMode === 'spectrum' || visualizerMode === 'mirror') && (
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase opacity-65 font-semibold">
                    Bar Visualizer Main Position
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'center', label: 'Main in Middle' },
                        { id: 'left', label: 'Left Side' },
                        { id: 'right', label: 'Right Side' },
                      ] as { id: VisualizerBarAlign; label: string }[]
                    ).map((pos) => (
                      <button
                        key={pos.id}
                        onClick={() => setVisualizerBarAlign(pos.id)}
                        style={visualizerBarAlign === pos.id ? dynamicAccentStyle : undefined}
                        className={`py-1.5 rounded-xl text-xs font-semibold transition ${
                          visualizerBarAlign === pos.id
                            ? ''
                            : 'bg-white/10 opacity-75 hover:opacity-100'
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FILEBROWSER PUBLIC SHARE LINK MODAL */}
      <AnimatePresence>
        {shareModalData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShareModalData(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl ${glassClass}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Share2
                      className="w-4 h-4"
                      style={{ color: `rgb(${palette.primaryRgb})` }}
                    />
                    <span>Share Track via LiquidPlayer</span>
                  </h3>
                  <p className="text-xs opacity-65">
                    {shareModalData.title} • {shareModalData.artist}
                  </p>
                </div>
                <button
                  onClick={() => setShareModalData(null)}
                  className="p-1.5 rounded-xl hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {/* Configurable Link Expiration (Default: 1 Hour) */}
                <div className="p-3 rounded-2xl bg-black/30 border border-white/15 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">Link Expiration</p>
                      <p className="text-[10px] opacity-65 truncate">
                        {shareModalData.expiresText
                          ? `Valid for: ${shareModalData.expiresText}`
                          : 'Default: 1 hour'}
                        {shareModalData.expire && shareModalData.expire > 0
                          ? ` (until ${new Date(
                              shareModalData.expire * 1000
                            ).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })})`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      value={shareExpires}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setShareExpires(nextVal);
                        handleShare(null, nextVal);
                      }}
                      className="bg-black/60 border border-white/20 rounded-xl px-2.5 py-1 text-xs focus:outline-none cursor-pointer text-white"
                    >
                      <option value="1h">1 Hour (Default)</option>
                      <option value="6h">6 Hours</option>
                      <option value="24h">24 Hours (1 Day)</option>
                      <option value="7d">7 Days</option>
                      <option value="30d">30 Days</option>
                      <option value="never">Never (Permanent)</option>
                    </select>
                    {shareLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-black/30 border border-white/15 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase opacity-60 font-semibold">
                      LiquidPlayer Song Link
                    </label>
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Plays in LiquidPlayer
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={shareModalData.shareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                      className="flex-1 bg-transparent text-xs font-mono focus:outline-none truncate select-all cursor-text py-1 text-white"
                    />
                    <button
                      onClick={async () => {
                        const ok = await copyToClipboardSafe(shareModalData.shareUrl);
                        notify(ok ? 'Copied LiquidPlayer link!' : 'Tap & hold link above to copy');
                      }}
                      style={dynamicAccentStyle}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                  <p className="text-[10px] opacity-60">
                    Takes the recipient directly to this song on LiquidPlayer with animated cover & lyrics.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-black/30 border border-white/15 space-y-1.5">
                  <label className="text-[10px] uppercase opacity-60 font-semibold">
                    Direct Audio Download Link
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={shareModalData.downloadUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                      className="flex-1 bg-transparent text-xs font-mono focus:outline-none truncate select-all cursor-text py-1"
                    />
                    <button
                      onClick={async () => {
                        const ok = await copyToClipboardSafe(shareModalData.downloadUrl);
                        notify(ok ? 'Copied direct download link!' : 'Tap & hold link above to copy');
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 flex items-center gap-1 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center gap-2 pt-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <a
                    href={shareModalData.shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs flex items-center gap-1.5 opacity-80 hover:opacity-100 underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </a>
                  {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                    <button
                      onClick={async () => {
                        try {
                          await navigator.share({
                            title: `${shareModalData.title} - ${shareModalData.artist}`,
                            text: `Listen to "${shareModalData.title}" by ${shareModalData.artist}`,
                            url: shareModalData.shareUrl,
                          });
                        } catch {}
                      }}
                      className="text-xs px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 flex items-center gap-1 transition"
                    >
                      <Share2 className="w-3 h-3" /> System Share
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShareModalData(null)}
                  className="px-4 py-1.5 rounded-xl text-xs bg-white/10 hover:bg-white/20"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LIVE LISTENERS & LISTEN ALONG MODAL */}
      <AnimatePresence>
        {listenAlongModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setListenAlongModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-3xl p-5 space-y-4 shadow-2xl max-h-[80vh] flex flex-col ${glassClass}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Headphones className="w-4 h-4" style={{ color: `rgb(${palette.primaryRgb})` }} />
                  Live Listeners
                </h3>
                <button
                  onClick={() => setListenAlongModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Listener Display Name & Privacy choice */}
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                <label className="block text-[10px] uppercase opacity-65 font-semibold">
                  Your Display Name in Live Listeners
                </label>
                <input
                  type="text"
                  value={listenerDisplayName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setListenerDisplayName(val);
                    try {
                      localStorage.setItem('liquid_listener_display_name', val);
                    } catch {}
                  }}
                  placeholder={username || 'Enter your display nickname...'}
                  className="w-full px-3 py-1.5 rounded-xl bg-black/30 border border-white/15 text-xs focus:outline-none focus:border-white/35"
                />
              </div>

              <button
                onClick={() => setAllowListenAlong(!allowListenAlong)}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 text-left"
              >
                <div>
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    {allowListenAlong ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    Allow others to Listen Along
                  </p>
                  <p className="text-[11px] opacity-60">
                    {allowListenAlong
                      ? 'Other users can join and hear what you play in sync'
                      : 'Nobody can join your session'}
                  </p>
                </div>
                <span
                  className={`w-10 h-5 rounded-full relative transition ${
                    allowListenAlong ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                      allowListenAlong ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>

              {listeningAlongTo && (
                <div className="flex items-center justify-between p-3 rounded-2xl border border-white/15" style={{ backgroundColor: `rgba(${palette.primaryRgb}, 0.15)` }}>
                  <p className="text-xs font-semibold">
                    Listening along with{' '}
                    {activeListeners.find(
                      (s) =>
                        s.sessionId.toLowerCase() === listeningAlongTo.toLowerCase() ||
                        s.username.toLowerCase() === listeningAlongTo.toLowerCase()
                    )?.username || listeningAlongTo}
                  </p>
                  <button
                    onClick={() => {
                      setListeningAlongTo(null);
                      notify('Stopped listening along');
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] bg-red-500/25 text-red-200 hover:bg-red-500/35"
                  >
                    Leave
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {activeListeners.filter((s) => s.sessionId !== clientSessionId).length === 0 ? (
                  <p className="text-xs opacity-55 text-center py-8">
                    Nobody else is listening right now. Play a song on another device or account to see them here!
                  </p>
                ) : (
                  activeListeners
                    .filter((s) => s.sessionId !== clientSessionId)
                    .map((s) => {
                      const isHost =
                        listeningAlongTo?.toLowerCase() === s.sessionId.toLowerCase() ||
                        listeningAlongTo?.toLowerCase() === s.username.toLowerCase();
                      const thumb =
                        s.directCoverUrl ||
                        (s.coverArt &&
                        (s.coverArt.startsWith('http://') ||
                          s.coverArt.startsWith('https://') ||
                          s.coverArt.startsWith('/api/'))
                          ? s.coverArt
                          : client && !s.songId.startsWith('local:') && !s.songId.startsWith('imported-')
                          ? client.getCoverArtUrl(s.coverArt || s.songId, 100)
                          : `/api/discover/cover?id=${encodeURIComponent(
                              s.songId
                            )}&title=${encodeURIComponent(s.title)}&artist=${encodeURIComponent(
                              s.artist
                            )}`);
                      return (
                        <div
                          key={s.sessionId || s.username}
                          className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.04] border border-white/10"
                        >
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
                            {thumb ? (
                              <img src={thumb} alt={s.title} className="w-full h-full object-cover" />
                            ) : (
                              <Disc3 className="w-4 h-4 opacity-40" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate flex items-center gap-1.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  s.isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'
                                }`}
                              />
                              {s.username}
                              {s.listeners.length > 0 && (
                                <span className="text-[10px] opacity-60 font-normal">
                                  +{s.listeners.length} listening
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] opacity-75 truncate">
                              {s.title} • {s.artist}
                            </p>
                            <p className="text-[10px] opacity-50 font-mono">
                              {formatTime(s.currentTime)} / {formatTime(s.duration)}
                            </p>
                          </div>
                          {s.allowJoin ? (
                            <button
                              onClick={() => {
                                if (isHost) {
                                  setListeningAlongTo(null);
                                  notify(`Left ${s.username}'s session`);
                                } else {
                                  joinListenAlongSession(s);
                                  notify(`Listening along with ${s.username}!`);
                                }
                              }}
                              style={isHost ? undefined : dynamicAccentStyle}
                              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold shrink-0 ${
                                isHost ? 'bg-red-500/25 text-red-200' : ''
                              }`}
                            >
                              {isHost ? 'Leave' : 'Listen Along'}
                            </button>
                          ) : (
                            <span className="text-[10px] opacity-50 flex items-center gap-1 shrink-0">
                              <EyeOff className="w-3 h-3" /> Private
                            </span>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PRIVACY-SAFE DISCORD RICH PRESENCE MODAL */}
      <AnimatePresence>
        {discordModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDiscordModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-3xl p-5 space-y-4 shadow-2xl ${glassClass}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-indigo-300" /> Discord Rich Presence
                </h3>
                <button onClick={() => setDiscordModalOpen(false)} className="p-1.5 rounded-xl hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Live preview */}
              <div className="p-3 rounded-2xl bg-[#232428] text-white space-y-2">
                <p className="text-[10px] uppercase font-bold opacity-70">Listening to LiquidPlayer</p>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/40 shrink-0 flex items-center justify-center">
                    {discordPublicArtwork || coverUrl ? (
                      <img src={discordPublicArtwork || coverUrl || ''} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Disc3 className="w-6 h-6 opacity-40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{currentSong?.title || 'Nothing playing'}</p>
                    <p className="text-xs opacity-75 truncate">by {currentSong?.artist || '—'}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] font-mono opacity-70">{formatTime(currentTime)}</span>
                      <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full bg-white" style={{ width: `${seekPercent}%` }} />
                      </div>
                      <span className="text-[10px] font-mono opacity-70">{formatTime(totalDuration)}</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] opacity-50">No buttons • No links • No server address</p>
              </div>

              <button
                onClick={() => setDiscordRpcEnabled(!discordRpcEnabled)}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10"
              >
                <span className="text-xs font-semibold">Show my music on Discord</span>
                <span className={`w-10 h-5 rounded-full relative transition ${discordRpcEnabled ? 'bg-indigo-500' : 'bg-white/20'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${discordRpcEnabled ? 'left-5' : 'left-0.5'}`} />
                </span>
              </button>

              {discordRpcEnabled && (
                <p
                  className={`text-[11px] ${
                    discordBridgeStatus === 'connected' ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {discordBridgeStatus === 'connected'
                    ? '● Bridge connected — your status is live on Discord'
                    : '● Bridge not running — download and start it below (Discord desktop must be open)'}
                </p>
              )}

              <div className="p-3 rounded-2xl bg-black/25 border border-white/10 space-y-2.5 text-[11px]">
                <p className="font-semibold flex items-center justify-between">
                  <span>1-Click PC Auto-Run Setup</span>
                  <span className="text-[10px] text-emerald-300 font-mono">Zero Installs • Auto-Run</span>
                </p>
                <p className="opacity-80 text-[11px] leading-relaxed">
                  Click <span className="font-semibold text-white">Download & Run</span> below, then click the downloaded file in your browser's download shelf or folder. It starts the bridge automatically—no terminal commands or typing needed!
                </p>

                {/* Main 1-Click Auto Run Button */}
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/discord-rpc/bridge-script?format=bat&username=${encodeURIComponent(
                      (username || 'guest').trim().toLowerCase() || 'guest'
                    )}&server_url=${encodeURIComponent(
                      typeof window !== 'undefined'
                        ? window.location.origin
                        : 'https://your-liquid-audio-domain.com'
                    )}`}
                    download="LiquidPlayer-Discord-RPC.bat"
                    style={dynamicAccentStyle}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-lg hover:scale-105 active:scale-95 transition"
                  >
                    <Download className="w-4 h-4" /> Download & Run (Windows .bat)
                  </a>

                  <a
                    href={`/api/discord-rpc/bridge-script?format=command&username=${encodeURIComponent(
                      (username || 'guest').trim().toLowerCase() || 'guest'
                    )}&server_url=${encodeURIComponent(
                      typeof window !== 'undefined'
                        ? window.location.origin
                        : 'https://your-liquid-audio-domain.com'
                    )}`}
                    download="LiquidPlayer-Discord-RPC.command"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 transition"
                  >
                    <Download className="w-3.5 h-3.5" /> Mac (.command)
                  </a>

                  <a
                    href={`/api/discord-rpc/bridge-script?format=py&username=${encodeURIComponent(
                      (username || 'guest').trim().toLowerCase() || 'guest'
                    )}&server_url=${encodeURIComponent(
                      typeof window !== 'undefined'
                        ? window.location.origin
                        : 'https://your-liquid-audio-domain.com'
                    )}`}
                    download="LiquidPlayer-Discord-RPC.py"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs opacity-75 hover:opacity-100 transition"
                  >
                    <Download className="w-3.5 h-3.5" /> Python (.py)
                  </a>
                </div>

                <p className="text-[10px] opacity-60">
                  Tip: Keep Discord Desktop running on your PC. Once launched, this screen will instantly turn green!
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SHAREABLE LIQUID WRAPPED STORY CARD MODAL */}
      <AnimatePresence>
        {wrappedCardModalOpen && wrappedCardUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setWrappedCardModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-sm rounded-3xl p-4 space-y-3 shadow-2xl ${glassClass}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Your Liquid Wrapped • @{username || 'guest'}</h3>
                <button onClick={() => setWrappedCardModalOpen(false)} className="p-1.5 rounded-xl hover:bg-white/10">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <img
                src={wrappedCardUrl}
                alt="Liquid Wrapped story card"
                className="w-full max-h-[60vh] object-contain rounded-2xl border border-white/10"
              />
              <div className="flex gap-2">
                <a
                  href={wrappedCardUrl}
                  download={`liquid-wrapped-${username || 'guest'}.png`}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Save PNG
                </a>
                <button
                  onClick={async () => {
                    try {
                      const blob = await (await fetch(wrappedCardUrl)).blob();
                      const file = new File([blob], `liquid-wrapped-${username || 'guest'}.png`, {
                        type: 'image/png',
                      });
                      const nav = navigator as any;
                      if (nav.canShare && nav.canShare({ files: [file] })) {
                        await nav.share({ files: [file], title: 'My Liquid Wrapped' });
                      } else if ((window as any).ClipboardItem && navigator.clipboard?.write) {
                        await navigator.clipboard.write([
                          new (window as any).ClipboardItem({ 'image/png': blob }),
                        ]);
                        notify('Wrapped card copied to clipboard!');
                      } else {
                        notify('Use "Save PNG" to share your card');
                      }
                    } catch {
                      // user cancelled share sheet
                    }
                  }}
                  style={dynamicAccentStyle}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* INSTANT SPOTLIGHT SEARCH MODAL FOR EXISTING SONGS (Ctrl+K) */}
      <AnimatePresence>
        {spotlightOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSpotlightOpen(false)}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 backdrop-blur-md pt-16 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: -10 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-xl rounded-3xl p-4 shadow-2xl flex flex-col max-h-[75vh] ${glassClass}`}
            >
              <div className="flex items-center gap-3 pb-3 border-b border-white/15">
                <Search
                  className="w-5 h-5 shrink-0"
                  style={{ color: `rgb(${palette.primaryRgb})` }}
                />
                <input
                  value={spotlightQuery}
                  onChange={(e) => setSpotlightQuery(e.target.value)}
                  placeholder="Instant search across all your songs, artists, albums..."
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                  autoFocus
                />
                {spotlightQuery && (
                  <button
                    onClick={() => setSpotlightQuery('')}
                    className="p-1 rounded-lg hover:bg-white/10 opacity-70"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setSpotlightOpen(false)}
                  className="px-2 py-1 rounded-lg bg-white/10 text-[10px] font-mono opacity-75 hover:opacity-100"
                >
                  ESC
                </button>
              </div>

              <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1">
                {/* Matching Artists in Search */}
                {spotlightMatchingArtists.length > 0 && (
                  <div className="space-y-1.5 pb-2 border-b border-white/10">
                    <p className="text-[10px] uppercase tracking-wider font-bold opacity-55 px-1">
                      Artists
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {spotlightMatchingArtists.map((artist) => {
                        const thumb = getSongThumbUrl(artist.sampleSong);
                        return (
                          <button
                            key={`spot-artist-${artist.name}`}
                            onClick={() => openArtistPage(artist.name)}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold transition"
                          >
                            <div className="w-5 h-5 rounded-full overflow-hidden bg-black/30 shrink-0 flex items-center justify-center">
                              {thumb ? (
                                <img src={thumb} alt={artist.name} className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-3 h-3 opacity-70" />
                              )}
                            </div>
                            <span className="truncate max-w-[140px]">{artist.name}</span>
                            <span className="text-[10px] opacity-60">({artist.songs.length})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {spotlightResults.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <p className="text-xs opacity-65">
                      No existing songs match "{spotlightQuery}".
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        onClick={async () => {
                          setSpotlightOpen(false);
                          await handleResyncAllSongs();
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Resync Server Library</span>
                      </button>
                      <button
                        onClick={() => {
                          const q = spotlightQuery;
                          setSpotlightOpen(false);
                          setActiveView('add');
                          setQueueTab('discover');
                          setDiscoverQuery(q);
                          handleDiscoverSearch(undefined, discoverSource, q);
                        }}
                        style={dynamicAccentStyle}
                        className="px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Compass className="w-4 h-4" />
                        <span>Find & Add "{spotlightQuery}" from Spotify / SoundCloud</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  spotlightResults.map((song) => {
                    const thumbUrl = getSongThumbUrl(song);
                    const isDownloaded = Boolean(downloadedSongIds[song.id]);
                    return (
                      <div
                        key={song.id}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-white/10 transition group"
                      >
                        <div
                          onClick={() => {
                            playSong(song);
                            setSpotlightOpen(false);
                          }}
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                        >
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-black/30 border border-white/10 shrink-0 flex items-center justify-center">
                            {thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt={song.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Disc3 className="w-5 h-5 opacity-40" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate flex items-center gap-1.5">
                              <span className="truncate">{song.title}</span>
                              {isDownloaded && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                                  Offline
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] opacity-65 truncate">
                              {song.artist} • {formatTime(song.duration)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              playSong(song);
                              setSpotlightOpen(false);
                            }}
                            style={dynamicAccentStyle}
                            className="px-2.5 py-1 rounded-xl text-[11px] font-semibold"
                          >
                            Play
                          </button>
                          <button
                            onClick={() => {
                              handlePlayNext(song);
                              setSpotlightOpen(false);
                            }}
                            className="px-2.5 py-1 rounded-xl text-[11px] bg-white/10 hover:bg-white/20"
                            title="Play Immediately After Current Song"
                          >
                            Play Next
                          </button>
                          <button
                            onClick={() => {
                              setSpotlightOpen(false);
                              openAddToPlaylistModal(song);
                            }}
                            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20"
                            title="Add to Playlist"
                          >
                            <ListPlus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSpotlightOpen(false);
                              handleDeleteSongPrompt(song);
                            }}
                            className="p-1.5 rounded-xl hover:bg-red-500/20 text-red-400/80 hover:text-red-300 transition"
                            title="Delete Song from Database (Permanent)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NAVIDROME SUBSONIC AUTHENTICATION MODAL */}
      <AnimatePresence>
        {authModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAuthModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          >
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleConnectSubmit}
              className={`w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl ${glassClass}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">Connect to Navidrome</h2>
                  <p className="text-xs opacity-60">
                    Subsonic API v1.16.1 • Navidrome Server
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 transition"
                  title="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-xs text-red-200">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] uppercase opacity-70 mb-1">
                    Navidrome Endpoint
                  </label>
                  <input
                    type="url"
                    required
                    value={serverInput}
                    onChange={(e) => setServerInput(e.target.value)}
                    placeholder="https://music.your-domain.com"
                    className="w-full px-3.5 py-2 rounded-xl bg-black/25 border border-white/15 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase opacity-70 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    placeholder="Your Navidrome username"
                    className="w-full px-3.5 py-2 rounded-xl bg-black/25 border border-white/15 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase opacity-70 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={passInput}
                    onChange={(e) => setPassInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 rounded-xl bg-black/25 border border-white/15 text-xs focus:outline-none"
                  />
                </div>

                {/* Theme Selector & Quick Tools inside Settings */}
                <div className="pt-1 space-y-2">
                  <label className="block text-[11px] uppercase opacity-70">
                    Theme Style
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUiStyle('liquid')}
                      style={uiStyle === 'liquid' ? dynamicAccentStyle : undefined}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold transition border ${
                        uiStyle === 'liquid'
                          ? 'border-white/30'
                          : 'bg-black/25 border-white/10 opacity-75 hover:opacity-100'
                      }`}
                    >
                      Liquid (Default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUiStyle('space')}
                      style={uiStyle === 'space' ? dynamicAccentStyle : undefined}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold transition border ${
                        uiStyle === 'space'
                          ? 'border-white/30'
                          : 'bg-black/25 border-white/10 opacity-75 hover:opacity-100'
                      }`}
                    >
                      Meteor Shower / Space
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthModalOpen(false);
                        setEqModalOpen(true);
                      }}
                      className="py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Sliders className="w-3.5 h-3.5" /> EQ & Visualizer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthModalOpen(false);
                        setDiscordModalOpen(true);
                      }}
                      className="py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Gamepad2 className="w-3.5 h-3.5" /> Discord RPC
                    </button>
                  </div>
                </div>

                {/* Optional Self-Hosted Song Sharing File Server Config */}
                <div className="pt-1 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowShareConfigInAuth((v) => !v)}
                    className="text-[11px] font-semibold opacity-75 hover:opacity-100 flex items-center justify-between w-full py-1"
                  >
                    <span>Optional: Custom Song-Sharing File Server</span>
                    <span className="text-[10px] opacity-60">
                      {showShareConfigInAuth ? 'Hide' : 'Configure'}
                    </span>
                  </button>
                  {showShareConfigInAuth && (
                    <div className="space-y-2 mt-2 p-3 rounded-2xl bg-black/25 border border-white/10">
                      <div>
                        <label className="block text-[10px] uppercase opacity-65 mb-1">
                          FileBrowser / Share Server URL (Optional)
                        </label>
                        <input
                          type="url"
                          value={shareServerInput}
                          onChange={(e) => setShareServerInput(e.target.value)}
                          placeholder="https://files.your-domain.com"
                          className="w-full px-3 py-1.5 rounded-xl bg-black/30 border border-white/15 text-xs focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase opacity-65 mb-1">
                          Share API Token / Key (Optional)
                        </label>
                        <input
                          type="password"
                          value={shareTokenInput}
                          onChange={(e) => setShareTokenInput(e.target.value)}
                          placeholder="Leave blank for default server"
                          className="w-full px-3 py-1.5 rounded-xl bg-black/30 border border-white/15 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                {isConnected ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setAuthModalOpen(false);
                      await handleResyncAllSongs();
                    }}
                    disabled={isResyncing}
                    className="px-3.5 py-2 rounded-xl text-xs bg-white/10 hover:bg-white/20 text-white flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
                    <span>Resync Server Library</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs hover:bg-white/10"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    style={dynamicAccentStyle}
                    className="px-5 py-2 rounded-xl text-xs font-semibold"
                  >
                    Connect Server
                  </button>
                </div>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ADD TO PLAYLIST MODAL (Supports single track or multiple selected queue tracks) */}
      <AnimatePresence>
        {addToPlaylistSongs && addToPlaylistSongs.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAddToPlaylistSongs(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl ${glassClass}`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <ListPlus
                      className="w-4 h-4 shrink-0"
                      style={{ color: `rgb(${palette.primaryRgb})` }}
                    />
                    <span>Add to Playlist</span>
                  </h3>
                  <p className="text-xs opacity-65 truncate mt-0.5">
                    {addToPlaylistSongs.length === 1
                      ? `"${addToPlaylistSongs[0].title}" • ${addToPlaylistSongs[0].artist}`
                      : `${addToPlaylistSongs.length} tracks selected`}
                  </p>
                </div>
                <button
                  onClick={() => setAddToPlaylistSongs(null)}
                  className="p-1.5 rounded-xl hover:bg-white/10 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Create New Playlist option */}
              {creatingNewPlaylist ? (
                <form
                  onSubmit={handleCreateAndAddSongsToPlaylist}
                  className="p-3 rounded-2xl bg-black/30 border border-white/15 space-y-2.5"
                >
                  <p className="text-[11px] font-semibold">New Playlist Name</p>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newPlaylistNameInput}
                    onChange={(e) => setNewPlaylistNameInput(e.target.value)}
                    placeholder="e.g. My Favorites"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/20 text-xs focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCreatingNewPlaylist(false)}
                      className="px-3 py-1.5 rounded-xl text-xs hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={dynamicAccentStyle}
                      className="px-4 py-1.5 rounded-xl text-xs font-semibold"
                    >
                      Create & Add
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setCreatingNewPlaylist(true)}
                  className="w-full p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-2.5 text-xs font-semibold transition"
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `rgba(${palette.primaryRgb}, 0.2)` }}
                  >
                    <Plus className="w-4 h-4" style={{ color: `rgb(${palette.primaryRgb})` }} />
                  </div>
                  <span>Create New Playlist...</span>
                </button>
              )}

              {/* List of Existing Playlists */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                <p className="text-[10px] uppercase opacity-60 font-semibold px-1">
                  Existing Playlists ({playlists.length})
                </p>
                {playlists.length === 0 ? (
                  <div className="py-6 text-center text-xs opacity-60">
                    No playlists found on server. Create one above!
                  </div>
                ) : (
                  playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => handleAddSongsToPlaylistTarget(pl.id, pl.name)}
                      className="w-full p-2.5 rounded-2xl bg-white/5 hover:bg-white/15 transition flex items-center justify-between gap-3 text-left group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center shrink-0">
                          <FolderPlus className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate group-hover:text-white">
                            {pl.name}
                          </p>
                          <p className="text-[10px] opacity-60">
                            {pl.songCount || 0} song{pl.songCount === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] opacity-60 group-hover:opacity-100 px-2.5 py-1 rounded-lg bg-white/5 font-medium shrink-0">
                        Add
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setAddToPlaylistSongs(null)}
                  className="px-4 py-1.5 rounded-xl text-xs bg-white/10 hover:bg-white/20"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRM PERMANENT DELETE FROM DATABASE MODAL */}
      <AnimatePresence>
        {songToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isDeletingSong && setSongToDelete(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-red-500/30 ${glassClass}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-red-400">
                  <div className="w-9 h-9 rounded-2xl bg-red-500/20 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Delete from Database</h3>
                    <p className="text-[11px] text-red-300/80">Permanent disk & database deletion</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isDeletingSong}
                  onClick={() => setSongToDelete(null)}
                  className="p-1.5 rounded-xl hover:bg-white/10 shrink-0 transition"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Song details summary card */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/40 border border-white/10">
                <div className="w-12 h-12 rounded-xl bg-black/50 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
                  {getSongThumbUrl(songToDelete) ? (
                    <img
                      src={getSongThumbUrl(songToDelete)!}
                      alt={songToDelete.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Disc3 className="w-5 h-5 opacity-40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate text-white">{songToDelete.title}</p>
                  <p className="text-[11px] opacity-60 truncate">
                    {songToDelete.artist} • {songToDelete.album || 'Unknown Album'}
                  </p>
                  <p className="text-[10px] opacity-40 font-mono mt-0.5">
                    Duration: {formatTime(songToDelete.duration)}
                  </p>
                </div>
              </div>

              {/* Warning message */}
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-1">
                <p className="text-xs font-semibold text-red-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Permanent Action</span>
                </p>
                <p className="text-[11px] text-red-200/70 leading-relaxed">
                  This will permanently delete the audio file from server storage, purge records from Navidrome's database, clean up scrobbles, and remove it from all playlists. This cannot be undone.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={isDeletingSong}
                  onClick={() => setSongToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeletingSong}
                  onClick={handleConfirmDeleteSong}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-lg shadow-red-600/30 flex items-center gap-2 transition disabled:opacity-50"
                >
                  {isDeletingSong ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Permanently</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
