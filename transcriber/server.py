import os
import re
import hmac
import time
import html
import json
import base64
import hashlib
import sqlite3
import asyncio
import tempfile
import subprocess
import urllib.parse
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any
import urllib3.util.connection as urllib3_cn

# Force IPv4 inside Docker container to prevent 5s IPv6 timeouts on external APIs
urllib3_cn.HAS_IPV6 = False

import requests
import yt_dlp
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TDRC, APIC, error as ID3Error
from fastapi import FastAPI, Query, Body, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse, Response
from pydantic import BaseModel
from faster_whisper import WhisperModel

app = FastAPI(title="Liquid Audio Hybrid Lyric Engine & Music Importer")

NAVIDROME_DB = "/data/navidrome.db"
CACHE_DIR = Path("/cache/lyrics")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
WRAPPED_DB_DIR = Path("/cache/wrapped-db")
WRAPPED_USERS_DIR = WRAPPED_DB_DIR / "users"
WRAPPED_USERS_DIR.mkdir(parents=True, exist_ok=True)
WRAPPED_SQLITE_PATH = WRAPPED_DB_DIR / "wrapped_users.db"
MODEL_DIR = Path("/opt/whisper_model")
MODEL_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOAD_DIR = Path("/music/local/songs")

LYRIC_ENGINE_VERSION = 3
MODEL_NAME = os.environ.get("WHISPER_MODEL", "small.en")
whisper_model: Optional[WhisperModel] = None

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}


class ImportRequest(BaseModel):
    source: str
    url: str
    title: str
    artist: str
    album: Optional[str] = ""
    artworkUrl: Optional[str] = ""
    releaseYear: Optional[str] = ""
    duration: Optional[int] = 0
    isExplicit: Optional[bool] = None


class DeleteSongRequest(BaseModel):
    songId: str
    deleteFile: Optional[bool] = True
    username: Optional[str] = None
    token: Optional[str] = None
    salt: Optional[str] = None


def get_model() -> WhisperModel:
    global whisper_model
    if whisper_model is None:
        whisper_model = WhisperModel(
            MODEL_NAME,
            device="cpu",
            compute_type="int8",
            cpu_threads=4,
            download_root=str(MODEL_DIR),
        )
    return whisper_model


def _safe_cache_key(song_id: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9_\-.]", "_", (song_id or "").strip())
    return clean[:120] or "unknown"


def resolve_song_info(
    song_id: str,
    fallback_title: str = "",
    fallback_artist: str = "",
    fallback_duration: float = 180.0,
) -> Optional[dict]:
    clean_id = (song_id or "").strip()
    if os.path.exists(NAVIDROME_DB):
        try:
            conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            row = cur.execute(
                "SELECT id, title, artist, path, duration, lyrics FROM media_file WHERE id = ?",
                (clean_id,),
            ).fetchone()
            if not row and clean_id.startswith("local:"):
                fname = os.path.basename(clean_id.replace("local:", "").strip())
                rel_p = f"local/songs/{fname}"
                row = cur.execute(
                    "SELECT id, title, artist, path, duration, lyrics FROM media_file WHERE path = ? LIMIT 1",
                    (rel_p,),
                ).fetchone()
            if not row and fallback_title:
                t_low = fallback_title.strip().lower()
                a_low = (fallback_artist or "").strip().lower()
                if a_low and a_low != "unknown artist":
                    row = cur.execute(
                        "SELECT id, title, artist, path, duration, lyrics FROM media_file WHERE LOWER(title) = ? AND LOWER(artist) = ? ORDER BY created_at DESC LIMIT 1",
                        (t_low, a_low),
                    ).fetchone()
                if not row:
                    row = cur.execute(
                        "SELECT id, title, artist, path, duration, lyrics FROM media_file WHERE LOWER(title) = ? ORDER BY created_at DESC LIMIT 1",
                        (t_low,),
                    ).fetchone()
            conn.close()
            if row:
                return dict(row)
        except Exception:
            pass

    # Check local downloaded file if it hasn't been indexed into navidrome.db yet
    if clean_id.startswith("local:"):
        fname = os.path.basename(clean_id.replace("local:", "").strip())
        local_f = DOWNLOAD_DIR / fname
        if local_f.exists():
            stem = local_f.stem
            t_guess = fallback_title or stem
            a_guess = fallback_artist or "Unknown Artist"
            if " - " in stem and not fallback_title:
                a_guess, t_guess = [p.strip() for p in stem.split(" - ", 1)]
            return {
                "id": clean_id,
                "title": t_guess,
                "artist": a_guess,
                "path": f"local/songs/{fname}",
                "duration": fallback_duration or 180.0,
                "lyrics": "",
            }

    if fallback_title.strip():
        return {
            "id": clean_id,
            "title": fallback_title.strip(),
            "artist": (fallback_artist or "Unknown Artist").strip(),
            "path": "",
            "duration": fallback_duration or 180.0,
            "lyrics": "",
        }
    return None


def parse_embedded_navidrome_lyrics(raw_lyrics: str) -> Optional[dict]:
    if not raw_lyrics or raw_lyrics in ("[]", ""):
        return None
    try:
        parsed = json.loads(raw_lyrics)
        if not isinstance(parsed, list) or len(parsed) == 0:
            return None
        entry = parsed[0]
        lines = entry.get("line", [])
        if not lines:
            return None
        synced = bool(entry.get("synced", False))
        synced_lines = []
        plain_lines = []
        for item in lines:
            val = item.get("value", "").strip()
            if not val:
                continue
            plain_lines.append(val)
            if "start" in item:
                synced_lines.append({"time": float(item["start"]) / 1000.0, "text": val})
        return {
            "synced": synced and len(synced_lines) > 0,
            "syncedLines": synced_lines,
            "plainText": "\n".join(plain_lines),
            "source": "embedded-tag",
            "engineVersion": LYRIC_ENGINE_VERSION,
        }
    except Exception:
        return None


def parse_lrc_string(lrc_text: str) -> List[Dict]:
    lines = lrc_text.splitlines()
    result = []
    time_re = re.compile(r"\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]")
    for line in lines:
        matches = list(time_re.finditer(line))
        if not matches:
            continue
        text = time_re.sub("", line).strip()
        if not text:
            continue
        for m in matches:
            mins = int(m.group(1))
            secs = int(m.group(2))
            ms_str = (m.group(3) or "0").ljust(3, "0")[:3]
            t = round(mins * 60 + secs + int(ms_str) / 1000.0, 2)
            result.append({"time": t, "text": text})
    result.sort(key=lambda x: x["time"])
    return result


def normalize_for_compare(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def clean_track_queries(artist: str, title: str, rel_path: str = "") -> Tuple[str, List[str]]:
    """
    Produces clean artist name and candidate track titles from messy filenames/leak tags.
    Example:
      artist='[Unknown Artist]', title='Juice - Amensia' -> ('Juice WRLD', ['Amnesia', 'Amensia'])
      artist='Juice WRLD', title='OREO [v2] (ft. Lil Yachty)' -> ('Juice WRLD', ['Oreo'])
      artist='Juice WRLD', title='Broke Boys (Steroids)' -> ('Juice WRLD', ['Broke Boys (Steroids)', 'Broke Boys', 'Steroids'])
    """
    clean_artist = (artist or "").strip()
    raw_title = (title or "").strip()

    # Check if title has "Artist - Song"
    if " - " in raw_title and (
        not clean_artist or "unknown" in clean_artist.lower()
    ):
        parts = raw_title.split(" - ", 1)
        clean_artist = parts[0].strip()
        raw_title = parts[1].strip()

    if clean_artist.lower() in ("juice", "[unknown artist]", "unknown artist", ""):
        clean_artist = "Juice WRLD"

    raw_title = raw_title.replace("_", " ")
    # Fix common leak filename typos
    raw_title = re.sub(r"\bAmensia\b", "Amnesia", raw_title, flags=re.I)

    # Extract any parenthetical subtitle before stripping tags
    parens = re.findall(r"\(([^)]+)\)", raw_title)
    alt_subtitles = []
    for p in parens:
        p_clean = p.strip()
        # Ignore version/feat/session codes like v1, b861, 1748 Moon, ft. X
        if not re.match(r"^(?:v\d+|ft\.|feat\.|prod\.|[a-z]\d+|\d+\s+\w+)$", p_clean, re.I):
            alt_subtitles.append(p_clean)

    # Strip bracketed/parenthetical version/feature tags
    base_title = re.sub(r"\[[^\]]*\]", "", raw_title)
    base_title = re.sub(
        r"\((?:ft\.|feat\.|prod\.|v\d+|official|audio|lyrics|[a-z]\d+|\d+\s+\w+)[^)]*\)",
        "",
        base_title,
        flags=re.I,
    )
    # Strip trailing file duplicate numbers like " 1"
    base_title = re.sub(r"\s+\d+$", "", base_title).strip()

    candidates = []
    for cand in [base_title, re.sub(r"\([^)]*\)", "", base_title).strip()] + alt_subtitles:
        c = re.sub(r"\s+", " ", cand).strip()
        if c and c not in candidates:
            candidates.append(c)

    # Also check filename if it differs from tag title (e.g. "Pretty Much" with file "Juice - Dr. Phil.mp3")
    if rel_path:
        stem = Path(rel_path).stem.replace("_", " ")
        if " - " in stem:
            stem = stem.split(" - ", 1)[1].strip()
        stem = re.sub(r"\[[^\]]*\]|\([^)]*\)", "", stem).strip()
        if stem and stem.lower() not in [c.lower() for c in candidates]:
            candidates.append(stem)

    return clean_artist, candidates


def fetch_lrclib_synced(artist: str, candidates: List[str], duration: float) -> Optional[dict]:
    """
    Searches LRCLIB for millisecond-synced lyrics with strict artist + title + duration validation.
    """
    norm_artist = normalize_for_compare(artist)
    for cand in candidates:
        norm_cand = normalize_for_compare(cand)
        if not norm_cand:
            continue
        try:
            r = requests.get(
                "https://lrclib.net/api/search",
                params={"q": f"{artist} {cand}"},
                headers={"User-Agent": "LiquidAudio/1.0 (https://github.com/liquid-audio/liquid-audio)"},
                timeout=4,
            )
            if not r.ok:
                continue
            items = r.json()
            if not isinstance(items, list):
                continue

            best_match = None
            best_diff = 999.0
            for item in items:
                if not isinstance(item, dict):
                    continue
                synced_lrc = item.get("syncedLyrics")
                if not synced_lrc:
                    continue
                it_title = normalize_for_compare(item.get("trackName") or "")
                it_artist = normalize_for_compare(item.get("artistName") or "")
                if norm_cand not in it_title and it_title not in norm_cand:
                    continue
                if norm_artist and norm_artist not in it_artist and it_artist not in norm_artist:
                    continue
                it_dur = float(item.get("duration") or 0)
                diff = abs(it_dur - duration) if duration > 0 and it_dur > 0 else 0.0
                if diff <= 12.0 and diff < best_diff:
                    best_diff = diff
                    best_match = synced_lrc

            if best_match:
                parsed_lines = parse_lrc_string(best_match)
                if len(parsed_lines) >= 5:
                    return {
                        "syncedLines": parsed_lines,
                        "plainText": "\n".join(l["text"] for l in parsed_lines),
                        "source": "verified-lrc",
                    }
        except Exception:
            continue
    return None


def fetch_genius_verified_lines(artist: str, candidates: List[str]) -> Optional[List[str]]:
    """
    Fetches 100% word-for-word verified lyrics from Genius (supports both commercial releases & unreleased leaks).
    """
    norm_artist = normalize_for_compare(artist)
    for cand in candidates:
        norm_cand = normalize_for_compare(cand)
        if not norm_cand:
            continue
        try:
            r = requests.get(
                "https://genius.com/api/search/multi",
                params={"q": f"{artist} {cand}"},
                headers=HTTP_HEADERS,
                timeout=5,
            )
            if not r.ok:
                continue
            sections = r.json().get("response", {}).get("sections", [])
            song_url = None
            for sec in sections:
                if sec.get("type") in ("top_hit", "song"):
                    for hit in sec.get("hits", []):
                        if hit.get("type") != "song":
                            continue
                        res = hit.get("result", {})
                        h_title = normalize_for_compare(res.get("title") or "")
                        h_artist = normalize_for_compare(
                            res.get("primary_artist", {}).get("name") or ""
                        )
                        if (norm_cand in h_title or h_title in norm_cand) and (
                            not norm_artist
                            or norm_artist in h_artist
                            or h_artist in norm_artist
                        ):
                            song_url = res.get("url")
                            break
                if song_url:
                    break

            if not song_url:
                continue

            page = requests.get(song_url, headers=HTTP_HEADERS, timeout=6)
            if not page.ok:
                continue

            # Remove excluded header blocks (e.g. "89 ContributorsTranslations...")
            cleaned_html = re.sub(
                r'<div[^>]*data-exclude-from-selection="true"[^>]*>.*?</div>',
                "",
                page.text,
                flags=re.S,
            )
            blocks = re.findall(
                r'data-lyrics-container="true"[^>]*>(.*?)</div>',
                cleaned_html,
                flags=re.S,
            )
            if not blocks:
                continue

            raw_text = "\n".join(blocks)
            raw_text = re.sub(r"<br\s*/?>", "\n", raw_text)
            raw_text = re.sub(r"<[^>]+>", "", raw_text)
            raw_text = html.unescape(raw_text)

            lines = []
            for ln in raw_text.splitlines():
                s = ln.strip()
                if not s:
                    continue
                # Skip section headers like [Chorus], [Intro: Juice WRLD] or contributor banners
                if s.startswith("[") and s.endswith("]"):
                    continue
                if "Contributors" in s or s.endswith("Lyrics"):
                    continue
                lines.append(s)

            if len(lines) >= 6:
                return lines
        except Exception:
            continue
    return None


def detect_vocal_bounds(full_audio_path: str, total_duration: float) -> Tuple[float, float]:
    """
    Uses ffmpeg silencedetect on the isolated vocal frequency band (250Hz-4000Hz)
    to detect where vocals first enter and where vocals end in the audio file.
    """
    start_time = 2.0
    end_time = max(10.0, total_duration - 4.0)
    try:
        cmd = [
            "ffmpeg",
            "-i",
            full_audio_path,
            "-af",
            "highpass=f=280,lowpass=f=3800,silencedetect=noise=-30dB:d=0.6",
            "-f",
            "null",
            "-",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
        stderr = proc.stderr or ""
        # If silence starts at 0.0, the first silence_end is where the intro/vocals kick in
        first_end = re.search(r"silence_start:\s*0(?:\.0+)?.*?silence_end:\s*([0-9.]+)", stderr, re.S)
        if first_end:
            detected_start = float(first_end.group(1))
            if 0.5 <= detected_start <= 28.0:
                start_time = detected_start
        else:
            # Many hip-hop tracks have an 8-bar beat intro (~10-13s) before vocals
            start_time = min(10.5, total_duration * 0.06)

        # Check trailing silence at the end of the track
        all_starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", stderr)]
        if all_starts and all_starts[-1] > total_duration * 0.75:
            end_time = max(start_time + 15.0, all_starts[-1])
    except Exception:
        start_time = min(9.5, total_duration * 0.05)

    return start_time, end_time


def align_verified_lines_to_audio(
    lines: List[str], full_audio_path: str, total_duration: float
) -> List[Dict]:
    """
    Aligns 100% verified lyric lines to the audio file's vocal window,
    weighting each line's duration by word/syllable density so synced scrolling tracks naturally.
    """
    vocal_start, vocal_end = detect_vocal_bounds(full_audio_path, total_duration)
    span = max(15.0, vocal_end - vocal_start)

    weights = []
    for ln in lines:
        word_count = max(2, len(ln.split()))
        weights.append(float(word_count))

    total_weight = sum(weights) or 1.0
    synced_lines = []
    accum = 0.0
    for ln, w in zip(lines, weights):
        t = round(vocal_start + (accum / total_weight) * span, 2)
        synced_lines.append({"time": t, "text": ln})
        accum += w

    return synced_lines


def sanitize_filename(s: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", s).strip()
    return cleaned[:120] or "Track"


_TRACK_META_CACHE: Dict[str, dict] = {}


def is_primarily_english_text(text: str, raw_query: str = "") -> bool:
    """
    Returns True if text uses primarily English/Latin script and does not contain
    non-Latin scripts (Cyrillic, CJK, Arabic, Devanagari, Hangul, Thai, Hebrew, etc.)
    or explicit foreign-version tags (unless present in the user's query).
    """
    if not text:
        return True
    q_lower = (raw_query or "").lower()
    t_lower = text.lower()

    # Check for non-Latin scripts (code points > 0x024F excluding common punctuation)
    non_latin_count = 0
    alpha_count = 0
    for ch in text:
        if ch.isalpha():
            alpha_count += 1
            if ord(ch) > 0x024F:
                non_latin_count += 1
    if alpha_count > 0 and (non_latin_count / alpha_count) > 0.15:
        return False

    # Penalize foreign language dubs/versions unless user searched for them
    foreign_markers = [
        "versión en español",
        "version en espanol",
        "spanish version",
        "en español",
        "traducción",
        "português",
        "deutsche version",
        "version française",
        "japanese ver",
        "korean ver",
        "russian version",
        "türkçe",
        "italiano",
    ]
    for marker in foreign_markers:
        if marker in t_lower and marker not in q_lower:
            return False

    return True


def resolve_track_metadata_and_artwork(artist: str, title: str) -> dict:
    """
    Looks up the individual song's official high-res 600x600 cover art, album name,
    and release year from the US/English iTunes catalog so playlist imports never
    use the playlist cover art or leave a track without cover art.
    """
    clean_a = (artist or "").strip()
    clean_t = (title or "").strip()
    cache_key = f"{clean_a.lower()}|||{clean_t.lower()}"
    if cache_key in _TRACK_META_CACHE:
        return _TRACK_META_CACHE[cache_key]

    base_t = re.sub(r"\(.*?\)|\[.*?\]", "", clean_t).strip() or clean_t
    primary_a = re.split(r",|&|feat\.|ft\.", clean_a, flags=re.I)[0].strip() or clean_a

    for query_str in [f"{primary_a} {base_t}", f"{clean_a} {clean_t}", base_t]:
        if not query_str.strip():
            continue
        try:
            r = requests.get(
                "https://itunes.apple.com/search",
                params={
                    "term": query_str,
                    "entity": "song",
                    "country": "US",
                    "lang": "en_us",
                    "limit": 10,
                },
                timeout=5,
            )
            if not r.ok:
                continue
            items = r.json().get("results", [])
            if not items:
                continue

            norm_target_t = normalize_for_compare(base_t)
            norm_target_a = normalize_for_compare(primary_a)

            best_item = None
            best_score = -999
            for it in items:
                it_t = it.get("trackName") or ""
                it_a = it.get("artistName") or ""
                norm_it_t = normalize_for_compare(re.sub(r"\(.*?\)|\[.*?\]", "", it_t))
                norm_it_a = normalize_for_compare(it_a)
                score = 0
                if norm_target_t and (norm_target_t == norm_it_t):
                    score += 60
                elif norm_target_t and (norm_target_t in norm_it_t or norm_it_t in norm_target_t):
                    score += 35
                if norm_target_a and (norm_target_a in norm_it_a or norm_it_a in norm_target_a):
                    score += 50
                if is_primarily_english_text(f"{it_t} {it_a}"):
                    score += 20
                if (it.get("trackExplicitness") or "").lower() == "explicit":
                    score += 10
                if score > best_score:
                    best_score = score
                    best_item = it

            if best_item and best_score >= 30:
                art = (best_item.get("artworkUrl100") or "").replace("100x100bb", "600x600bb")
                album = (best_item.get("collectionName") or "").strip()
                year = (best_item.get("releaseDate") or "")[:4]
                if art:
                    res_meta = {
                        "artworkUrl": art,
                        "album": album,
                        "releaseYear": year,
                    }
                    _TRACK_META_CACHE[cache_key] = res_meta
                    return res_meta
        except Exception:
            pass

    empty_meta = {"artworkUrl": "", "album": "", "releaseYear": ""}
    return empty_meta


_SPOTIFY_TOKEN_CACHE: Dict[str, Any] = {"token": "", "expires_at": 0.0}


def get_spotify_anonymous_token(force_refresh: bool = False) -> str:
    now = time.time()
    if (
        not force_refresh
        and _SPOTIFY_TOKEN_CACHE.get("token")
        and now < float(_SPOTIFY_TOKEN_CACHE.get("expires_at") or 0.0) - 60.0
    ):
        return str(_SPOTIFY_TOKEN_CACHE["token"])

    for seed_playlist in ("37i9dQZF1DXcBWIGoYBM5M", "37i9dQZEVXbMDoHDwVN2tF"):
        try:
            r = requests.get(
                f"https://open.spotify.com/embed/playlist/{seed_playlist}",
                headers=HTTP_HEADERS,
                timeout=8,
            )
            if not r.ok:
                continue
            m = re.search(
                r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, flags=re.S
            )
            if not m:
                continue
            data = json.loads(m.group(1))
            session = (
                data.get("props", {})
                .get("pageProps", {})
                .get("state", {})
                .get("settings", {})
                .get("session", {})
            )
            tok = (session.get("accessToken") or "").strip()
            exp_ms = float(session.get("accessTokenExpirationTimestampMs") or 0.0)
            if tok:
                _SPOTIFY_TOKEN_CACHE["token"] = tok
                _SPOTIFY_TOKEN_CACHE["expires_at"] = (
                    (exp_ms / 1000.0) if exp_ms > 0 else (now + 1800.0)
                )
                return tok
        except Exception as e:
            print("Spotify anonymous token fetch warning:", e)
    return ""


def search_spotify_catalog(q: str, limit: int = 15) -> list:
    clean_q = (q or "").strip()
    if not clean_q:
        return []
    q_low = clean_q.lower()

    # 1. Primary: Query REAL Spotify Catalog via Pathfinder searchDesktop API
    for attempt in range(2):
        token = get_spotify_anonymous_token(force_refresh=(attempt > 0))
        if not token:
            break
        try:
            variables = {
                "searchTerm": clean_q,
                "offset": 0,
                "limit": max(25, limit * 2),
                "numberOfTopResults": 5,
                "includeAudiobooks": False,
                "includeArtistHasConcertsField": False,
                "includePreReleases": False,
                "includeLocalConcertsField": False,
            }
            extensions = {
                "persistedQuery": {
                    "version": 1,
                    "sha256Hash": "fcad5a3e0d5af727fb76966f06971c19cfa2275e6ff7671196753e008611873c",
                }
            }
            pf_res = requests.get(
                "https://api-partner.spotify.com/pathfinder/v1/query",
                params={
                    "operationName": "searchDesktop",
                    "variables": json.dumps(variables),
                    "extensions": json.dumps(extensions),
                },
                headers={
                    **HTTP_HEADERS,
                    "Authorization": f"Bearer {token}",
                },
                timeout=8,
            )
            if pf_res.status_code == 401 and attempt == 0:
                continue
            if pf_res.ok:
                pf_json = pf_res.json()
                raw_tracks = (
                    pf_json.get("data", {})
                    .get("searchV2", {})
                    .get("tracksV2", {})
                    .get("items", [])
                )
                if raw_tracks:
                    sp_seen: Dict[Tuple[str, str], Dict[str, Any]] = {}
                    sp_order: List[Tuple[str, str]] = []
                    for idx, wrapper in enumerate(raw_tracks):
                        t_data = (wrapper.get("item") or {}).get("data") or {}
                        if t_data.get("__typename") != "Track":
                            continue
                        t_id = t_data.get("id") or str(idx)
                        title = (t_data.get("name") or "").strip()
                        if not title:
                            continue
                        artist_items = (t_data.get("artists") or {}).get("items") or []
                        artist_names = [
                            (a.get("profile") or {}).get("name", "").strip()
                            for a in artist_items
                            if (a.get("profile") or {}).get("name")
                        ]
                        artist = ", ".join(artist_names) if artist_names else "Unknown Artist"
                        album_obj = t_data.get("albumOfTrack") or {}
                        album = (album_obj.get("name") or "").strip()
                        dur_ms = int(
                            (t_data.get("duration") or {}).get("totalMilliseconds") or 0
                        )
                        dur_sec = int(dur_ms / 1000)
                        if 0 < dur_sec < 35:
                            continue

                        is_explicit = (
                            (t_data.get("contentRating") or {}).get("label") == "EXPLICIT"
                        )
                        art_sources = (
                            (album_obj.get("coverArt") or {}).get("sources") or []
                        )
                        best_art = ""
                        if art_sources:
                            sorted_art = sorted(
                                art_sources,
                                key=lambda s: int(s.get("width") or 0),
                                reverse=True,
                            )
                            best_art = sorted_art[0].get("url") or ""

                        entry_obj = {
                            "id": f"sp-{t_id}",
                            "source": "spotify",
                            "title": title,
                            "artist": artist,
                            "album": album,
                            "duration": dur_sec,
                            "artworkUrl": best_art,
                            "releaseYear": "",
                            "isExplicit": is_explicit,
                            "url": f"ytsearch1:{artist} - {title} official audio",
                        }

                        dedup_key = (artist.lower().strip(), title.lower().strip())
                        if dedup_key in sp_seen:
                            # If Spotify returns both Clean and Explicit versions of the same song, keep the Explicit one
                            if is_explicit and not sp_seen[dedup_key].get("isExplicit"):
                                sp_seen[dedup_key] = entry_obj
                        else:
                            sp_seen[dedup_key] = entry_obj
                            sp_order.append(dedup_key)

                    sp_results = [sp_seen[k] for k in sp_order]
                    if sp_results:
                        return sp_results[:limit]
            break
        except Exception as e:
            print("Spotify Pathfinder searchDesktop warning:", e)
            break

    # 2. Fallback: Query iTunes Search API if Spotify Pathfinder is unreachable
    res = requests.get(
        "https://itunes.apple.com/search",
        params={
            "term": clean_q,
            "entity": "song",
            "country": "US",
            "lang": "en_us",
            "limit": 50,
        },
        headers={"Accept-Language": "en-US,en;q=0.9"},
        timeout=8,
    )
    raw_items = res.json().get("results", []) if res.ok else []

    seen = {}
    for idx, it in enumerate(raw_items):
        artist = (it.get("artistName") or "Unknown Artist").strip()
        title = (it.get("trackName") or "Unknown Title").strip()
        album = (it.get("collectionName") or "").strip()
        dur_sec = int((it.get("trackTimeMillis") or 0) / 1000)
        if 0 < dur_sec < 35:
            continue

        combined_low = f"{title} {artist} {album}".lower()
        knockoff_terms = (
            "karaoke",
            "tribute to",
            "originally performed by",
            "made famous by",
            "in the style of",
            "8-bit",
            "lullaby",
            "ringtone",
        )
        if any(kt in combined_low and kt not in q_low for kt in knockoff_terms):
            continue

        explicitness = (it.get("trackExplicitness") or "").lower()
        is_explicit_release = explicitness == "explicit"
        is_cleaned_release = explicitness == "cleaned"
        is_english = is_primarily_english_text(f"{title} {artist} {album}", clean_q)

        base_title = re.sub(r"\s*[\(\[][^)\]]*(?:explicit|clean|remaster|deluxe|version)[^)\]]*[\)\]]", "", title, flags=re.I).strip().lower()
        norm_key = (artist.lower().strip(), base_title)

        rank_score = 100 - idx
        if is_english:
            rank_score += 40
        if is_explicit_release:
            rank_score += 20
        elif is_cleaned_release:
            rank_score -= 10
        if q_low and (q_low in title.lower() or q_low in artist.lower()):
            rank_score += 25

        if norm_key in seen:
            prev_it, prev_exp, prev_score = seen[norm_key]
            if (is_explicit_release and not prev_exp) or (is_explicit_release == prev_exp and rank_score > prev_score):
                seen[norm_key] = (it, is_explicit_release, max(rank_score, prev_score))
        else:
            seen[norm_key] = (it, is_explicit_release, rank_score)

    sorted_pairs = sorted(
        seen.values(),
        key=lambda p: p[2],
        reverse=True,
    )

    results = []
    for it, is_explicit, _score in sorted_pairs[:limit]:
        art = (it.get("artworkUrl100") or "").replace("100x100bb", "600x600bb")
        title = it.get("trackName") or "Unknown Title"
        artist = it.get("artistName") or "Unknown Artist"
        album = it.get("collectionName") or ""
        dur = int((it.get("trackTimeMillis") or 0) / 1000)
        year = (it.get("releaseDate") or "")[:4]
        results.append(
            {
                "id": f"sp-{it.get('trackId')}",
                "source": "spotify",
                "title": title,
                "artist": artist,
                "album": album,
                "duration": dur,
                "artworkUrl": art,
                "releaseYear": year,
                "isExplicit": is_explicit,
                "url": f"ytsearch1:{artist} - {title} official audio",
            }
        )
    return results


FILEBROWSER_KEY_B64 = os.environ.get("FILEBROWSER_KEY_B64", "")
FILEBROWSER_PUBLIC_BASE = os.environ.get("FILEBROWSER_PUBLIC_BASE", "").rstrip("/")
PUBLIC_PLAYER_URL = os.environ.get("PUBLIC_PLAYER_URL", "").rstrip("/")


def create_filebrowser_jwt(custom_key_b64: str = "") -> str:
    raw_key = (custom_key_b64 or FILEBROWSER_KEY_B64).strip()
    if not raw_key:
        return ""
    secret = base64.b64decode(raw_key)

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    now = int(time.time())
    payload = b64url(
        json.dumps(
            {
                "user": {
                    "id": 1,
                    "username": "admin",
                    "perm": {"admin": True, "share": True, "download": True},
                },
                "exp": now + 3600,
                "iat": now,
                "iss": "File Browser",
            }
        ).encode("utf-8")
    )
    sig = b64url(
        hmac.new(secret, f"{header}.{payload}".encode("utf-8"), hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{sig}"


def resolve_filebrowser_share(
    song_id: str,
    expires: str = "1",
    unit: str = "hours",
    custom_share_url: str = "",
    custom_share_token: str = "",
    fallback_title: str = "",
    fallback_artist: str = "",
) -> dict:
    info = resolve_song_info(song_id, fallback_title, fallback_artist)
    if not info or not info.get("path"):
        raise RuntimeError("Track file path not found in server database.")

    rel_path = (info.get("path") or "").lstrip("/")
    if rel_path.startswith("external/") and not custom_share_url:
        fb_path = "external/MUSIC/" + rel_path[len("external/") :]
    else:
        fb_path = rel_path

    encoded_path = "/".join(urllib.parse.quote(part, safe="") for part in fb_path.split("/"))
    clean_custom_base = (custom_share_url or "").strip().rstrip("/")
    internal_fb_base = clean_custom_base if clean_custom_base else "http://filebrowser:80"
    public_fb_base = clean_custom_base if clean_custom_base else FILEBROWSER_PUBLIC_BASE

    token = custom_share_token.strip() if custom_share_token else create_filebrowser_jwt()
    headers = {"X-Auth": token}
    api_url = f"{internal_fb_base}/api/share/{encoded_path}"

    target_expires = str(expires).strip()
    if target_expires.lower() in ("never", "0", ""):
        fb_payload = {"expires": "", "unit": "days"}
        expires_label = "Never (Permanent)"
    else:
        fb_unit = unit if unit in ("hours", "days", "minutes", "months") else "hours"
        fb_payload = {"expires": target_expires, "unit": fb_unit}
        expires_label = f"{target_expires} {fb_unit}"

    # Clean up any existing shares for this file path so new expiration takes effect
    try:
        get_res = requests.get(api_url, headers=headers, timeout=5)
        if get_res.ok:
            existing = get_res.json()
            if isinstance(existing, list):
                for item in existing:
                    h = item.get("hash")
                    if h:
                        try:
                            requests.delete(f"{internal_fb_base}/api/share/{h}", headers=headers, timeout=3)
                        except Exception:
                            pass
    except Exception:
        pass

    post_res = requests.post(
        api_url,
        headers=headers,
        json=fb_payload,
        timeout=6,
    )
    if not post_res.ok:
        raise RuntimeError(f"FileBrowser share creation failed ({post_res.status_code})")

    post_data = post_res.json()
    share_hash = post_data.get("hash")
    expire_ts = int(post_data.get("expire") or 0)

    if not share_hash:
        raise RuntimeError("FileBrowser did not return a share hash.")

    player_base = PUBLIC_PLAYER_URL or public_fb_base or ""
    return {
        "status": "ok",
        "hash": share_hash,
        "songId": song_id,
        "shareUrl": f"{player_base}/?share={share_hash}&song={song_id}" if player_base else f"/?share={share_hash}&song={song_id}",
        "playerShareUrl": f"{player_base}/?share={share_hash}&song={song_id}" if player_base else f"/?share={share_hash}&song={song_id}",
        "rawFileUrl": f"{public_fb_base}/share/{share_hash}",
        "downloadUrl": f"{public_fb_base}/api/public/dl/{share_hash}",
        "title": info.get("title") or "Track",
        "artist": info.get("artist") or "Artist",
        "album": info.get("album") or info.get("title") or "Album",
        "path": f"/{fb_path}",
        "expire": expire_ts,
        "expiresText": expires_label,
    }


@app.post("/api/share/{song_id}")
async def create_song_share_link(
    song_id: str,
    expires: str = Query("1"),
    unit: str = Query("hours"),
    payload: Optional[Dict[str, Any]] = Body(default=None),
):
    body = payload or {}
    custom_url = str(body.get("shareServerUrl") or "").strip()
    custom_token = str(body.get("shareApiToken") or "").strip()
    fallback_title = str(body.get("title") or "").strip()
    fallback_artist = str(body.get("artist") or "").strip()
    loop = asyncio.get_running_loop()
    try:
        res = await loop.run_in_executor(
            None,
            resolve_filebrowser_share,
            song_id,
            expires,
            unit,
            custom_url,
            custom_token,
            fallback_title,
            fallback_artist,
        )
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/api/share/track/{share_hash}")
async def get_shared_track(share_hash: str, song_id: Optional[str] = Query(None)):
    clean_hash = share_hash.strip()
    if not clean_hash:
        return JSONResponse({"status": "error", "message": "Missing share hash"}, status_code=400)

    # 1. Verify with FileBrowser public share API (enforces expiration automatically)
    try:
        fb_res = requests.get(f"http://filebrowser:80/api/public/share/{clean_hash}", timeout=4)
        if not fb_res.ok:
            return JSONResponse(
                {"status": "error", "message": "This shared track has expired or does not exist."},
                status_code=404,
            )
        fb_data = fb_res.json()
    except Exception as e:
        return JSONResponse(
            {"status": "error", "message": f"Unable to verify share: {str(e)}"}, status_code=500
        )

    file_name = fb_data.get("name") or ""
    clean_stem = Path(file_name).stem
    title = clean_stem
    artist = "Unknown Artist"
    if " - " in clean_stem:
        parts = clean_stem.split(" - ", 1)
        artist = parts[0].strip()
        title = parts[1].strip()

    album = title
    duration = 180
    real_song_id = song_id or f"share-{clean_hash}"

    # Try resolving richer metadata from Navidrome SQLite if available
    if os.path.exists(NAVIDROME_DB):
        try:
            conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
            cur = conn.cursor()
            row = None
            if song_id:
                row = cur.execute(
                    "SELECT id, title, artist, album, duration FROM media_file WHERE id = ? LIMIT 1",
                    (song_id,),
                ).fetchone()
            if not row and file_name:
                row = cur.execute(
                    "SELECT id, title, artist, album, duration FROM media_file WHERE path LIKE ? OR LOWER(title) = ? LIMIT 1",
                    (f"%{file_name}", title.lower()),
                ).fetchone()
            conn.close()
            if row:
                real_song_id = row[0]
                title = row[1] or title
                artist = row[2] or artist
                album = row[3] or album
                duration = int(round(float(row[4] or 180)))
        except Exception:
            pass

    cover_url = f"/api/discover/cover?file={urllib.parse.quote(file_name)}&title={urllib.parse.quote(title)}&artist={urllib.parse.quote(artist)}"
    stream_url = f"{FILEBROWSER_PUBLIC_BASE}/api/public/dl/{clean_hash}"

    song_obj = {
        "id": real_song_id,
        "title": title,
        "artist": artist,
        "album": album,
        "duration": duration,
        "coverArt": cover_url,
        "directCoverUrl": cover_url,
        "directStreamUrl": stream_url,
        "isSharedTrack": True,
    }

    return JSONResponse(
        {
            "status": "ok",
            "hash": clean_hash,
            "song": song_obj,
            "streamUrl": stream_url,
            "fileName": file_name,
        }
    )


def parse_spotify_playlist_or_album(url: str) -> Tuple[str, List[Dict]]:
    """
    Extracts the FULL tracklist (no 100-song cap) from a public Spotify playlist or album URL
    via Spotify's embed __NEXT_DATA__ + Pathfinder pagination using the embed session token.
    """
    m = re.search(r"open\.spotify\.com/(playlist|album)/([a-zA-Z0-9]+)", url)
    if not m:
        return "", []
    kind, sp_id = m.group(1), m.group(2)
    embed_url = f"https://open.spotify.com/embed/{kind}/{sp_id}"
    r = requests.get(embed_url, headers=HTTP_HEADERS, timeout=12)
    if not r.ok:
        return "", []
    nd_match = re.search(
        r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, flags=re.S
    )
    if not nd_match:
        return "", []
    data = json.loads(nd_match.group(1))
    state = data.get("props", {}).get("pageProps", {}).get("state", {})
    entity = state.get("data", {}).get("entity", {})
    access_token = (
        state.get("settings", {}).get("session", {}).get("accessToken") or ""
    )
    playlist_name = entity.get("name") or entity.get("title") or "Spotify Playlist"
    cover_sources = entity.get("coverArt", {}).get("sources", [])
    album_art = cover_sources[0].get("url", "") if (cover_sources and kind == "album") else ""

    results: List[Dict] = []

    # 1. If playlist and we have an anonymous session token from embed, paginate through ALL tracks (no 100-track limit)
    if kind == "playlist" and access_token:
        try:
            offset = 0
            page_limit = 100
            total_count = None
            pf_headers = {
                **HTTP_HEADERS,
                "Authorization": f"Bearer {access_token}",
            }
            extensions = json.dumps(
                {
                    "persistedQuery": {
                        "version": 1,
                        "sha256Hash": "cd2275433b29f7316176e7b5b5e098ae7744724e1a52d63549c76636b3257749",
                    }
                }
            )
            while True:
                variables = json.dumps(
                    {
                        "uri": f"spotify:playlist:{sp_id}",
                        "offset": offset,
                        "limit": page_limit,
                    }
                )
                pf_res = requests.get(
                    "https://api-partner.spotify.com/pathfinder/v1/query",
                    params={
                        "operationName": "fetchPlaylistContents",
                        "variables": variables,
                        "extensions": extensions,
                    },
                    headers=pf_headers,
                    timeout=12,
                )
                if not pf_res.ok:
                    break
                pf_json = pf_res.json()
                content = (
                    pf_json.get("data", {})
                    .get("playlistV2", {})
                    .get("content", {})
                )
                if total_count is None:
                    total_count = int(content.get("totalCount") or 0)
                items = content.get("items") or []
                if not items:
                    break

                for idx, item in enumerate(items):
                    track_data = (item.get("itemV2") or {}).get("data") or {}
                    if track_data.get("__typename") != "Track":
                        continue
                    t_title = (track_data.get("name") or "").strip()
                    if not t_title:
                        continue
                    artist_items = (track_data.get("artists") or {}).get("items") or []
                    artist_names = [
                        (a.get("profile") or {}).get("name", "").strip()
                        for a in artist_items
                        if (a.get("profile") or {}).get("name")
                    ]
                    t_artist = ", ".join(artist_names) if artist_names else "Unknown Artist"
                    dur_ms = int(
                        (track_data.get("trackDuration") or {}).get("totalMilliseconds") or 0
                    )
                    t_dur = int(dur_ms / 1000)
                    if 0 < t_dur < 40:
                        continue
                    t_uid = item.get("uid") or track_data.get("uri") or f"{offset + idx}"
                    is_explicit = (
                        (track_data.get("contentRating") or {}).get("label") == "EXPLICIT"
                    )
                    album_obj = track_data.get("albumOfTrack") or {}
                    t_album = (album_obj.get("name") or "").strip()
                    art_sources = (album_obj.get("coverArt") or {}).get("sources") or []
                    best_art = ""
                    if art_sources:
                        sorted_art = sorted(
                            art_sources,
                            key=lambda s: int(s.get("width") or 0),
                            reverse=True,
                        )
                        best_art = sorted_art[0].get("url") or ""

                    track_art = (
                        best_art
                        or f"/api/discover/cover?title={urllib.parse.quote(t_title)}&artist={urllib.parse.quote(t_artist)}"
                    )
                    results.append(
                        {
                            "id": f"sp-pl-{sp_id}-{t_uid}",
                            "source": "spotify",
                            "title": t_title,
                            "artist": t_artist,
                            "album": t_album,
                            "duration": t_dur,
                            "artworkUrl": track_art,
                            "releaseYear": "",
                            "isExplicit": is_explicit,
                            "url": f"ytsearch1:{t_artist} - {t_title} explicit audio",
                        }
                    )

                offset += len(items)
                if total_count and offset >= total_count:
                    break
                if len(items) < page_limit:
                    break
        except Exception as e:
            print("Spotify Pathfinder full pagination warning (falling back to embed):", e)

    if results:
        return playlist_name, results

    # 2. Fallback to embed trackList (for albums or if Pathfinder fails)
    track_list = entity.get("trackList", [])
    for idx, tr in enumerate(track_list):
        t_title = tr.get("title") or "Track"
        t_artist = tr.get("subtitle") or "Artist"
        t_dur = int((tr.get("duration") or 0) / 1000)
        t_uid = tr.get("uid") or str(idx)
        is_explicit = bool(tr.get("isExplicit", False))
        track_art = (
            album_art
            if kind == "album" and album_art
            else f"/api/discover/cover?title={urllib.parse.quote(t_title)}&artist={urllib.parse.quote(t_artist)}"
        )
        results.append(
            {
                "id": f"sp-pl-{sp_id}-{t_uid}",
                "source": "spotify",
                "title": t_title,
                "artist": t_artist,
                "album": playlist_name if kind == "album" else "",
                "duration": t_dur,
                "artworkUrl": track_art,
                "releaseYear": "",
                "isExplicit": is_explicit,
                "url": f"ytsearch1:{t_artist} - {t_title} explicit audio",
            }
        )
    return playlist_name, results


def search_ytdlp_source(q: str, source: str, limit: int = 10) -> Tuple[bool, str, List[Dict]]:
    is_url = q.startswith("http://") or q.startswith("https://")
    if is_url:
        if "open.spotify.com/playlist/" in q or "open.spotify.com/album/" in q:
            pl_name, items = parse_spotify_playlist_or_album(q)
            return True, pl_name, items

        if "open.spotify.com/track" in q:
            track_m = re.search(r"open\.spotify\.com/track/([a-zA-Z0-9]+)", q)
            raw_title = "Spotify Track"
            artist_name = "Spotify Track"
            thumb = ""
            t_dur = 0
            is_explicit = True
            if track_m:
                sp_id = track_m.group(1)
                try:
                    embed_r = requests.get(
                        f"https://open.spotify.com/embed/track/{sp_id}",
                        headers=HTTP_HEADERS,
                        timeout=8,
                    )
                    if embed_r.ok:
                        nd = re.search(
                            r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
                            embed_r.text,
                            flags=re.S,
                        )
                        if nd:
                            nd_data = json.loads(nd.group(1))
                            ent = (
                                nd_data.get("props", {})
                                .get("pageProps", {})
                                .get("state", {})
                                .get("data", {})
                                .get("entity", {})
                            )
                            raw_title = ent.get("title") or ent.get("name") or raw_title
                            art_list = ent.get("artists") or []
                            if art_list:
                                artist_name = ", ".join(
                                    a.get("name") for a in art_list if a.get("name")
                                )
                            is_explicit = bool(ent.get("isExplicit", True))
                            t_dur = int((ent.get("duration") or 0) / 1000)
                            images = ent.get("visualIdentity", {}).get("image") or []
                            if images:
                                thumb = images[-1].get("url", "")
                except Exception as ex:
                    print(f"Error resolving Spotify track embed: {ex}")

            if not thumb or raw_title == "Spotify Track":
                try:
                    oembed = requests.get(
                        "https://open.spotify.com/oembed", params={"url": q}, timeout=8
                    ).json()
                    raw_title = oembed.get("title", raw_title)
                    thumb = thumb or oembed.get("thumbnail_url", "")
                except Exception:
                    pass

            return (
                False,
                "",
                [
                    {
                        "id": f"sp-url-{abs(hash(q))}",
                        "source": "spotify",
                        "title": raw_title,
                        "artist": artist_name,
                        "album": "Spotify",
                        "duration": t_dur,
                        "artworkUrl": thumb,
                        "releaseYear": "",
                        "isExplicit": is_explicit,
                        "url": f"ytsearch1:{artist_name} - {raw_title} explicit audio",
                    }
                ],
            )
        search_target = q
    else:
        prefix = "scsearch" if source == "soundcloud" else "ytsearch"
        search_target = f"{prefix}{limit}:{q}"

    ydl_opts = {
        "extract_flat": "in_playlist",
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(search_target, download=False)

    is_playlist = bool(
        is_url
        and isinstance(info, dict)
        and info.get("_type") == "playlist"
        and info.get("entries")
    )
    playlist_name = (
        (info.get("title") or "Imported Playlist") if is_playlist and isinstance(info, dict) else ""
    )

    entries = info.get("entries", [info]) if isinstance(info, dict) else []
    results = []
    iter_entries = entries if is_url else entries[:limit]
    for entry in iter_entries:
        if not entry:
            continue
        title = entry.get("title") or "Unknown Title"
        uploader = (
            entry.get("artist")
            or entry.get("uploader")
            or entry.get("channel")
            or "Unknown Artist"
        )
        if " - " in title and uploader in ("Unknown Artist", None, ""):
            parts = title.split(" - ", 1)
            uploader, title = parts[0].strip(), parts[1].strip()

        thumbs = entry.get("thumbnails") or []
        thumb = entry.get("thumbnail") or (thumbs[-1].get("url") if thumbs else "")
        webpage_url = entry.get("url") or entry.get("webpage_url") or ""
        if webpage_url and not webpage_url.startswith("http") and source == "youtube":
            webpage_url = f"https://www.youtube.com/watch?v={webpage_url}"

        results.append(
            {
                "id": f"{source}-{entry.get('id') or abs(hash(webpage_url))}",
                "source": source,
                "title": title,
                "artist": uploader,
                "album": entry.get("album") or "",
                "duration": int(entry.get("duration") or 0),
                "artworkUrl": thumb
                or f"/api/discover/cover?title={urllib.parse.quote(title)}&artist={urllib.parse.quote(uploader)}",
                "releaseYear": (entry.get("upload_date") or "")[:4],
                "url": webpage_url,
            }
        )

    if not is_url:
        results.sort(
            key=lambda item: (
                not is_primarily_english_text(
                    f"{item.get('title', '')} {item.get('artist', '')}", q
                ),
            )
        )
    return is_playlist, playlist_name, results


@app.get("/api/discover/search")
async def discover_search(
    q: str = Query(..., min_length=1),
    source: str = Query("spotify"),
):
    loop = asyncio.get_running_loop()
    try:
        if source == "spotify" and not q.startswith("http"):
            items = await loop.run_in_executor(None, search_spotify_catalog, q, 12)
            return JSONResponse({"isPlaylist": False, "playlistName": "", "results": items})
        else:
            is_pl, pl_name, items = await loop.run_in_executor(
                None, search_ytdlp_source, q, source, 10
            )
            return JSONResponse(
                {"isPlaylist": is_pl, "playlistName": pl_name, "results": items}
            )
    except Exception as e:
        return JSONResponse(
            {"isPlaylist": False, "playlistName": "", "results": [], "error": str(e)},
            status_code=500,
        )


def resolve_best_youtube_match(
    artist: str,
    title: str,
    expected_duration: int = 0,
    prefer_explicit: bool = True,
) -> str:
    """
    Finds the highest-confidence official studio YouTube audio matching the requested track and artist.
    Prioritizes the authentic original artist release ("Artist - Topic", VEVO, Official Audio)
    and exact duration match, while avoiding censored radio edits AND third-party "unfiltered/dirty"
    re-uploads or wrong tracks.
    """
    clean_artist = (artist or "").strip()
    clean_title = (title or "").strip()
    if not clean_artist or not clean_title:
        return f"ytsearch1:{clean_artist} {clean_title} official audio"

    # Strip Spotify/iTunes feature & remaster suffixes for core matching so official YouTube titles always match
    core_title = re.sub(
        r"\s*[\(\[][^)\]]*(?:feat\.|ft\.|with\s|remaster|deluxe|bonus|from\s)[^)\]]*[\)\]]",
        "",
        clean_title,
        flags=re.I,
    )
    core_title = re.sub(r"\s*-\s*(?:remastered|single|album|deluxe).*$", "", core_title, flags=re.I).strip()
    if not core_title:
        core_title = clean_title

    primary_artist = clean_artist.split(",")[0].split("&")[0].strip()

    # Fast 2-query lookup: official studio audio first, then exact artist - title
    queries = [
        f"ytsearch8:{primary_artist} - {core_title} official audio",
        f"ytsearch6:{clean_artist} - {clean_title}",
    ]

    ydl_opts = {
        "extract_flat": True,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }

    entries = []
    seen = set()
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            for q in queries:
                try:
                    info = ydl.extract_info(q, download=False)
                    for e in (info.get("entries") or []):
                        if e and e.get("id") and e.get("id") not in seen:
                            seen.add(e.get("id"))
                            entries.append(e)
                except Exception:
                    pass

        art_lower = primary_artist.lower()
        full_art_lower = clean_artist.lower()
        tit_lower = clean_title.lower()
        core_tit_lower = core_title.lower()

        best_score = -9999
        best_url = None

        for idx, e in enumerate(entries):
            if not e:
                continue
            e_title = (e.get("title") or "").lower()
            e_uploader = (e.get("uploader") or e.get("channel") or "").lower()
            e_dur = int(e.get("duration") or 0)
            views = int(e.get("view_count") or 0)
            v_id = e.get("id") or ""
            if not v_id:
                continue
            if 0 < e_dur < 38 or e_dur > 1200:
                continue

            score = max(0, 25 - idx * 2)

            # 1. Authentic Official Artist Channel / Auto-Generated Topic Channel Priority
            is_topic_channel = " - topic" in e_uploader or e_uploader.endswith("topic")
            if art_lower in e_uploader and is_topic_channel:
                score += 230  # YouTube Music auto-generated official studio master!
            elif art_lower in e_uploader and ("vevo" in e_uploader or "official" in e_uploader or e_uploader == art_lower):
                score += 195
            elif art_lower in e_uploader or full_art_lower in e_uploader:
                score += 145
            elif art_lower in e_title:
                score += 75
            else:
                score -= 150  # Artist not in uploader or title!

            # 2. Title Match (supports both full title and stripped core title)
            if tit_lower in e_title or core_tit_lower in e_title:
                score += 120
                if e_title == core_tit_lower or e_title == f"{art_lower} - {core_tit_lower}":
                    score += 45
            else:
                # Check word overlap for titles with punctuation differences
                title_words = [w for w in re.split(r"\W+", core_tit_lower) if len(w) > 2]
                if title_words and all(w in e_title for w in title_words):
                    score += 85
                else:
                    score -= 130

            # 3. Studio Audio & Original Version Priority (Avoid both censored radio edits AND sketchy "unfiltered" re-uploads)
            if prefer_explicit:
                for clean_word in [
                    "clean version",
                    "clean edit",
                    "clean audio",
                    "radio edit",
                    "censored",
                    "edited version",
                    "family friendly",
                    "kidz bop",
                ]:
                    if clean_word in e_title and clean_word not in tit_lower:
                        score -= 380

            # 4. Penalize unofficial edits, unfiltered/altered re-uploads, covers, slowed/reverb, sped up, live, karaoke
            for bad in [
                "unfiltered",
                "slowed",
                "reverb",
                "sped up",
                "nightcore",
                "8d audio",
                "bass boosted",
                "cover",
                "live at",
                "live from",
                "live performance",
                "karaoke",
                "instrumental",
                "reaction",
                "tutorial",
                "parody",
                "ai cover",
                " pitched",
            ]:
                if bad in e_title and bad not in tit_lower:
                    score -= 260

            if "remix" in e_title and "remix" not in tit_lower:
                score -= 180

            # 5. Official Audio / Canonical Popularity Bonus
            if "official audio" in e_title:
                score += 75
            elif "audio" in e_title:
                score += 35

            if views > 10_000_000:
                score += 80
            elif views > 1_000_000:
                score += 55
            elif views > 100_000:
                score += 30
            elif views > 10_000:
                score += 15

            # 6. Strict Duration Match against Spotify/iTunes original track duration
            if expected_duration > 0 and e_dur > 0:
                diff = abs(e_dur - expected_duration)
                if diff <= 3:
                    score += 120
                elif diff <= 8:
                    score += 75
                elif diff <= 18:
                    score += 25
                elif diff > 90:
                    score -= 320
                elif diff > 35:
                    score -= 160

            if score > best_score:
                best_score = score
                best_url = f"https://www.youtube.com/watch?v={v_id}"

        if best_url and best_score > 0:
            print(
                f"[Resolver] Picked official YouTube match (score={best_score}): {best_url} for '{clean_artist} - {clean_title}'"
            )
            return best_url
    except Exception as err:
        print("[Resolver] Error resolving best YouTube match:", err)

    return f"ytsearch1:{primary_artist} - {core_title} official audio"


def download_and_tag_worker(req: ImportRequest) -> dict:
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_artist = sanitize_filename(req.artist)
    safe_title = sanitize_filename(req.title)
    final_mp3_path = DOWNLOAD_DIR / f"{safe_artist} - {safe_title}.mp3"

    target_url = req.url
    if (
        not target_url
        or target_url.startswith("ytsearch")
        or req.source == "spotify"
        or "spotify.com" in target_url
    ):
        target_url = resolve_best_youtube_match(
            req.artist,
            req.title,
            getattr(req, "duration", 0) or 0,
            prefer_explicit=True,
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        out_tmpl = os.path.join(tmpdir, "download.%(ext)s")
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": out_tmpl,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }
            ],
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(target_url, download=True)
            if "entries" in info and info["entries"]:
                info = info["entries"][0]

        temp_mp3 = os.path.join(tmpdir, "download.mp3")
        if not os.path.exists(temp_mp3):
            for f in os.listdir(tmpdir):
                if f.endswith(".mp3"):
                    temp_mp3 = os.path.join(tmpdir, f)
                    break

        if not os.path.exists(temp_mp3):
            raise RuntimeError("Audio extraction failed to produce an MP3 file.")

        audio = MP3(temp_mp3, ID3=ID3)
        dur_secs = float(getattr(audio.info, "length", 0.0) or 0.0)
        if 0 < dur_secs < 40.0:
            raise RuntimeError(f"Track duration ({dur_secs:.1f}s) is under 40 seconds; skipped.")

        try:
            audio.add_tags()
        except ID3Error:
            pass

        # Resolve individual song's real album & official cover art when importing from playlists or missing metadata
        generic_albums = {"", "spotify", "soundcloud", "youtube", "imported playlist", "spotify playlist"}
        raw_album = (req.album or "").strip()
        raw_art = (req.artworkUrl or "").strip()
        resolved_meta = {"artworkUrl": "", "album": "", "releaseYear": ""}
        if (
            not raw_art
            or raw_art.startswith("/api/")
            or raw_album.lower() in generic_albums
        ):
            resolved_meta = resolve_track_metadata_and_artwork(req.artist, req.title)

        final_album = (
            resolved_meta.get("album")
            if raw_album.lower() in generic_albums and resolved_meta.get("album")
            else (raw_album if raw_album.lower() not in generic_albums else f"{req.title} - Single")
        )
        final_year = req.releaseYear or resolved_meta.get("releaseYear") or ""

        audio.tags.add(TIT2(encoding=3, text=req.title))
        audio.tags.add(TPE1(encoding=3, text=req.artist))
        audio.tags.add(TALB(encoding=3, text=final_album))
        if final_year:
            audio.tags.add(TDRC(encoding=3, text=str(final_year)))

        art_url = (
            (raw_art if (raw_art and not raw_art.startswith("/api/")) else "")
            or resolved_meta.get("artworkUrl")
            or info.get("thumbnail")
            or ""
        )
        embedded_cover_ok = False
        if art_url:
            try:
                art_res = requests.get(art_url, timeout=10)
                if art_res.ok and art_res.content:
                    img_bytes = art_res.content
                    mime = (art_res.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip().lower()
                    # Convert WebP thumbnails (e.g. YouTube) to standard JPEG so Navidrome and iOS always render them
                    if "webp" in mime or art_url.lower().endswith(".webp"):
                        webp_path = os.path.join(tmpdir, "cover.webp")
                        jpg_path = os.path.join(tmpdir, "cover.jpg")
                        with open(webp_path, "wb") as wf:
                            wf.write(img_bytes)
                        subprocess.run(
                            ["ffmpeg", "-y", "-i", webp_path, "-q:v", "2", jpg_path],
                            capture_output=True,
                            timeout=8,
                        )
                        if os.path.exists(jpg_path):
                            with open(jpg_path, "rb") as jf:
                                img_bytes = jf.read()
                            mime = "image/jpeg"
                    audio.tags.add(
                        APIC(
                            encoding=3,
                            mime=mime or "image/jpeg",
                            type=3,
                            desc="Cover",
                            data=img_bytes,
                        )
                    )
                    embedded_cover_ok = True
            except Exception as e:
                print("Cover art embed warning:", e)

        audio.save(v2_version=3)

        subprocess.run(["cp", "-f", temp_mp3, str(final_mp3_path)], check=True)
        os.chmod(str(final_mp3_path), 0o644)

    # Poll /data/navidrome.db for up to 3.5s so Navidrome's file watcher indexes the file and we can return its exact Navidrome songId
    try:
        os.utime(str(DOWNLOAD_DIR), None)
    except Exception:
        pass
    rel_nav_path = f"local/songs/{final_mp3_path.name}"
    nav_song = resolve_single_navidrome_song(final_mp3_path.name, req.title, req.artist, wait_seconds=3.5)

    resolved_art_url = resolved_meta.get("artworkUrl") or (
        raw_art if (raw_art and not raw_art.startswith("/api/")) else ""
    )
    direct_cover = (
        resolved_art_url
        or (f"/api/discover/cover?id={urllib.parse.quote(nav_song['id'])}&title={urllib.parse.quote(req.title)}&artist={urllib.parse.quote(req.artist)}" if nav_song else None)
        or f"/api/discover/cover?file={urllib.parse.quote(final_mp3_path.name)}&title={urllib.parse.quote(req.title)}&artist={urllib.parse.quote(req.artist)}"
    )
    direct_stream = f"/api/discover/stream?file={urllib.parse.quote(final_mp3_path.name)}"

    if nav_song:
        nav_song["directCoverUrl"] = direct_cover
        nav_song["directStreamUrl"] = direct_stream
    else:
        # Always provide a complete playable song object even if Navidrome's background scanner takes a few extra seconds
        fallback_id = f"local:{final_mp3_path.name}"
        nav_song = {
            "id": fallback_id,
            "title": req.title,
            "artist": req.artist,
            "album": final_album,
            "duration": int(round(dur_secs)) if dur_secs > 0 else (int(req.duration or 180)),
            "coverArt": direct_cover,
            "directCoverUrl": direct_cover,
            "directStreamUrl": direct_stream,
            "path": rel_nav_path,
        }

    return {
        "status": "ok",
        "title": req.title,
        "artist": req.artist,
        "album": final_album,
        "fileName": final_mp3_path.name,
        "filePath": str(final_mp3_path),
        "navidromePath": rel_nav_path,
        "navidromeSongId": nav_song["id"],
        "navidromeSong": nav_song,
        "directCoverUrl": direct_cover,
        "directStreamUrl": direct_stream,
        "embeddedCover": embedded_cover_ok,
    }


def resolve_single_navidrome_song(
    file_name: str, title: str, artist: str = "", wait_seconds: float = 0.0
) -> Optional[dict]:
    nav_db = Path(NAVIDROME_DB)
    if not nav_db.exists():
        return None
    deadline = time.time() + max(0.0, wait_seconds)
    rel_path = f"local/songs/{os.path.basename(file_name)}" if file_name else ""
    clean_title = (title or "").strip().lower()

    while True:
        try:
            conn = sqlite3.connect(f"file:{nav_db}?mode=ro", uri=True)
            cur = conn.cursor()
            row = None
            if rel_path:
                cur.execute(
                    "SELECT id, title, artist, album, duration FROM media_file WHERE path = ? LIMIT 1",
                    (rel_path,),
                )
                row = cur.fetchone()
            if not row and clean_title:
                cur.execute(
                    "SELECT id, title, artist, album, duration FROM media_file WHERE LOWER(title) = ? ORDER BY created_at DESC LIMIT 1",
                    (clean_title,),
                )
                row = cur.fetchone()
            conn.close()
            if row:
                return {
                    "id": row[0],
                    "title": row[1] or title,
                    "artist": row[2] or artist,
                    "album": row[3] or title,
                    "duration": int(round(float(row[4] or 180))),
                    "coverArt": row[0],
                    "directCoverUrl": f"/api/discover/cover?id={urllib.parse.quote(row[0])}",
                }
        except Exception:
            pass

        if time.time() >= deadline:
            break
        time.sleep(0.3)
    return None


@app.post("/api/discover/import")
async def discover_import(req: ImportRequest):
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(None, download_and_tag_worker, req)
        return JSONResponse(result)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/api/discover/resolve-songs")
async def resolve_imported_songs(payload: Dict[str, Any] = Body(...)):
    items = payload.get("items") or []
    wait_sec = float(payload.get("waitSeconds") or 2.5)

    def _worker():
        if wait_sec > 0:
            # Wait up to wait_sec until the last item appears in navidrome.db
            last_item = items[-1] if items else None
            if last_item:
                resolve_single_navidrome_song(
                    last_item.get("fileName") or "",
                    last_item.get("title") or "",
                    last_item.get("artist") or "",
                    wait_seconds=wait_sec,
                )
        resolved_songs = []
        resolved_ids = []
        seen = set()
        for it in items:
            found = resolve_single_navidrome_song(
                it.get("fileName") or "",
                it.get("title") or "",
                it.get("artist") or "",
                wait_seconds=0.4,
            )
            if found and found["id"] not in seen:
                seen.add(found["id"])
                resolved_ids.append(found["id"])
                resolved_songs.append(found)
        return {"status": "ok", "songIds": resolved_ids, "songs": resolved_songs}

    loop = asyncio.get_running_loop()
    res = await loop.run_in_executor(None, _worker)
    return JSONResponse(res)


def _is_safe_music_path(candidate: Path) -> bool:
    try:
        resolved = candidate.resolve()
        music_root = Path("/music").resolve()
        if not resolved.is_relative_to(music_root):
            return False
        return resolved.suffix.lower() in {".mp3", ".flac", ".m4a", ".wav", ".ogg", ".opus", ".aac"}
    except Exception:
        return False


def resolve_audio_file_path(
    file_param: Optional[str] = None,
    song_id: Optional[str] = None,
    title: Optional[str] = None,
    artist: Optional[str] = None,
) -> Optional[Path]:
    """Resolves local audio file across downloads and Navidrome library."""
    # 1. Clean file parameter
    if file_param:
        clean = file_param.replace("local:", "").strip().lstrip("/")
        safe_name = os.path.basename(clean)
        if safe_name:
            target = DOWNLOAD_DIR / safe_name
            if target.exists() and _is_safe_music_path(target):
                return target
        target2 = Path("/music") / clean
        if target2.exists() and _is_safe_music_path(target2):
            return target2

    # 2. Check song_id
    if song_id:
        if song_id.startswith("local:"):
            clean = song_id.replace("local:", "").strip()
            target = DOWNLOAD_DIR / os.path.basename(clean)
            if target.exists():
                return target
        elif os.path.exists(NAVIDROME_DB):
            try:
                conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
                cur = conn.cursor()
                row = cur.execute(
                    "SELECT path FROM media_file WHERE id = ? LIMIT 1", (song_id,)
                ).fetchone()
                conn.close()
                if row and row[0]:
                    p = Path("/music") / row[0]
                    if p.exists():
                        return p
            except Exception:
                pass

    # 3. Check title / artist
    clean_t = (title or "").strip().lower()
    clean_a = (artist or "").strip().lower()
    if clean_t and os.path.exists(NAVIDROME_DB):
        try:
            conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
            cur = conn.cursor()
            row = None
            if clean_a and clean_a != "unknown artist":
                row = cur.execute(
                    "SELECT path FROM media_file WHERE LOWER(title) = ? AND LOWER(artist) = ? ORDER BY created_at DESC LIMIT 1",
                    (clean_t, clean_a),
                ).fetchone()
            if not row:
                row = cur.execute(
                    "SELECT path FROM media_file WHERE LOWER(title) = ? ORDER BY created_at DESC LIMIT 1",
                    (clean_t,),
                ).fetchone()
            conn.close()
            if row and row[0]:
                p = Path("/music") / row[0]
                if p.exists():
                    return p
        except Exception:
            pass

    if clean_t and DOWNLOAD_DIR.exists():
        for f in DOWNLOAD_DIR.glob("*.mp3"):
            fname_lower = f.name.lower()
            if clean_t in fname_lower:
                return f

    return None


@app.api_route("/api/discover/cover", methods=["GET", "HEAD"])
async def get_audio_cover(
    file: Optional[str] = Query(None),
    id: Optional[str] = Query(None),
    title: Optional[str] = Query(None),
    artist: Optional[str] = Query(None),
):
    target = resolve_audio_file_path(file, id, title, artist)
    if target and target.exists():
        # Try extracting ID3 APIC (MP3)
        try:
            audio = MP3(str(target))
            if audio.tags:
                apics = [t for t in audio.tags.values() if getattr(t, "FrameID", None) == "APIC"]
                if apics and apics[0].data:
                    return Response(
                        content=apics[0].data,
                        media_type=apics[0].mime or "image/jpeg",
                        headers={"Cache-Control": "public, max-age=604800, immutable"},
                    )
        except Exception:
            pass

        # Try FLAC picture
        try:
            from mutagen.flac import FLAC
            flac = FLAC(str(target))
            if flac.pictures:
                return Response(
                    content=flac.pictures[0].data,
                    media_type=flac.pictures[0].mime or "image/jpeg",
                    headers={"Cache-Control": "public, max-age=604800, immutable"},
                )
        except Exception:
            pass

    # Fallback: resolve official track cover art via iTunes catalog by title & artist
    lookup_title = (title or "").strip()
    lookup_artist = (artist or "").strip()
    if (not lookup_title or not lookup_artist) and id and os.path.exists(NAVIDROME_DB):
        try:
            conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
            cur = conn.cursor()
            row = cur.execute(
                "SELECT title, artist FROM media_file WHERE id = ? LIMIT 1", (id,)
            ).fetchone()
            conn.close()
            if row:
                lookup_title = lookup_title or (row[0] or "")
                lookup_artist = lookup_artist or (row[1] or "")
        except Exception:
            pass

    if not lookup_title and target:
        stem = target.stem
        if " - " in stem:
            p_a, p_t = stem.split(" - ", 1)
            lookup_artist = lookup_artist or p_a.strip()
            lookup_title = p_t.strip()
        else:
            lookup_title = stem

    if lookup_title:
        loop = asyncio.get_running_loop()
        meta = await loop.run_in_executor(
            None, resolve_track_metadata_and_artwork, lookup_artist, lookup_title
        )
        art_url = meta.get("artworkUrl") or ""
        if art_url:
            try:
                art_res = await loop.run_in_executor(
                    None, lambda: requests.get(art_url, timeout=6)
                )
                if art_res.ok and art_res.content:
                    mime = (art_res.headers.get("Content-Type") or "image/jpeg").split(";")[0].strip()
                    # Self-heal local MP3 file if it was missing an embedded cover
                    if target and target.exists() and target.suffix.lower() == ".mp3":
                        try:
                            audio = MP3(str(target), ID3=ID3)
                            try:
                                audio.add_tags()
                            except ID3Error:
                                pass
                            audio.tags.add(
                                APIC(
                                    encoding=3,
                                    mime=mime or "image/jpeg",
                                    type=3,
                                    desc="Cover",
                                    data=art_res.content,
                                )
                            )
                            audio.save(v2_version=3)
                        except Exception:
                            pass
                    return Response(
                        content=art_res.content,
                        media_type=mime or "image/jpeg",
                        headers={"Cache-Control": "public, max-age=604800, immutable"},
                    )
            except Exception:
                pass

    return Response(status_code=404)


@app.api_route("/api/discover/stream", methods=["GET", "HEAD"])
async def stream_imported_file(
    file: Optional[str] = Query(None),
    id: Optional[str] = Query(None),
    title: Optional[str] = Query(None),
    artist: Optional[str] = Query(None),
):
    target = resolve_audio_file_path(file, id, title, artist)
    if not target or not target.exists():
        return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)
    return FileResponse(str(target), media_type="audio/mpeg", filename=target.name)


# ============================================================================
# FAST LIBRARY SEARCH & SERVER RESYNC API (Direct SQLite & Recent Importer files)
# ============================================================================

def _sqlite_search_songs(q: str, limit: int = 80) -> List[Dict[str, Any]]:
    clean_q = q.strip()
    if not clean_q or not os.path.exists(NAVIDROME_DB):
        return []

    tokens = [t.lower() for t in clean_q.split() if t]
    if not tokens:
        return []

    pending_disk_songs = []
    try:
        if DOWNLOAD_DIR.exists():
            for f in DOWNLOAD_DIR.glob("*.mp3"):
                fname_lower = f.name.lower()
                if all(t in fname_lower for t in tokens):
                    title = f.stem
                    artist = "Unknown Artist"
                    if " - " in f.stem:
                        parts = f.stem.split(" - ", 1)
                        artist = parts[0].strip()
                        title = parts[1].strip()
                    pending_disk_songs.append({
                        "id": f"local:{f.name}",
                        "title": title,
                        "artist": artist,
                        "album": title,
                        "duration": 180,
                        "path": f"local/songs/{f.name}",
                        "directStreamUrl": f"/api/discover/stream?file={urllib.parse.quote(f.name)}",
                        "directCoverUrl": f"/api/discover/cover?file={urllib.parse.quote(f.name)}",
                        "coverArt": f"/api/discover/cover?file={urllib.parse.quote(f.name)}",
                        "isPendingScan": True,
                        "score": 95,
                    })
    except Exception as e:
        print("Error checking local songs dir:", e)

    results = []
    try:
        conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        clauses = []
        params = []
        for t in tokens:
            p = f"%{t}%"
            clauses.append("(title LIKE ? OR artist LIKE ? OR album LIKE ? OR path LIKE ?)")
            params.extend([p, p, p, p])

        sql = f"""
            SELECT id, title, artist, album, duration, year, track_number, bit_rate, size, suffix, path, created_at
            FROM media_file
            WHERE {' AND '.join(clauses)}
            LIMIT {limit * 2}
        """
        rows = cur.execute(sql, params).fetchall()
        conn.close()

        clean_lower = clean_q.lower()
        for r in rows:
            path = r["path"] or ""
            title = r["title"] or ""
            artist = r["artist"] or ""
            album = r["album"] or ""
            dur = int(round(float(r["duration"] or 180)))
            created_at_str = str(r["created_at"] or "")

            score = 30
            t_lower = title.lower()
            a_lower = artist.lower()
            alb_lower = album.lower()

            if t_lower == clean_lower:
                score = 100
            elif t_lower.startswith(clean_lower):
                score = 85
            elif clean_lower in t_lower:
                score = 75
            elif clean_lower in a_lower:
                score = 60
            elif clean_lower in alb_lower:
                score = 45
            elif all(tok in t_lower for tok in tokens):
                score = 70
            elif all(tok in (t_lower + " " + a_lower) for tok in tokens):
                score = 55

            if "2026-" in created_at_str:
                score += 15

            results.append({
                "id": r["id"],
                "title": title,
                "artist": artist,
                "album": album,
                "duration": dur,
                "year": r["year"],
                "track": r["track_number"],
                "bitRate": r["bit_rate"],
                "size": r["size"],
                "suffix": r["suffix"],
                "coverArt": r["id"],
                "directCoverUrl": f"/api/discover/cover?id={urllib.parse.quote(r['id'])}",
                "path": path,
                "score": score,
            })
    except Exception as e:
        print("Error querying navidrome.db for search:", e)

    nav_paths = {item["path"] for item in results}
    for p_song in pending_disk_songs:
        if p_song["path"] not in nav_paths:
            results.append(p_song)

    results.sort(key=lambda x: x.get("score", 0), reverse=True)
    return results[:limit]


def _sqlite_get_recent_songs(limit: int = 100) -> List[Dict[str, Any]]:
    if not os.path.exists(NAVIDROME_DB):
        return []
    try:
        conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        rows = cur.execute(
            """
            SELECT id, title, artist, album, duration, year, track_number, bit_rate, size, suffix, path, created_at
            FROM media_file
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        conn.close()

        songs = []
        for r in rows:
            songs.append({
                "id": r["id"],
                "title": r["title"] or "",
                "artist": r["artist"] or "",
                "album": r["album"] or "",
                "duration": int(round(float(r["duration"] or 180))),
                "year": r["year"],
                "track": r["track_number"],
                "bitRate": r["bit_rate"],
                "size": r["size"],
                "suffix": r["suffix"],
                "coverArt": r["id"],
                "directCoverUrl": f"/api/discover/cover?id={urllib.parse.quote(r['id'])}",
                "path": r["path"],
            })
        return songs
    except Exception as e:
        print("Error fetching recent songs from navidrome.db:", e)
        return []


@app.get("/api/library/search")
async def library_search(q: str = Query("", min_length=1), limit: int = Query(80, ge=1, le=300)):
    loop = asyncio.get_running_loop()
    songs = await loop.run_in_executor(None, _sqlite_search_songs, q, limit)
    return JSONResponse({"status": "ok", "query": q, "count": len(songs), "songs": songs})


@app.get("/api/library/recent")
async def library_recent(limit: int = Query(100, ge=1, le=500)):
    loop = asyncio.get_running_loop()
    songs = await loop.run_in_executor(None, _sqlite_get_recent_songs, limit)
    return JSONResponse({"status": "ok", "count": len(songs), "songs": songs})


@app.post("/api/library/resync")
async def library_resync(payload: Dict[str, Any] = Body(default={})):
    username = payload.get("username")
    token = payload.get("token")
    salt = payload.get("salt")
    full_scan = payload.get("fullScan", True)

    scan_started = False
    msg = "Resync signal sent"

    if username and token and salt:
        try:
            target_url = (
                f"http://navidrome:4533/rest/startScan.view"
                f"?u={urllib.parse.quote(str(username))}&t={token}&s={salt}"
                f"&v=1.16.1&c=LiquidAudio&f=json&fullScan={'true' if full_scan else 'false'}"
            )
            resp = requests.get(target_url, timeout=5)
            if resp.ok:
                data = resp.json()
                scan_started = data.get("subsonic-response", {}).get("status") == "ok"
                msg = "Navidrome scan started" if scan_started else "Navidrome scan queued"
        except Exception as e:
            print("Error triggering Navidrome scan via Subsonic:", e)

    # Touch music directory to trigger inotify watcher
    try:
        if DOWNLOAD_DIR.exists():
            os.utime(str(DOWNLOAD_DIR), None)
    except Exception:
        pass

    total_count = 0
    try:
        conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
        total_count = conn.cursor().execute("SELECT COUNT(*) FROM media_file").fetchone()[0]
        conn.close()
    except Exception:
        pass

    return JSONResponse({
        "status": "ok",
        "scanStarted": scan_started,
        "message": msg,
        "totalSongs": total_count,
        "timestamp": time.time(),
    })


@app.get("/api/library/scan-status")
async def library_scan_status(
    username: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
    salt: Optional[str] = Query(None),
):
    scanning = False
    count = 0
    folder_count = 0

    if username and token and salt:
        try:
            target_url = (
                f"http://navidrome:4533/rest/getScanStatus.view"
                f"?u={urllib.parse.quote(str(username))}&t={token}&s={salt}&v=1.16.1&c=LiquidAudio&f=json"
            )
            resp = requests.get(target_url, timeout=4)
            if resp.ok:
                data = resp.json()
                st = data.get("subsonic-response", {}).get("scanStatus", {})
                scanning = bool(st.get("scanning"))
                count = int(st.get("count") or 0)
                folder_count = int(st.get("folderCount") or 0)
        except Exception as e:
            print("Error checking Navidrome scan status:", e)

    total_in_db = 0
    try:
        conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
        total_in_db = conn.cursor().execute("SELECT COUNT(*) FROM media_file").fetchone()[0]
        conn.close()
    except Exception:
        pass

    return JSONResponse({
        "status": "ok",
        "scanning": scanning,
        "count": count,
        "folderCount": folder_count,
        "totalInDb": total_in_db,
    })


@app.post("/api/library/delete-song")
async def delete_song_from_database(req: DeleteSongRequest):
    if not req.songId or not req.songId.strip():
        raise HTTPException(status_code=400, detail="Missing songId")

    song_id = req.songId.strip()
    safe_cache_id = re.sub(r"[^a-zA-Z0-9_\-.]", "", os.path.basename(song_id))
    if not os.path.exists(NAVIDROME_DB):
        raise HTTPException(status_code=500, detail="Navidrome database not found")

    song_info = None
    file_deleted = False
    file_path = None

    try:
        conn = sqlite3.connect(NAVIDROME_DB, timeout=30.0)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        row = cur.execute(
            "SELECT id, title, artist, album, path, album_id, artist_id FROM media_file WHERE id = ?",
            (song_id,),
        ).fetchone()

        if not row:
            conn.close()
            # If not found in DB, still ensure lyrics cache is cleaned
            cache_file = CACHE_DIR / f"{safe_cache_id}.json"
            if safe_cache_id and cache_file.exists():
                try:
                    cache_file.unlink(missing_ok=True)
                except Exception:
                    pass
            return JSONResponse({
                "status": "not_found",
                "message": f"Song {song_id} not found in database (may already have been deleted).",
                "songId": song_id,
                "fileDeleted": False,
            })

        song_info = dict(row)
        rel_path = (song_info.get("path") or "").lstrip("/")

        # 1. Delete physical audio file if requested
        if req.deleteFile and rel_path:
            full_audio_path = os.path.join("/music", rel_path)
            file_path = full_audio_path
            try:
                if _is_safe_music_path(Path(full_audio_path)) and os.path.exists(full_audio_path):
                    os.remove(full_audio_path)
                    file_deleted = True

                base_without_ext, _ = os.path.splitext(full_audio_path)
                lrc_path = base_without_ext + ".lrc"
                if Path(lrc_path).resolve().is_relative_to(Path("/music").resolve()) and os.path.exists(lrc_path):
                    try:
                        os.remove(lrc_path)
                    except Exception:
                        pass
            except Exception as e:
                print(f"Error removing physical audio file {full_audio_path}: {e}")

        # 2. Delete database records
        try:
            cur.execute("PRAGMA foreign_keys = ON")
            cur.execute("DELETE FROM annotation WHERE item_id = ?", (song_id,))
            cur.execute("DELETE FROM playlist_tracks WHERE media_file_id = ?", (song_id,))
            cur.execute("DELETE FROM media_file_artists WHERE media_file_id = ?", (song_id,))
            cur.execute("DELETE FROM scrobbles WHERE media_file_id = ?", (song_id,))
            cur.execute("DELETE FROM scrobble_buffer WHERE media_file_id = ?", (song_id,))
            cur.execute("DELETE FROM media_file WHERE id = ?", (song_id,))
            conn.commit()
        finally:
            conn.close()

    except HTTPException:
        raise
    except Exception as e:
        print(f"Database error while deleting song {song_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error deleting song: {str(e)}")

    # 3. Delete cached lyrics
    cache_file = CACHE_DIR / f"{safe_cache_id}.json"
    if safe_cache_id and cache_file.exists():
        try:
            cache_file.unlink(missing_ok=True)
        except Exception:
            pass

    # 4. Clean up any filebrowser shares
    if song_info and song_info.get("path"):
        try:
            rel_p = (song_info.get("path") or "").lstrip("/")
            if rel_p.startswith("external/"):
                fb_p = "external/MUSIC/" + rel_p[len("external/") :]
            else:
                fb_p = rel_p
            token = create_filebrowser_jwt()
            headers = {"X-Auth": token}
            encoded_p = "/".join(urllib.parse.quote(part, safe="") for part in fb_p.split("/"))
            api_url = f"http://filebrowser:80/api/share/{encoded_p}"
            get_res = requests.get(api_url, headers=headers, timeout=3)
            if get_res.ok:
                existing = get_res.json()
                if isinstance(existing, list):
                    for item in existing:
                        h = item.get("hash")
                        if h:
                            requests.delete(f"http://filebrowser:80/api/share/{h}", headers=headers, timeout=2)
        except Exception:
            pass

    # 5. Touch DOWNLOAD_DIR to poke inotify
    try:
        if DOWNLOAD_DIR.exists():
            os.utime(str(DOWNLOAD_DIR), None)
    except Exception:
        pass

    # 6. Optional trigger scan if credentials provided
    scan_triggered = False
    if req.username and req.token and req.salt:
        try:
            target_url = (
                f"http://navidrome:4533/rest/startScan.view"
                f"?u={urllib.parse.quote(str(req.username))}&t={req.token}&s={req.salt}"
                f"&v=1.16.1&c=LiquidAudio&f=json&fullScan=false"
            )
            r = requests.get(target_url, timeout=4)
            if r.ok:
                scan_triggered = True
        except Exception:
            pass

    return JSONResponse({
        "status": "ok",
        "message": f"Successfully deleted '{song_info.get('title')}' by '{song_info.get('artist')}' from database and disk.",
        "songId": song_id,
        "title": song_info.get("title"),
        "artist": song_info.get("artist"),
        "fileDeleted": file_deleted,
        "filePath": file_path,
        "scanTriggered": scan_triggered,
    })


@app.delete("/api/library/song/{song_id}")
async def delete_song_by_id(
    song_id: str,
    delete_file: bool = Query(True),
    username: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
    salt: Optional[str] = Query(None),
):
    req = DeleteSongRequest(
        songId=song_id,
        deleteFile=delete_file,
        username=username,
        token=token,
        salt=salt,
    )
    return await delete_song_from_database(req)


# ============================================================================
# LIVE LISTENING PRESENCE & "LISTEN ALONG" HUB
# ============================================================================
LIVE_PRESENCE_STORE: Dict[str, Dict[str, Any]] = {}
PUBLIC_ARTWORK_CACHE: Dict[str, str] = {}


@app.post("/api/presence/heartbeat")
async def presence_heartbeat(payload: Dict[str, Any] = Body(...)):
    raw_user = str(payload.get("username") or "").strip()
    raw_session_id = str(payload.get("sessionId") or "").strip()
    display_name = str(payload.get("displayName") or raw_user or "Listener").strip()
    if not raw_user and not raw_session_id:
        return JSONResponse({"status": "ignored"})

    user_key = sanitize_username(raw_user or display_name)
    session_key = sanitize_username(raw_session_id) if raw_session_id else user_key
    now = time.time()

    existing = LIVE_PRESENCE_STORE.get(session_key) or {}
    allow_join = payload.get("allowJoin")
    if allow_join is None:
        allow_join = existing.get("allowJoin", True)

    song = payload.get("song")
    if not song and existing.get("song"):
        song = existing.get("song")
    is_playing = bool(payload.get("isPlaying", False))
    cur_time = float(payload.get("currentTime") or 0.0)
    duration = float(
        payload.get("duration")
        or (song.get("duration") if isinstance(song, dict) else 0)
        or 0.0
    )
    playback_rate = float(payload.get("playbackRate") or 1.0)
    listening_to = payload.get("listeningToHost")

    LIVE_PRESENCE_STORE[session_key] = {
        "sessionId": session_key,
        "username": display_name or raw_user or "Listener",
        "accountUsername": raw_user or display_name,
        "userKey": user_key,
        "allowJoin": bool(allow_join),
        "isPlaying": is_playing,
        "currentTime": cur_time,
        "duration": duration,
        "playbackRate": playback_rate,
        "listeningToHost": sanitize_username(listening_to) if listening_to else None,
        "song": song,
        "updatedAt": now,
    }
    return JSONResponse({"status": "ok", "serverTime": now, "sessionId": session_key})


@app.get("/api/presence/active")
async def get_active_presence():
    now = time.time()
    active_users = []
    # Map host (by sessionId or userKey or username) -> list of listener names
    listeners_by_host: Dict[str, List[str]] = {}
    for s_key, entry in list(LIVE_PRESENCE_STORE.items()):
        age = now - float(entry.get("updatedAt") or 0)
        if age > 300:
            continue
        host_key = entry.get("listeningToHost")
        if host_key:
            listener_label = entry.get("username") or s_key
            listeners_by_host.setdefault(host_key, []).append(listener_label)

    for s_key, entry in list(LIVE_PRESENCE_STORE.items()):
        age = now - float(entry.get("updatedAt") or 0)
        if age > 300 or not entry.get("song"):
            continue
        base_time = float(entry.get("currentTime") or 0.0)
        rate = float(entry.get("playbackRate") or 1.0)
        dur = float(entry.get("duration") or 0.0)
        live_time = base_time + (age * rate if entry.get("isPlaying") else 0.0)
        if dur > 0 and live_time > dur:
            live_time = dur

        u_key = entry.get("userKey") or s_key
        u_name_key = sanitize_username(entry.get("username") or u_key)
        combined_listeners = list(
            dict.fromkeys(
                (listeners_by_host.get(s_key) or [])
                + (listeners_by_host.get(u_key) or [])
                + (listeners_by_host.get(u_name_key) or [])
            )
        )

        active_users.append(
            {
                "sessionId": s_key,
                "username": entry.get("username") or u_key,
                "accountUsername": entry.get("accountUsername") or entry.get("username") or u_key,
                "userKey": u_key,
                "allowJoin": bool(entry.get("allowJoin", True)),
                "isPlaying": bool(entry.get("isPlaying", False)),
                "currentTime": round(live_time, 2),
                "duration": dur,
                "playbackRate": rate,
                "listeningToHost": entry.get("listeningToHost"),
                "listeners": combined_listeners,
                "song": entry.get("song"),
                "secondsAgo": round(age, 1),
            }
        )

    active_users.sort(key=lambda x: (not x["isPlaying"], x["secondsAgo"]))
    return JSONResponse({"status": "ok", "users": active_users, "serverTime": now})


# ============================================================================
# PRIVACY-SAFE DISCORD RICH PRESENCE (RPC) ENDPOINTS (NO SERVER LINKS EXPOSED)
# ============================================================================
def resolve_public_artwork_url(title: str, artist: str) -> str:
    cache_key = f"{(artist or '').strip().lower()}::{(title or '').strip().lower()}"
    if cache_key in PUBLIC_ARTWORK_CACHE:
        return PUBLIC_ARTWORK_CACHE[cache_key]

    query = f"{artist} {title}".strip()
    if not query:
        return ""
    try:
        res = requests.get(
            "https://itunes.apple.com/search",
            params={"term": query, "media": "music", "entity": "song", "limit": 3},
            timeout=4,
        )
        if res.ok:
            items = res.json().get("results") or []
            if items:
                art = (items[0].get("artworkUrl100") or "").replace("100x100bb", "600x600bb")
                if art.startswith("https://"):
                    PUBLIC_ARTWORK_CACHE[cache_key] = art
                    return art
    except Exception:
        pass
    return ""


DISCORD_RPC_STATE: Dict[str, Dict[str, Any]] = {}
DISCORD_BRIDGE_HEARTBEATS: Dict[str, float] = {}


@app.get("/api/discord-rpc/artwork")
async def discord_rpc_artwork(title: str = Query(""), artist: str = Query("")):
    loop = asyncio.get_running_loop()
    art_url = await loop.run_in_executor(None, resolve_public_artwork_url, title, artist)
    return JSONResponse({"status": "ok", "artworkUrl": art_url})


@app.post("/api/discord-rpc/sync")
async def discord_rpc_sync(payload: Dict[str, Any] = Body(...)):
    user = sanitize_username(str(payload.get("username") or "guest")) or "guest"
    enabled = bool(payload.get("enabled", True))
    title = str(payload.get("title") or "").strip()
    artist = str(payload.get("artist") or "").strip()
    art_url = str(payload.get("artworkUrl") or "").strip()
    if enabled and title and not art_url:
        loop = asyncio.get_running_loop()
        art_url = await loop.run_in_executor(None, resolve_public_artwork_url, title, artist)

    state = {
        "username": user,
        "enabled": enabled,
        "title": title,
        "artist": artist,
        "album": str(payload.get("album") or "LiquidPlayer").strip(),
        "currentTime": float(payload.get("currentTime") or 0),
        "duration": float(payload.get("duration") or 0),
        "isPlaying": bool(payload.get("isPlaying")) and enabled,
        "artworkUrl": art_url,
        "updatedAt": time.time(),
    }
    DISCORD_RPC_STATE[user] = state
    DISCORD_RPC_STATE["__latest__"] = state

    now = time.time()
    bridge_online = (
        (now - DISCORD_BRIDGE_HEARTBEATS.get(user, 0) < 12.0)
        or (now - DISCORD_BRIDGE_HEARTBEATS.get("__any__", 0) < 12.0)
    )
    return JSONResponse({"status": "ok", "bridgeConnected": bridge_online, "artworkUrl": art_url})


@app.get("/api/discord-rpc/poll")
async def discord_rpc_poll(
    username: str = Query(""),
    ipc_connected: bool = Query(True),
):
    now = time.time()
    user = sanitize_username(username) if username else ""
    if ipc_connected:
        if user:
            DISCORD_BRIDGE_HEARTBEATS[user] = now
        DISCORD_BRIDGE_HEARTBEATS["__any__"] = now

    state = None
    if user and user in DISCORD_RPC_STATE:
        cand = DISCORD_RPC_STATE[user]
        if now - cand.get("updatedAt", 0) < 30.0:
            state = cand
    if not state and "__latest__" in DISCORD_RPC_STATE:
        cand = DISCORD_RPC_STATE["__latest__"]
        if now - cand.get("updatedAt", 0) < 30.0:
            state = cand

    # Fallback to live presence store if user is actively playing
    if not state:
        target_p = LIVE_PRESENCE_STORE.get(user) if user else None
        if not target_p and LIVE_PRESENCE_STORE:
            fresh = [v for v in LIVE_PRESENCE_STORE.values() if now - v.get("updatedAt", 0) < 20.0]
            if fresh:
                fresh.sort(key=lambda x: x.get("updatedAt", 0), reverse=True)
                target_p = fresh[0]
        if target_p and target_p.get("song"):
            s_obj = target_p["song"]
            t_str = str(s_obj.get("title") or "")
            a_str = str(s_obj.get("artist") or "")
            loop = asyncio.get_running_loop()
            art_url = await loop.run_in_executor(None, resolve_public_artwork_url, t_str, a_str)
            state = {
                "username": target_p.get("username", user or "guest"),
                "enabled": True,
                "title": t_str,
                "artist": a_str,
                "album": str(s_obj.get("album") or "LiquidPlayer"),
                "currentTime": float(target_p.get("currentTime") or 0),
                "duration": float(target_p.get("duration") or s_obj.get("duration") or 0),
                "isPlaying": bool(target_p.get("isPlaying")),
                "artworkUrl": art_url,
                "updatedAt": target_p.get("updatedAt", now),
            }

    return JSONResponse({"status": "ok", "state": state})


@app.get("/api/discord-rpc/bridge-script")
async def download_discord_rpc_bridge_script(
    app_id: str = Query("463151177836658699"),
    format: str = Query("bat"),
    username: str = Query(""),
    server_url: str = Query(""),
):
    clean_app_id = re.sub(r"[^0-9]", "", app_id or "463151177836658699")
    if clean_app_id == "1308164392817295410" or not clean_app_id:
        clean_app_id = "463151177836658699"
    clean_user = sanitize_username(username)
    clean_server = (server_url or PUBLIC_PLAYER_URL or "http://localhost:8080").strip().rstrip("/")
    py_code = '''"""
LiquidPlayer Privacy-Safe Local Discord Rich Presence (RPC) Bridge
- Shows "Listening to LiquidPlayer" on your Discord profile
- Displays Song Title, Artist, Album Cover Art, and Live Song Progress Bar
- 100% PRIVATE: Zero links, zero buttons, and zero server URLs are ever attached!
"""
import json
import os
import struct
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

CLIENT_ID = "''' + clean_app_id + '''"
SERVER_URL = "''' + clean_server + '''"
TARGET_USER = "''' + clean_user + '''"
LATEST_STATE = {"active": False, "updatedAt": 0}
LAST_LOCAL_PUSH_AT = 0.0


class DiscordIPC:
    def __init__(self, client_id: str):
        self.client_id = client_id
        self.pipe = None
        self.lock = threading.Lock()

    def connect(self) -> bool:
        try:
            if sys.platform == "win32":
                for i in range(10):
                    path = f"\\\\\\\\?\\\\pipe\\\\discord-ipc-{i}"
                    if os.path.exists(path):
                        try:
                            # IMPORTANT: Must use "r+b" on Windows named pipes ("w+b" fails with Errno 22 Invalid Argument!)
                            self.pipe = open(path, "r+b", buffering=0)
                            break
                        except Exception:
                            continue
            else:
                import socket
                for env_key in ("XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"):
                    base = os.environ.get(env_key, "/tmp")
                    for i in range(10):
                        for prefix in ("", "app/com.discordapp.Discord/", "snap.discord/"):
                            p = os.path.join(base, prefix, f"discord-ipc-{i}")
                            if os.path.exists(p):
                                try:
                                    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                                    s.connect(p)
                                    self.pipe = s
                                    break
                                except Exception:
                                    pass
                        if self.pipe:
                            break
                    if self.pipe:
                        break
            if not self.pipe:
                return False
            self._send(0, {"v": 1, "client_id": self.client_id})
            resp = self._recv()
            if resp and resp.get("evt") == "ERROR":
                print("[LiquidPlayer RPC] Discord IPC handshake notice:", resp)
                self.pipe = None
                return False
            print("[LiquidPlayer RPC] Connected to Discord Desktop!")
            return True
        except Exception as e:
            self.pipe = None
            return False

    def _send(self, op: int, payload: dict):
        raw = json.dumps(payload).encode("utf-8")
        header = struct.pack("<II", op, len(raw))
        if hasattr(self.pipe, "sendall"):
            self.pipe.sendall(header + raw)
        else:
            self.pipe.write(header + raw)
            self.pipe.flush()

    def _recv(self):
        if hasattr(self.pipe, "recv"):
            header = self.pipe.recv(8)
        else:
            header = self.pipe.read(8)
        if not header or len(header) < 8:
            return None
        op, length = struct.unpack("<II", header)
        if hasattr(self.pipe, "recv"):
            data = self.pipe.recv(length)
        else:
            data = self.pipe.read(length)
        return json.loads(data.decode("utf-8", errors="ignore"))

    def update_activity(self, state: dict):
        with self.lock:
            if not self.pipe and not self.connect():
                return
            try:
                if not state or not state.get("isPlaying") or not state.get("title"):
                    self._send(1, {"cmd": "SET_ACTIVITY", "args": {"pid": os.getpid(), "activity": None}, "nonce": str(time.time())})
                    self._recv()
                    return

                now = int(time.time())
                cur = int(float(state.get("currentTime") or 0))
                dur = int(float(state.get("duration") or 0))
                start_ts = now - cur
                end_ts = start_ts + dur if dur > 0 else None

                timestamps = {"start": start_ts}
                if end_ts and end_ts > start_ts:
                    timestamps["end"] = end_ts

                assets = {
                    "large_text": str(state.get("album") or "LiquidPlayer")[:128],
                }
                if str(state.get("artworkUrl") or "").startswith("https://"):
                    assets["large_image"] = state["artworkUrl"]

                activity = {
                    "name": "LiquidPlayer",
                    "type": 2,
                    "details": str(state.get("title"))[:128],
                    "state": f"by {state.get('artist', 'Unknown Artist')}"[:128],
                    "timestamps": timestamps,
                    "assets": assets,
                }
                self._send(
                    1,
                    {
                        "cmd": "SET_ACTIVITY",
                        "args": {"pid": os.getpid(), "activity": activity},
                        "nonce": str(time.time()),
                    },
                )
                self._recv()
            except Exception:
                self.pipe = None


ipc = DiscordIPC(CLIENT_ID)


def cloud_poll_worker():
    global LAST_LOCAL_PUSH_AT
    while True:
        try:
            if not ipc.pipe:
                ipc.connect()
            q = urllib.parse.urlencode({
                "username": TARGET_USER,
                "ipc_connected": "true" if ipc.pipe else "false",
            })
            req = urllib.request.Request(
                f"{SERVER_URL}/api/discord-rpc/poll?{q}",
                headers={"User-Agent": "LiquidPlayer-RPC-Bridge/2.0"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    payload = json.loads(resp.read().decode("utf-8", errors="ignore"))
                    remote_state = payload.get("state")
                    # Use cloud-synced state whenever browser direct-localhost push isn't active
                    if time.time() - LAST_LOCAL_PUSH_AT > 4.5:
                        if remote_state:
                            ipc.update_activity(remote_state)
                        else:
                            ipc.update_activity({"isPlaying": False})
        except Exception:
            pass
        time.sleep(3.0)


class RPCHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Request-Private-Network")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not ipc.pipe:
            ipc.connect()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok", "connected": bool(ipc.pipe)}).encode("utf-8"))

    def do_POST(self):
        global LAST_LOCAL_PUSH_AT
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8", errors="ignore")
        try:
            data = json.loads(body) if body else {}
            if self.path == "/clear":
                ipc.update_activity({"isPlaying": False})
            else:
                LAST_LOCAL_PUSH_AT = time.time()
                ipc.update_activity(data)
            ok = True
        except Exception:
            ok = False
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok" if ok else "error", "connected": bool(ipc.pipe)}).encode("utf-8"))


if __name__ == "__main__":
    print("======================================================")
    print(" LiquidPlayer Discord Rich Presence Bridge (v2.0)")
    print(" Local Port: 127.0.0.1:6473 + Cloud HTTPS Sync Active")
    print(" Privacy Mode: ON (No URLs or server links attached)")
    print("======================================================")
    ipc.connect()
    t = threading.Thread(target=cloud_poll_worker, daemon=True)
    t.start()
    server = HTTPServer(("127.0.0.1", 6473), RPCHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
'''

    chosen_format = (format or "bat").lower()
    if chosen_format == "bat":
        launcher_header = '''@echo off
rem = r"""
setlocal EnableDelayedExpansion
title LiquidPlayer Discord RPC Bridge
cls
echo ======================================================
echo  LiquidPlayer Privacy-Safe Discord Rich Presence Bridge
echo  Starting local bridge on http://127.0.0.1:6473 ...
echo ======================================================
echo.

where python >nul 2>&1
if %errorlevel% equ 0 (
    python -x "%~f0" %*
    goto :done
)

where py >nul 2>&1
if %errorlevel% equ 0 (
    py -3 -x "%~f0" %*
    goto :done
)

where python3 >nul 2>&1
if %errorlevel% equ 0 (
    python3 -x "%~f0" %*
    goto :done
)

if exist "%LOCALAPPDATA%/Programs/Python/Python313/python.exe" (
    "%LOCALAPPDATA%/Programs/Python/Python313/python.exe" -x "%~f0" %*
    goto :done
)
if exist "%LOCALAPPDATA%/Programs/Python/Python312/python.exe" (
    "%LOCALAPPDATA%/Programs/Python/Python312/python.exe" -x "%~f0" %*
    goto :done
)
if exist "%LOCALAPPDATA%/Programs/Python/Python311/python.exe" (
    "%LOCALAPPDATA%/Programs/Python/Python311/python.exe" -x "%~f0" %*
    goto :done
)
if exist "%LOCALAPPDATA%/Programs/Python/Python310/python.exe" (
    "%LOCALAPPDATA%/Programs/Python/Python310/python.exe" -x "%~f0" %*
    goto :done
)
if exist "%ProgramFiles%/Python313/python.exe" (
    "%ProgramFiles%/Python313/python.exe" -x "%~f0" %*
    goto :done
)
if exist "%ProgramFiles%/Python312/python.exe" (
    "%ProgramFiles%/Python312/python.exe" -x "%~f0" %*
    goto :done
)
if exist "%ProgramFiles%/Python311/python.exe" (
    "%ProgramFiles%/Python311/python.exe" -x "%~f0" %*
    goto :done
)

echo [ERROR] Python 3 was not detected on your PC!
echo.
echo Please install Python 3 (free) from https://www.python.org/downloads/
echo (Important: Check "Add python.exe to PATH" during installation)
echo.
pause
:done
endlocal
exit /b %errorlevel%
"""
'''
        final_content = launcher_header + py_code
        filename = "LiquidPlayer-Discord-RPC.bat"
        media_type = "application/x-bat"
    elif chosen_format in ("command", "sh"):
        launcher_header = '''#!/bin/bash
""":"
if command -v python3 >/dev/null 2>&1; then
    exec python3 "$0" "$@"
elif command -v python >/dev/null 2>&1; then
    exec python "$0" "$@"
else
    echo "Python 3 is required. Please install Python from https://www.python.org."
    read -p "Press Enter to exit..."
    exit 1
fi
exit 0
":"""
'''
        final_content = launcher_header + py_code
        filename = "LiquidPlayer-Discord-RPC.command" if chosen_format == "command" else "LiquidPlayer-Discord-RPC.sh"
        media_type = "application/x-sh"
    else:
        final_content = "#!/usr/bin/env python3\n" + py_code
        filename = "LiquidPlayer-Discord-RPC.py"
        media_type = "text/x-python"

    return Response(
        content=final_content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


def init_wrapped_db():
    WRAPPED_DB_DIR.mkdir(parents=True, exist_ok=True)
    WRAPPED_USERS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(WRAPPED_SQLITE_PATH))
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_wrapped (
                username TEXT PRIMARY KEY,
                stats_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def sanitize_username(username: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9._-]", "_", (username or "default").strip().lower())
    return clean or "default"


def _enrich_wrapped_stats(stats: dict) -> dict:
    """Enriches missing coverArt or realId in wrapped stats from media_file."""
    songs = stats.get("songStats") or {}
    if not songs or not os.path.exists(NAVIDROME_DB):
        return stats
    try:
        conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
        cur = conn.cursor()
        for sid, s in songs.items():
            current_art = s.get("coverArt")
            if (
                not current_art
                or current_art == "None"
                or str(current_art).startswith("local:")
                or str(current_art).startswith("imported-")
            ):
                t = (s.get("title") or "").strip().lower()
                a = (s.get("artist") or "").strip().lower()
                if t:
                    row = None
                    if a and a != "unknown artist":
                        row = cur.execute(
                            "SELECT id, album_id FROM media_file WHERE LOWER(title) = ? AND LOWER(artist) = ? ORDER BY created_at DESC LIMIT 1",
                            (t, a),
                        ).fetchone()
                    if not row:
                        row = cur.execute(
                            "SELECT id, album_id FROM media_file WHERE LOWER(title) = ? ORDER BY created_at DESC LIMIT 1",
                            (t,),
                        ).fetchone()
                    if row:
                        s["coverArt"] = row[0]
                        if str(sid).startswith("imported-") or str(sid).startswith("local:"):
                            s["realId"] = row[0]
        conn.close()
    except Exception as e:
        print("Error enriching wrapped stats:", e)
    return stats


def load_user_wrapped_stats(username: str) -> dict:
    user_key = sanitize_username(username)
    default_stats = {
        "totalSecondsListened": 0,
        "totalPlays": 0,
        "dailyStreak": 1,
        "lastListenDate": "",
        "songStats": {},
        "artistStats": {},
    }
    init_wrapped_db()
    conn = sqlite3.connect(str(WRAPPED_SQLITE_PATH))
    stats_data = None
    try:
        row = conn.execute(
            "SELECT stats_json FROM user_wrapped WHERE username = ?", (user_key,)
        ).fetchone()
        if row and row[0]:
            stats_data = json.loads(row[0])
    except Exception:
        pass
    finally:
        conn.close()

    if not stats_data:
        json_file = WRAPPED_USERS_DIR / f"{user_key}.json"
        if json_file.exists():
            try:
                stats_data = json.loads(json_file.read_text(encoding="utf-8"))
            except Exception:
                pass

    if stats_data:
        return _enrich_wrapped_stats(stats_data)
    return default_stats


def merge_and_save_user_wrapped_stats(username: str, incoming: dict) -> dict:
    user_key = sanitize_username(username)
    existing = load_user_wrapped_stats(user_key)

    merged_songs: Dict[str, dict] = {}
    old_songs = existing.get("songStats") or {}
    new_songs = incoming.get("songStats") or {}

    all_song_ids = set(old_songs.keys()) | set(new_songs.keys())
    for sid in all_song_ids:
        s_old = old_songs.get(sid) or {}
        s_new = new_songs.get(sid) or {}
        merged_songs[sid] = {
            "id": sid,
            "title": s_new.get("title") or s_old.get("title") or "Unknown Track",
            "artist": s_new.get("artist") or s_old.get("artist") or "Unknown Artist",
            "album": s_new.get("album") or s_old.get("album") or "",
            "coverArt": s_new.get("coverArt") or s_old.get("coverArt"),
            "plays": max(int(s_old.get("plays") or 0), int(s_new.get("plays") or 0)),
            "seconds": max(float(s_old.get("seconds") or 0.0), float(s_new.get("seconds") or 0.0)),
            "lastPlayedAt": max(
                int(s_old.get("lastPlayedAt") or 0), int(s_new.get("lastPlayedAt") or 0)
            ),
        }

    # Recompute artistStats and totals from merged songStats so multi-device sync is 100% consistent
    merged_artists: Dict[str, dict] = {}
    calc_plays = 0
    calc_seconds = 0.0
    for s in merged_songs.values():
        p = int(s.get("plays") or 0)
        sec = float(s.get("seconds") or 0.0)
        calc_plays += p
        calc_seconds += sec
        art_name = s.get("artist") or "Unknown Artist"
        if art_name not in merged_artists:
            merged_artists[art_name] = {"artist": art_name, "plays": 0, "seconds": 0.0}
        merged_artists[art_name]["plays"] += p
        merged_artists[art_name]["seconds"] += sec

    total_plays = max(
        calc_plays,
        int(existing.get("totalPlays") or 0),
        int(incoming.get("totalPlays") or 0),
    )
    total_seconds = max(
        calc_seconds,
        float(existing.get("totalSecondsListened") or 0.0),
        float(incoming.get("totalSecondsListened") or 0.0),
    )
    daily_streak = max(
        1,
        int(existing.get("dailyStreak") or 1),
        int(incoming.get("dailyStreak") or 1),
    )
    last_date = max(
        str(existing.get("lastListenDate") or ""),
        str(incoming.get("lastListenDate") or ""),
    )

    merged_payload = {
        "username": user_key,
        "totalSecondsListened": round(total_seconds, 2),
        "totalPlays": total_plays,
        "dailyStreak": daily_streak,
        "lastListenDate": last_date,
        "songStats": merged_songs,
        "artistStats": merged_artists,
        "updatedAt": int(time.time() * 1000),
    }

    init_wrapped_db()
    raw_json = json.dumps(merged_payload, indent=2)
    conn = sqlite3.connect(str(WRAPPED_SQLITE_PATH))
    try:
        conn.execute(
            """
            INSERT INTO user_wrapped (username, stats_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                stats_json = excluded.stats_json,
                updated_at = excluded.updated_at
            """,
            (user_key, raw_json, merged_payload["updatedAt"]),
        )
        conn.commit()
    finally:
        conn.close()

    json_file = WRAPPED_USERS_DIR / f"{user_key}.json"
    json_file.write_text(raw_json, encoding="utf-8")
    return merged_payload


@app.get("/api/wrapped/{username}")
async def get_user_wrapped(username: str):
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, load_user_wrapped_stats, username)
    return JSONResponse({"status": "ok", "username": sanitize_username(username), "stats": data})


@app.post("/api/wrapped/{username}")
async def sync_user_wrapped(username: str, payload: Dict[str, Any] = Body(...)):
    loop = asyncio.get_running_loop()
    stats_body = payload.get("stats") if isinstance(payload.get("stats"), dict) else payload
    merged = await loop.run_in_executor(
        None, merge_and_save_user_wrapped_stats, username, stats_body
    )
    return JSONResponse({"status": "ok", "username": sanitize_username(username), "stats": merged})


@app.get("/api/wrapped-users")
async def list_wrapped_users():
    users = set()
    if WRAPPED_USERS_DIR.exists():
        for f in WRAPPED_USERS_DIR.glob("*.json"):
            users.add(f.stem.lower())
    try:
        conn = sqlite3.connect(str(WRAPPED_SQLITE_PATH))
        cur = conn.cursor()
        for row in cur.execute("SELECT username FROM user_wrapped"):
            if row[0]:
                users.add(str(row[0]).strip().lower())
        conn.close()
    except Exception:
        pass
    try:
        if os.path.exists(NAVIDROME_DB):
            conn = sqlite3.connect(f"file:{NAVIDROME_DB}?mode=ro", uri=True)
            cur = conn.cursor()
            for row in cur.execute("SELECT user_name FROM user"):
                if row[0]:
                    users.add(str(row[0]).strip().lower())
            conn.close()
    except Exception:
        pass
    return JSONResponse({"status": "ok", "users": sorted([u for u in users if u])})


@app.on_event("startup")
async def startup_event():
    init_wrapped_db()
    # Purge any old v1/v2 Whisper-only cached files so songs automatically upgrade to v3 Hybrid Exact Lyrics
    for f in CACHE_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("engineVersion") != LYRIC_ENGINE_VERSION:
                f.unlink()
        except Exception:
            pass
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, get_model)


@app.get("/api/lyrics/{song_id}")
async def get_cached_lyrics(
    song_id: str,
    title: str = Query(""),
    artist: str = Query(""),
    duration: float = Query(180.0),
):
    safe_key = _safe_cache_key(song_id)
    cache_file = CACHE_DIR / f"{safe_key}.json"
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
            if data.get("engineVersion") == LYRIC_ENGINE_VERSION:
                return JSONResponse(data)
        except Exception:
            pass

    info = resolve_song_info(song_id, title, artist, duration)
    if info:
        embedded = parse_embedded_navidrome_lyrics(info.get("lyrics", ""))
        if embedded:
            payload = {
                "songId": song_id,
                "syncedLines": embedded["syncedLines"],
                "plainText": embedded["plainText"],
                "source": "embedded-tag",
                "engineVersion": LYRIC_ENGINE_VERSION,
            }
            cache_file.write_text(json.dumps(payload), encoding="utf-8")
            return JSONResponse(payload)

    return JSONResponse({"songId": song_id, "status": "not_cached"}, status_code=404)


@app.get("/api/lyrics/stream/{song_id}")
async def stream_transcribe_song(
    song_id: str,
    force: bool = Query(False),
    title: str = Query(""),
    artist: str = Query(""),
    duration: float = Query(180.0),
):
    safe_key = _safe_cache_key(song_id)
    cache_file = CACHE_DIR / f"{safe_key}.json"
    if not force and cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if cached.get("engineVersion") == LYRIC_ENGINE_VERSION:
                async def cached_gen():
                    for line in cached.get("syncedLines", []):
                        yield f"data: {json.dumps({'type': 'segment', 'line': line})}\n\n"
                    yield f"data: {json.dumps({'type': 'done', 'result': cached})}\n\n"

                return StreamingResponse(cached_gen(), media_type="text/event-stream")
        except Exception:
            pass

    info = resolve_song_info(song_id, title, artist, duration)
    if not info:
        async def err_gen():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Track not found in Navidrome DB'})}\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    if not force:
        embedded = parse_embedded_navidrome_lyrics(info.get("lyrics", ""))
        if embedded:
            payload = {
                "songId": song_id,
                "syncedLines": embedded["syncedLines"],
                "plainText": embedded["plainText"],
                "source": "embedded-tag",
                "engineVersion": LYRIC_ENGINE_VERSION,
            }
            cache_file.write_text(json.dumps(payload), encoding="utf-8")

            async def emb_gen():
                yield f"data: {json.dumps({'type': 'done', 'result': payload})}\n\n"

            return StreamingResponse(emb_gen(), media_type="text/event-stream")

    rel_path = info.get("path") or ""
    full_audio_path = os.path.join("/music", rel_path) if rel_path else ""
    raw_artist = info.get("artist") or artist or "Artist"
    raw_title = info.get("title") or title or "Track"
    total_duration = float(info.get("duration") or duration or 180.0)

    async def hybrid_lyric_generator():
        yield f"data: {json.dumps({'type': 'status', 'message': 'Matching exact verified lyrics & syncing with audio...'})}\n\n"
        loop = asyncio.get_running_loop()

        clean_artist, candidates = clean_track_queries(raw_artist, raw_title, rel_path)

        # Tier 1: Exact Synced LRC lookup (LRCLIB with strict artist + title + duration verification)
        lrc_hit = await loop.run_in_executor(
            None, fetch_lrclib_synced, clean_artist, candidates, total_duration
        )
        if lrc_hit:
            payload = {
                "songId": song_id,
                "syncedLines": lrc_hit["syncedLines"],
                "plainText": lrc_hit["plainText"],
                "source": "verified-lrc",
                "engineVersion": LYRIC_ENGINE_VERSION,
            }
            cache_file.write_text(json.dumps(payload), encoding="utf-8")
            yield f"data: {json.dumps({'type': 'done', 'result': payload})}\n\n"
            return

        # Tier 2: Genius 100% Verified Lyrics (handles both released songs & unreleased Juice WRLD leaks)
        # aligned to the audio file's vocal intro/outro bounds
        genius_lines = await loop.run_in_executor(
            None, fetch_genius_verified_lines, clean_artist, candidates
        )
        if genius_lines:
            yield f"data: {json.dumps({'type': 'status', 'message': 'Found 100% verified lyrics • Aligning timestamps to audio file...'})}\n\n"
            aligned_lines = await loop.run_in_executor(
                None,
                align_verified_lines_to_audio,
                genius_lines,
                full_audio_path,
                total_duration,
            )
            payload = {
                "songId": song_id,
                "syncedLines": aligned_lines,
                "plainText": "\n".join(genius_lines),
                "source": "verified-genius",
                "engineVersion": LYRIC_ENGINE_VERSION,
            }
            cache_file.write_text(json.dumps(payload), encoding="utf-8")
            yield f"data: {json.dumps({'type': 'done', 'result': payload})}\n\n"
            return

        # Tier 3: Local Acoustic AI Transcription fallback (for private/unindexed audio files)
        if not os.path.exists(full_audio_path):
            yield f"data: {json.dumps({'type': 'error', 'message': f'Audio file not found at {rel_path}'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'status', 'message': 'Unindexed track — isolating vocals & transcribing audio...'})}\n\n"
        queue: asyncio.Queue = asyncio.Queue()
        cancelled = False

        def whisper_worker():
            try:
                model = get_model()
                synced_lines = []
                plain_parts = []
                prompt = f"{clean_artist} - {candidates[0] if candidates else raw_title}, clear song lyrics:"

                offset = 0.0
                window_sizes = [20.0] + [30.0] * 25

                for win_size in window_sizes:
                    if cancelled or offset >= total_duration:
                        break
                    dur = min(win_size, total_duration - offset)
                    if dur <= 0.5:
                        break

                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp_wav:
                        cmd = [
                            "ffmpeg",
                            "-y",
                            "-ss",
                            str(offset),
                            "-t",
                            str(dur),
                            "-i",
                            full_audio_path,
                            "-af",
                            "highpass=f=220,lowpass=f=4000,afftdn=nf=-20,dynaudnorm",
                            "-ar",
                            "16000",
                            "-ac",
                            "1",
                            tmp_wav.name,
                        ]
                        subprocess.run(
                            cmd,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                        )

                        segments, _ = model.transcribe(
                            tmp_wav.name,
                            language="en",
                            beam_size=5,
                            best_of=5,
                            vad_filter=True,
                            vad_parameters=dict(
                                min_silence_duration_ms=250,
                                speech_pad_ms=200,
                                threshold=0.32,
                            ),
                            condition_on_previous_text=False,
                            initial_prompt=prompt,
                        )

                        for seg in segments:
                            if cancelled:
                                break
                            text = seg.text.strip()
                            if not text or len(text) < 2:
                                continue
                            abs_start = round(offset + float(seg.start), 2)
                            if synced_lines and synced_lines[-1]["text"].lower() == text.lower():
                                continue
                            line_obj = {"time": abs_start, "text": text}
                            synced_lines.append(line_obj)
                            plain_parts.append(text)
                            loop.call_soon_threadsafe(
                                queue.put_nowait,
                                {"type": "segment", "line": line_obj},
                            )

                    offset += dur

                if not cancelled:
                    final_payload = {
                        "songId": song_id,
                        "syncedLines": synced_lines,
                        "plainText": "\n".join(plain_parts),
                        "source": "audio-ai",
                        "engineVersion": LYRIC_ENGINE_VERSION,
                    }
                    if synced_lines:
                        cache_file.write_text(
                            json.dumps(final_payload), encoding="utf-8"
                        )
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        {"type": "done", "result": final_payload},
                    )
            except Exception as e:
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    {"type": "error", "message": str(e)},
                )

        fut = loop.run_in_executor(None, whisper_worker)
        try:
            while True:
                msg = await queue.get()
                yield f"data: {json.dumps(msg)}\n\n"
                if msg["type"] in ("done", "error"):
                    break
        finally:
            cancelled = True
            let_finish = fut

    return StreamingResponse(hybrid_lyric_generator(), media_type="text/event-stream")
