import Dexie, { type Table } from 'dexie';
import type { SubsonicSong } from './subsonic';

export interface ServerCredentials {
  id?: number;
  baseUrl: string;
  username: string;
  password: string;
  updatedAt: number;
}

export interface LyricOverride {
  songId: string;
  title: string;
  artist: string;
  syncedLyrics?: string;
  plainLyrics?: string;
  source: 'verified-lrc' | 'verified-genius' | 'audio-ai' | 'embedded-tag' | 'manual';
  engineVersion?: number;
  updatedAt: number;
}

export interface OfflineTrack {
  id: string;
  song: SubsonicSong;
  audioBlob: Blob;
  coverBlob?: Blob;
  sizeBytes: number;
  downloadedAt: number;
  playlists?: string[];
}

export class LiquidAudioDB extends Dexie {
  credentials!: Table<ServerCredentials, number>;
  lyrics!: Table<LyricOverride, string>;
  downloads!: Table<OfflineTrack, string>;

  constructor() {
    super('LiquidAudioDB');
    this.version(7).stores({
      credentials: '++id, baseUrl, username, updatedAt',
      lyrics: 'songId, title, artist, source',
      downloads: 'id, downloadedAt',
    });
  }
}

export const db = new LiquidAudioDB();
