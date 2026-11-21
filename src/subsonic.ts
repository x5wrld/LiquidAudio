import md5 from 'crypto-js/md5';

export interface SubsonicParams {
  u: string;
  t: string;
  s: string;
  v: string;
  c: string;
  f: string;
}

export interface SubsonicSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverArt?: string;
  track?: number;
  year?: number;
  genre?: string;
  suffix?: string;
  bitRate?: number;
  size?: number;
  starred?: string;
}

export interface SubsonicPlaylist {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount: number;
  duration: number;
  created: string;
  coverArt?: string;
  entry?: SubsonicSong[];
}

export class SubsonicClient {
  private baseUrl: string;
  private username: string;
  private token: string;
  private salt: string;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.username = username;
    this.salt = Math.random().toString(36).substring(2, 10);
    this.token = md5(password + this.salt).toString();
  }

  private getParams(): Record<string, string> {
    return {
      u: this.username,
      t: this.token,
      s: this.salt,
      v: '1.16.1',
      c: 'LiquidAudio',
      f: 'json',
    };
  }

  public getApiUrl(endpoint: string, extraParams: Record<string, string> = {}): string {
    const params = new URLSearchParams({ ...this.getParams(), ...extraParams });
    return `${this.baseUrl}/rest/${endpoint}?${params.toString()}`;
  }

  public getAuthCredentials() {
    return {
      username: this.username,
      token: this.token,
      salt: this.salt,
    };
  }

  public isDefaultHostedServer(): boolean {
    const lower = (this.baseUrl || '').toLowerCase();
    if (!lower || lower.includes('localhost') || lower.includes('127.0.0.1')) {
      return true;
    }
    try {
      if (typeof window !== 'undefined' && window.location.hostname) {
        const pageHost = window.location.hostname.toLowerCase();
        const pageRoot = pageHost.split('.').slice(-2).join('.');
        const targetHost = new URL(lower).hostname.toLowerCase();
        if (targetHost === pageHost || (pageRoot && targetHost.endsWith(`.${pageRoot}`))) {
          return true;
        }
      }
    } catch {
      // ignore invalid URL
    }
    return false;
  }

  public async ping(): Promise<boolean> {
    const url = this.getApiUrl('ping.view');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();
      return data['subsonic-response']?.status === 'ok';
    } catch {
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  }

  public async fetchStarredSongs(): Promise<SubsonicSong[]> {
    try {
      const url = this.getApiUrl('getStarred2.view');
      const res = await fetch(url);
      const data = await res.json();
      const songs: SubsonicSong[] = data['subsonic-response']?.starred2?.song || [];
      return songs.map((s) => ({
        ...s,
        starred: s.starred || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  public async fetchSongs(query: string = ''): Promise<SubsonicSong[]> {
    const q = query.trim();
    const isHosted = this.isDefaultHostedServer();

    // 1. Fast Server Search: Query local high-speed SQLite search endpoint (< 25ms response time) when using hosted server
    if (q && isHosted) {
      try {
        const fastRes = await fetch(`/api/library/search?q=${encodeURIComponent(q)}&limit=120`);
        if (fastRes.ok) {
          const fastData = await fastRes.json();
          if (fastData.status === 'ok' && Array.isArray(fastData.songs) && fastData.songs.length > 0) {
            return fastData.songs;
          }
        }
      } catch {
        // Fall through to Subsonic API
      }
    }

    // 2. Subsonic API search3.view (works with ANY Navidrome / Subsonic server)
    if (q) {
      try {
        const url = this.getApiUrl('search3.view', {
          query: q,
          songCount: '300',
          albumCount: '0',
          artistCount: '0',
        });
        const res = await fetch(url);
        const data = await res.json();
        const songs: SubsonicSong[] = (data['subsonic-response']?.searchResult3?.song || []).filter(
          (s: SubsonicSong) => !s.duration || s.duration >= 30
        );
        if (songs.length > 0) {
          return songs;
        }
      } catch {
        // ignore
      }
      return [];
    }

    // 3. Empty query (Default Library View): Fetch recently added songs + random songs + starred songs
    if (isHosted) {
      try {
        const recentRes = await fetch('/api/library/recent?limit=100');
        if (recentRes.ok) {
          const recentData = await recentRes.json();
          if (recentData.status === 'ok' && Array.isArray(recentData.songs) && recentData.songs.length > 0) {
            const [randomSongs, starredSongs] = await Promise.all([
              this.fetchRandomSongs(150),
              this.fetchStarredSongs(),
            ]);
            const starredIds = new Set(starredSongs.map((s) => s.id));
            const map = new Map<string, SubsonicSong>();
            for (const s of recentData.songs) {
              map.set(s.id, starredIds.has(s.id) ? { ...s, starred: s.starred || 'true' } : s);
            }
            for (const s of starredSongs) {
              if (!map.has(s.id)) map.set(s.id, s);
            }
            for (const s of randomSongs) {
              if (!map.has(s.id)) {
                map.set(s.id, starredIds.has(s.id) ? { ...s, starred: s.starred || 'true' } : s);
              }
            }
            return Array.from(map.values());
          }
        }
      } catch {
        // ignore
      }
    }

    const [randomSongs, starredSongs] = await Promise.all([
      this.fetchRandomSongs(200),
      this.fetchStarredSongs(),
    ]);
    const starredMap = new Map(starredSongs.map((s) => [s.id, s]));
    const combined = new Map<string, SubsonicSong>();
    for (const s of starredSongs) combined.set(s.id, s);
    for (const s of randomSongs) {
      if (!combined.has(s.id)) {
        combined.set(s.id, starredMap.has(s.id) ? { ...s, starred: 'true' } : s);
      }
    }
    return Array.from(combined.values());
  }

  public async fetchRandomSongs(size: number = 150): Promise<SubsonicSong[]> {
    const url = this.getApiUrl('getRandomSongs.view', { size: size.toString() });
    const res = await fetch(url);
    const data = await res.json();
    const songs: SubsonicSong[] = data['subsonic-response']?.randomSongs?.song || [];
    return songs.filter((s) => !s.duration || s.duration >= 40);
  }

  public getStreamUrl(id: string, maxBitRate?: number): string {
    const extra: Record<string, string> = { id };
    if (maxBitRate && maxBitRate > 0) {
      extra.maxBitRate = maxBitRate.toString();
    }
    return this.getApiUrl('stream.view', extra);
  }

  public getCoverArtUrl(id: string, size: number = 600): string {
    return this.getApiUrl('getCoverArt.view', { id, size: size.toString() });
  }

  public async getPlaylists(): Promise<SubsonicPlaylist[]> {
    const url = this.getApiUrl('getPlaylists.view');
    const res = await fetch(url);
    const data = await res.json();
    return data['subsonic-response']?.playlists?.playlist || [];
  }

  public async getPlaylist(id: string): Promise<SubsonicPlaylist | null> {
    const url = this.getApiUrl('getPlaylist.view', { id });
    const res = await fetch(url);
    const data = await res.json();
    return data['subsonic-response']?.playlist || null;
  }

  public async createPlaylist(name: string, songIds: string[] = []): Promise<SubsonicPlaylist | null> {
    const params = new URLSearchParams(this.getParams());
    params.append('name', name);
    songIds.forEach((id) => params.append('songId', id));
    const res = await fetch(`${this.baseUrl}/rest/createPlaylist.view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    return data['subsonic-response']?.playlist || null;
  }

  public async updatePlaylist(
    playlistId: string,
    songIdsToAdd: string[] = [],
    songIndexesToRemove: number[] = [],
    name?: string,
    comment?: string
  ): Promise<any> {
    const params = new URLSearchParams(this.getParams());
    params.append('playlistId', playlistId);
    if (name) params.append('name', name);
    if (comment !== undefined) params.append('comment', comment);
    songIdsToAdd.forEach((id) => params.append('songIdToAdd', id));
    songIndexesToRemove.forEach((idx) => params.append('songIndexToRemove', idx.toString()));
    const res = await fetch(`${this.baseUrl}/rest/updatePlaylist.view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    return res.json();
  }

  public async replacePlaylistTracks(playlistId: string, name: string, orderedSongIds: string[]): Promise<any> {
    const params = new URLSearchParams(this.getParams());
    params.append('playlistId', playlistId);
    params.append('name', name);
    orderedSongIds.forEach((id) => params.append('songId', id));
    const res = await fetch(`${this.baseUrl}/rest/createPlaylist.view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    return res.json();
  }

  public async deletePlaylist(id: string): Promise<any> {
    const url = this.getApiUrl('deletePlaylist.view', { id });
    const res = await fetch(url);
    return res.json();
  }

  public async toggleStar(id: string, currentlyStarred: boolean): Promise<boolean> {
    const endpoint = currentlyStarred ? 'unstar.view' : 'star.view';
    const url = this.getApiUrl(endpoint, { id });
    const res = await fetch(url);
    const data = await res.json();
    return data['subsonic-response']?.status === 'ok';
  }

  public async startScan(fullScan: boolean = false): Promise<boolean> {
    const url = this.getApiUrl('startScan.view', fullScan ? { fullScan: 'true' } : {});
    const res = await fetch(url);
    const data = await res.json();
    return data['subsonic-response']?.status === 'ok';
  }

  public async getScanStatus(): Promise<{ scanning: boolean; count: number; folderCount?: number }> {
    const url = this.getApiUrl('getScanStatus.view');
    const res = await fetch(url);
    const data = await res.json();
    const st = data['subsonic-response']?.scanStatus;
    return {
      scanning: Boolean(st?.scanning),
      count: Number(st?.count) || 0,
      folderCount: Number(st?.folderCount) || 0,
    };
  }
}
