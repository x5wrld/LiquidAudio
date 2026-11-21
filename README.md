# Liquid Audio — BUILD V1

A modern, self-hosted **Navidrome / Subsonic** Progressive Web App (PWA) built with **React, TypeScript, Tailwind CSS, Zustand, Web Audio API, and FastAPI**. Designed for both **Desktop** and **Mobile (iOS & Android PWA)** with album-reactive liquid glass visuals, synced lyrics, offline playback, playlist folders, and optional companion services.

---

## Key Features (BUILD V1)

### UI & Visuals
- **Two Permanent UI Styles**: Switch between **Liquid Glass** (default) and a clean **Spotify-inspired UI** (`Dark` & `Light` themes persisted automatically).
- **Accurate Album-Reactive Backgrounds**: 12-hue vibrancy-weighted HSL color extraction with automatic luminance calibration — dark/black covers render deep obsidian backgrounds, while white/bright covers use a softened anti-glare pearl aesthetic.
- **Liquid Splash Song Transitions**: Organic shockwave rings, splashing droplets, and cover-art ripple/caustic waves on every track change or skip.
- **60fps Audio Visualizer**: Real-time Web Audio spectrum, waveform, mirror, orb, and particle visualizers reactive to the active track's cover palette.
- **Pop-Out & In-App Mini Player**: Resizable mini player with optional Cover-Only mode and 1-line synced lyrics overlay.

### Audio Engine & Mobile PWA
- **6-Band Parametric Equalizer & Bass Boost**: Built-in presets (`Flat`, `808 Bass Boost`, `Extreme Bass`, `Vocal Glow`, `Slowed + Deep`, `Sped Up / Nightcore`, `Treble & Air`) plus custom sliders.
- **Dual-Deck Seamless Crossfade & Playback Speed**: Smooth transitions with pitch preservation toggle and persistent volume, shuffle, and repeat state.
- **Offline Device Vault**: Download tracks and organize them into offline playlists stored in IndexedDB (`Dexie`) for full Airplane Mode playback.
- **iOS & Android Lock Screen / Dynamic Island Integration**: MediaSession metadata, cover art, progress syncing, and iOS background keep-alive handling for reliable lock screen play/pause/skip controls.

### Library, Playlists & Social
- **Playlist Folders**: Create, rename, and delete folders to organize your Navidrome playlists with one-click assignment (deleting a folder keeps all playlists intact).
- **Liked Songs Tab & Queue Search**: Dedicated Liked Songs view, instant Queue filtering, drag-and-drop reordering, and full library search.
- **Synced Lyrics**: Automatic LRC lookup with liquid word-sweep animations and contrast-adaptive lyric colors that remain readable on any cover art.
- **Listen Along**: Real-time session syncing so friends connected to the same instance can listen together.
- **Liquid Wrapped**: Personal listening statistics, streaks, top tracks/artists, and exportable story cards.
- **Optional Discord Rich Presence (RPC)**: Privacy-safe local bridge script that displays track title, artist, album art, and live progress in Discord without exposing your server URL.
- **Optional Music Importer & Song Sharing**: Companion FastAPI backend supports catalog discovery/importing and optional public song-sharing links via your own file server (e.g., FileBrowser).

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Zustand, Dexie (IndexedDB), Lucide Icons |
| **Audio** | HTML5 `<audio>` Dual-Deck Engine, Web Audio API (`BiquadFilterNode`, `GainNode`, `AnalyserNode`), Media Session API |
| **Backend (Optional Companion)** | Python 3, FastAPI, Uvicorn, SQLite, `yt-dlp` |
| **Serving / Proxy** | Nginx (hardened security headers + API reverse proxy), Service Worker PWA (`public/sw.js`) |

---

## Quick Start (Self-Hosting with Navidrome)

### Prerequisites
- A running **Navidrome** (or Subsonic API v1.16.1-compatible) server.
- **Docker** & **Docker Compose** (or Node.js 20+ for local development).

### 1. Clone & Configure Environment
```bash
git clone https://github.com/your-username/liquid-audio.git
cd liquid-audio
cp .env.example .env
```

Edit `.env` if you want to customize optional settings (no secrets are required to connect to Navidrome — users sign in directly from the UI using Subsonic token authentication).

### 2. Run with Docker Compose
Example `docker-compose.yml` snippet:

```yaml
services:
  liquid-audio:
    build: .
    container_name: liquid-audio
    ports:
      - "8080:80"
    depends_on:
      - liquid-transcriber
    restart: unless-stopped

  liquid-transcriber:
    build: ./transcriber
    container_name: liquid-transcriber
    env_file:
      - .env
    volumes:
      - ./lyrics-cache:/app/lyrics-cache
      - ./wrapped-db:/app/wrapped-db
      # Optional: mount your Navidrome data & music directories if using companion features
      # - /path/to/navidrome/data:/data:ro
      # - /path/to/music:/music
    restart: unless-stopped
```

Start the stack:
```bash
docker compose up -d --build
```

Open `http://localhost:8080`, click the **Server** icon in the top-right corner, and sign in with your Navidrome URL, username, and password.

### 3. Local Frontend Development
```bash
npm install
npm run dev
```

To create a production build:
```bash
npm run build
```

---

## Optional: Custom Song-Sharing Server Setup

Anyone running their own Navidrome instance can optionally enable public song-sharing links using their own file server (such as [FileBrowser](https://filebrowser.org/)):

1. **Per-User In-App Setup**: Open **Settings → Song Sharing**, enter your file server URL (e.g., `https://files.example.com`) and optional API token.
2. **Server-Wide Setup (Optional)**: Set `FILEBROWSER_PUBLIC_BASE`, `FILEBROWSER_KEY_B64`, and `PUBLIC_PLAYER_URL` in your `.env` file. Leave them blank to keep file-sharing disabled.

---

## Security & Privacy Notes

- **Subsonic Token Auth**: Passwords are salted and MD5-hashed per the Subsonic API v1.16.1 specification when making requests to Navidrome.
- **Hardened Nginx Config**: [`nginx.conf`](nginx.conf) disables server tokens, enforces security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), and blocks common PHP/CGI/scanner probe paths.
- **No Hardcoded Secrets**: All optional backend keys and public domains are loaded exclusively from environment variables (`.env` is gitignored).

---

## License

MIT License — feel free to fork, customize, and self-host for your personal Navidrome library.
