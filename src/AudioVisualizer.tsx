import React, { useEffect, useRef } from 'react';
import {
  usePlayerStore,
  EQ_FREQUENCIES,
  type VisualizerMode,
  type VisualizerBarAlign,
} from './store';

const isIOSDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

const isMobileDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return (
    isIOSDevice() ||
    /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
  );
};

const createSilentWavBlobUrl = (): string => {
  try {
    // 30-second 8kHz 8-bit mono unsigned PCM pure silence (~240KB) so the keep-alive loop rarely restarts
    const sampleRate = 8000;
    const durationSec = 30;
    const numSamples = sampleRate * durationSec;
    const byteLength = 44 + numSamples;
    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true); // 8-bit unsigned PCM
    writeStr(36, 'data');
    view.setUint32(40, numSamples, true);
    // 0x80 (128) is exact digital silence for 8-bit unsigned PCM
    new Uint8Array(buffer, 44).fill(128);
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch {
    return '';
  }
};

interface DeckNodes {
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  hpFilter: BiquadFilterNode | null;
  lpFilter: BiquadFilterNode | null;
  gain: GainNode | null;
}

class WebAudioController {
  public deckA: HTMLAudioElement;
  public deckB: HTMLAudioElement;
  public keepAliveAudio: HTMLAudioElement | null = null;
  public activeSlot: 'A' | 'B' = 'A';

  public audioCtx: AudioContext | null = null;
  public analyser: AnalyserNode | null = null;
  public masterGain: GainNode | null = null;
  public eqFilters: BiquadFilterNode[] = [];

  private deckANodes: DeckNodes;
  private deckBNodes: DeckNodes;
  private fadeInterval: number | null = null;
  private pendingStartCleanup: (() => void) | null = null;
  private resumingPromise: Promise<boolean> | null = null;
  private keepAliveUnlocked: boolean = false;
  private keepAliveIdleTimer: number | null = null;

  public targetVolume: number = 0.5;
  public isMuted: boolean = false;
  public pendingResumeTime: number = 0;
  public isTransitioning: boolean = false;
  public readonly isIOS: boolean;
  public readonly isMobile: boolean;

  constructor() {
    this.isIOS = isIOSDevice();
    this.isMobile = isMobileDevice();
    this.configureAudioSession();
    try {
      const st = usePlayerStore.getState();
      if (typeof st.volume === 'number' && isFinite(st.volume)) {
        this.targetVolume = st.volume;
      }
      this.isMuted = Boolean(st.isMuted);
    } catch {
      // ignore
    }
    this.deckA = this.createAudioElement(true);
    // On iOS, never mount a second music deck into document.body; instead mount a dedicated silent keep-alive
    // anchor that prevents iOS 26+ from suspending the PWA WebContent process & AVAudioSession when paused!
    this.deckB = this.createAudioElement(!this.isIOS);
    if (this.isIOS && typeof document !== 'undefined') {
      const silentUrl = createSilentWavBlobUrl();
      if (silentUrl) {
        const ka = this.createAudioElement(true);
        ka.loop = true;
        ka.controls = false;
        (ka as any).disableRemotePlayback = true;
        ka.src = silentUrl;
        ka.volume = 0.001;
        this.keepAliveAudio = ka;
      }
      // Unlock keep-alive anchor on the very first user tap anywhere in the app
      const onFirstGesture = () => {
        this.unlockIOSKeepAlive();
      };
      window.addEventListener('pointerdown', onFirstGesture, { passive: true, once: true });
      window.addEventListener('touchstart', onFirstGesture, { passive: true, once: true });
    }
    this.deckANodes = {
      audio: this.deckA,
      source: null,
      hpFilter: null,
      lpFilter: null,
      gain: null,
    };
    this.deckBNodes = {
      audio: this.deckB,
      source: null,
      hpFilter: null,
      lpFilter: null,
      gain: null,
    };
  }

  public unlockIOSKeepAlive() {
    if (!this.isIOS || !this.keepAliveAudio || this.keepAliveUnlocked) return;
    this.configureAudioSession();
    try {
      const ka = this.keepAliveAudio;
      const p = ka.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          this.keepAliveUnlocked = true;
          // Only pause it right away if deckA is currently playing (or no track is paused)
          if (!this.deckA.paused || !this.deckA.src) {
            ka.pause();
          }
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  public isIOSKeepAliveActive(): boolean {
    return Boolean(this.isIOS && this.keepAliveAudio && !this.keepAliveAudio.paused);
  }

  public startIOSKeepAlive() {
    if (!this.isIOS || !this.keepAliveAudio || !this.deckA.src) return;
    this.configureAudioSession();
    if (this.keepAliveIdleTimer) {
      window.clearTimeout(this.keepAliveIdleTimer);
      this.keepAliveIdleTimer = null;
    }
    try {
      if (this.keepAliveAudio.paused) {
        this.keepAliveAudio.play().catch(() => {});
      }
    } catch {
      // ignore
    }
    // Auto-stop silent keep-alive after 15 minutes of pause so battery is never wasted
    this.keepAliveIdleTimer = window.setTimeout(() => {
      this.stopIOSKeepAlive();
    }, 15 * 60 * 1000);
  }

  public stopIOSKeepAlive() {
    if (this.keepAliveIdleTimer) {
      window.clearTimeout(this.keepAliveIdleTimer);
      this.keepAliveIdleTimer = null;
    }
    if (this.keepAliveAudio && !this.keepAliveAudio.paused) {
      try {
        this.keepAliveAudio.pause();
      } catch {
        // ignore
      }
    }
  }

  public configureAudioSession() {
    // iOS 16.4 - iOS 26+ Safari / PWA AudioSession API:
    // Declaring 'playback' prevents iOS from treating web audio as transient 'ambient' sound
    // and keeps the hardware Now Playing / Lock Screen / Dynamic Island session alive across pause/resume!
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (typeof navigator !== 'undefined' && nav.audioSession && nav.audioSession.type !== 'playback') {
        nav.audioSession.type = 'playback';
      }
    } catch {
      // ignore on unsupported browsers
    }
  }

  private createAudioElement(mountInDom: boolean = true): HTMLAudioElement {
    const el = typeof document !== 'undefined' ? document.createElement('audio') : new Audio();
    // On iOS, native hardware AVPlayer pipeline is used (no WebAudio createMediaElementSource);
    // omitting crossOrigin="anonymous" on iOS lets AVPlayer resume byte-range streams from Lock Screen / Dynamic Island without CORS preflight stalls!
    if (!this.isIOS) {
      el.crossOrigin = 'anonymous';
    }
    el.preload = 'auto';
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    el.style.position = 'fixed';
    el.style.width = '0px';
    el.style.height = '0px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    if (mountInDom && typeof document !== 'undefined' && document.body) {
      try {
        document.body.appendChild(el);
      } catch {
        // ignore
      }
    }
    return el;
  }

  public get audio(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.deckA : this.deckB;
  }

  public get inactiveAudio(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.deckB : this.deckA;
  }

  public ensureContext() {
    this.configureAudioSession();
    // Keep mobile (iOS & Android) <audio> on native hardware media pipeline so lock-screen pause/unpause & background playback never go silent
    if (this.isIOS || this.isMobile) {
      return;
    }

    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.targetVolume;

      // Create 6-Band Equalizer BiquadFilterNode chain
      this.eqFilters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = this.audioCtx!.createBiquadFilter();
        if (idx === 0) {
          filter.type = 'lowshelf';
        } else if (idx === EQ_FREQUENCIES.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.1;
        }
        filter.frequency.value = freq;
        filter.gain.value = 0;
        return filter;
      });

      // Connect EQ chain -> masterGain -> analyser -> destination
      for (let i = 0; i < this.eqFilters.length - 1; i++) {
        this.eqFilters[i].connect(this.eqFilters[i + 1]);
      }
      const lastFilter = this.eqFilters[this.eqFilters.length - 1];
      lastFilter.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      // Connect both Deck A and Deck B into the first EQ filter via per-deck DJ High-Pass, Low-Pass & Crossfade Gain nodes
      try {
        const setupDeckChain = (nodes: DeckNodes, initialGain: number) => {
          nodes.hpFilter = this.audioCtx!.createBiquadFilter();
          nodes.hpFilter.type = 'highpass';
          nodes.hpFilter.frequency.value = 20;
          nodes.hpFilter.Q.value = 0.85;

          nodes.lpFilter = this.audioCtx!.createBiquadFilter();
          nodes.lpFilter.type = 'lowpass';
          nodes.lpFilter.frequency.value = 20000;
          nodes.lpFilter.Q.value = 0.85;

          nodes.gain = this.audioCtx!.createGain();
          nodes.gain.gain.value = initialGain;

          nodes.source = this.audioCtx!.createMediaElementSource(nodes.audio);
          nodes.source.connect(nodes.hpFilter);
          nodes.hpFilter.connect(nodes.lpFilter);
          nodes.lpFilter.connect(nodes.gain);
          nodes.gain.connect(this.eqFilters[0]);
        };

        setupDeckChain(this.deckANodes, 1);
        setupDeckChain(this.deckBNodes, 0);
      } catch (e) {
        console.warn('AudioNode connection notice:', e);
      }
    }

    if ((this.audioCtx.state as string) !== 'running') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public async resumePlayback(): Promise<boolean> {
    const el = this.audio;
    if (!el.src) {
      return false;
    }
    if (!el.paused) {
      return true;
    }
    if (this.resumingPromise) {
      return this.resumingPromise;
    }

    this.resumingPromise = (async () => {
      try {
        this.ensureContext();
        if (this.audioCtx && (this.audioCtx.state as string) !== 'running') {
          try {
            await this.audioCtx.resume();
          } catch {
            // ignore
          }
        }

        const effectiveVol = this.isMuted ? 0 : this.targetVolume;
        try {
          el.muted = this.isMuted || effectiveVol === 0;
          el.volume = effectiveVol;
        } catch {}

        if (this.audioCtx && this.masterGain) {
          const now = this.audioCtx.currentTime;
          this.masterGain.gain.cancelScheduledValues(0);
          this.masterGain.gain.setValueAtTime(effectiveVol, now);
        }

        if (this.pendingResumeTime > 0 && el.readyState >= 1) {
          try {
            el.currentTime = this.pendingResumeTime;
            this.pendingResumeTime = 0;
          } catch {
            // Will apply on loadedmetadata
          }
        }

        try {
          await el.play();
          return !el.paused;
        } catch (err: any) {
          const errName = String(err?.name || '');
          // If play() was aborted by a concurrent play request, check if element is already playing
          if (errName === 'AbortError' && !el.paused) {
            return true;
          }
          // CRITICAL FOR IPHONE LOCK SCREEN & DYNAMIC ISLAND (iOS 26+):
          // Never call el.load() while document.hidden on iOS unless the media element genuinely has an error or no source;
          // calling el.load() while locked on iOS tears down the background AVPlayer audio session!
          if (this.isIOS && document.hidden && !el.error && el.src) {
            try {
              await new Promise((r) => setTimeout(r, 60));
              await el.play();
              return !el.paused;
            } catch {
              return !el.paused;
            }
          }

          try {
            const savedPos = el.currentTime || usePlayerStore.getState().currentTime || 0;
            this.pendingResumeTime = savedPos;
            el.load();
            if (savedPos > 0) {
              try {
                el.currentTime = savedPos;
              } catch {
                // handled by loadedmetadata
              }
            }
            await el.play();
            return !el.paused;
          } catch {
            return !el.paused;
          }
        }
      } finally {
        this.resumingPromise = null;
      }
    })();

    return this.resumingPromise;
  }

  private resetDeckFilters(nodes: DeckNodes) {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;
    if (nodes.hpFilter) {
      nodes.hpFilter.frequency.cancelScheduledValues(now);
      nodes.hpFilter.frequency.setValueAtTime(20, now);
      nodes.hpFilter.Q.setValueAtTime(0.85, now);
    }
    if (nodes.lpFilter) {
      nodes.lpFilter.frequency.cancelScheduledValues(now);
      nodes.lpFilter.frequency.setValueAtTime(20000, now);
      nodes.lpFilter.Q.setValueAtTime(0.85, now);
    }
  }

  public applyEqualizer(bands: number[], bassBoost: number) {
    if (!this.audioCtx || this.eqFilters.length === 0) return;
    const now = this.audioCtx.currentTime;
    this.eqFilters.forEach((filter, idx) => {
      const baseDb = bands[idx] || 0;
      const extraBass = idx === 0 ? bassBoost : idx === 1 ? bassBoost * 0.45 : 0;
      const totalDb = Math.max(-15, Math.min(18, baseDb + extraBass));
      filter.gain.setTargetAtTime(totalDb, now, 0.04);
    });
  }

  public applyPlaybackRate(rate: number, preservePitch: boolean) {
    for (const el of [this.deckA, this.deckB]) {
      el.playbackRate = rate;
      el.defaultPlaybackRate = rate;
      if ('preservesPitch' in el) {
        (el as any).preservesPitch = preservePitch;
      } else if ('webkitPreservesPitch' in el) {
        (el as any).webkitPreservesPitch = preservePitch;
      }
    }
  }

  public applyVolume(vol: number, muted: boolean) {
    const clamped = Math.max(0, Math.min(1, isFinite(vol) ? vol : 0.5));
    this.targetVolume = clamped;
    this.isMuted = Boolean(muted);
    const effective = this.isMuted ? 0 : clamped;

    // When no crossfade is actively ramping element volumes, keep both decks' hardware volume & mute flags strictly synced
    if (!this.fadeInterval) {
      for (const el of [this.deckA, this.deckB]) {
        try {
          el.muted = this.isMuted || effective === 0;
          el.volume = effective;
        } catch {
          // ignore read-only iOS volume exception
        }
      }
      if (this.audioCtx) {
        const now = this.audioCtx.currentTime;
        const activeNodes = this.activeSlot === 'A' ? this.deckANodes : this.deckBNodes;
        const inactiveNodes = this.activeSlot === 'A' ? this.deckBNodes : this.deckANodes;
        if (activeNodes.gain) {
          activeNodes.gain.gain.cancelScheduledValues(0);
          activeNodes.gain.gain.setValueAtTime(1, now);
        }
        if (inactiveNodes.gain) {
          inactiveNodes.gain.gain.cancelScheduledValues(0);
          inactiveNodes.gain.gain.setValueAtTime(0, now);
        }
      }
    } else {
      for (const el of [this.deckA, this.deckB]) {
        try {
          el.muted = this.isMuted || effective === 0;
        } catch {}
      }
    }

    if (this.audioCtx && this.masterGain) {
      const now = this.audioCtx.currentTime;
      this.masterGain.gain.cancelScheduledValues(0);
      this.masterGain.gain.setValueAtTime(effective, now);
    }
  }

  public startTrackWithCrossfade(
    newSrc: string,
    isBlob: boolean,
    shouldPlay: boolean,
    crossfadeSec: number,
    resumeTime: number = 0,
    rate: number = 1.0,
    preservePitch: boolean = false,
    quickSkip: boolean = false
  ) {
    if (this.fadeInterval) {
      window.clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    if (this.pendingStartCleanup) {
      this.pendingStartCleanup();
      this.pendingStartCleanup = null;
    }

    this.isTransitioning = true;
    window.setTimeout(() => {
      this.isTransitioning = false;
    }, 900);

    const currentEl = this.audio;
    const effectiveCrossfadeSec = quickSkip ? Math.max(0.55, Math.min(crossfadeSec || 0.55, 0.75)) : crossfadeSec;
    // On iOS, keep all playback on the single primary <audio> element (deckA) so iPhone Lock Screen (MPNowPlayingInfoCenter)
    // never detaches or reports "Paused" when switching tracks!
    const canCrossfade =
      !this.isIOS &&
      shouldPlay &&
      effectiveCrossfadeSec > 0 &&
      resumeTime === 0 &&
      !currentEl.paused &&
      currentEl.currentTime > 0.15 &&
      !(this.isMobile && document.hidden);

    if (!canCrossfade) {
      // Standard instant switch on the active deck
      if (!this.isIOS) {
        this.inactiveAudio.pause();
        try {
          this.inactiveAudio.currentTime = 0;
          if (this.inactiveAudio.src) {
            this.inactiveAudio.removeAttribute('src');
            this.inactiveAudio.load();
          }
        } catch {
          // ignore
        }
      }
      if (isBlob || this.isIOS) {
        currentEl.removeAttribute('crossorigin');
      } else {
        currentEl.crossOrigin = 'anonymous';
      }
      currentEl.src = newSrc;
      currentEl.load();
      this.applyPlaybackRate(rate, preservePitch);
      if (resumeTime > 0) {
        this.pendingResumeTime = resumeTime;
        try {
          currentEl.currentTime = resumeTime;
        } catch {
          // Will apply on loadedmetadata
        }
      } else {
        this.pendingResumeTime = 0;
      }
      const effectiveVol = this.isMuted ? 0 : this.targetVolume;
      currentEl.volume = effectiveVol;

      const activeNodes = this.activeSlot === 'A' ? this.deckANodes : this.deckBNodes;
      const inactiveNodes = this.activeSlot === 'A' ? this.deckBNodes : this.deckANodes;
      this.resetDeckFilters(activeNodes);
      this.resetDeckFilters(inactiveNodes);

      if (this.audioCtx && activeNodes.gain && inactiveNodes.gain) {
        const now = this.audioCtx.currentTime;
        activeNodes.gain.gain.cancelScheduledValues(now);
        inactiveNodes.gain.gain.cancelScheduledValues(now);
        activeNodes.gain.gain.setValueAtTime(1, now);
        inactiveNodes.gain.gain.setValueAtTime(0, now);
      }

      if (shouldPlay) {
        this.ensureContext();
        currentEl.play().catch(() => {});
      }
      return;
    }

    // DUAL-DECK SEAMLESS TRANSITION (Supports both Quick Skip Glide & Full DJ Bass-Swap Mix):
    this.pendingResumeTime = 0;
    const outgoingSlot = this.activeSlot;
    const incomingSlot = outgoingSlot === 'A' ? 'B' : 'A';
    this.activeSlot = incomingSlot;

    const outgoingNodes = outgoingSlot === 'A' ? this.deckANodes : this.deckBNodes;
    const incomingNodes = incomingSlot === 'A' ? this.deckANodes : this.deckBNodes;
    const outgoingEl = outgoingNodes.audio;
    const incomingEl = incomingNodes.audio;

    if (isBlob) {
      incomingEl.removeAttribute('crossorigin');
    } else {
      incomingEl.crossOrigin = 'anonymous';
    }
    incomingEl.src = newSrc;
    incomingEl.load();
    this.applyPlaybackRate(rate, preservePitch);
    this.ensureContext();

    const fadeDurationMs = quickSkip
      ? Math.round(effectiveCrossfadeSec * 1000)
      : Math.min(Math.max(effectiveCrossfadeSec * 1000, 1500), 12000);
    const effectiveVol = this.isMuted ? 0 : this.targetVolume;

    let mixStarted = false;
    const beginDJMix = () => {
      if (mixStarted) return;
      mixStarted = true;
      if (this.pendingStartCleanup) {
        this.pendingStartCleanup();
        this.pendingStartCleanup = null;
      }

      const hasWebAudioMix =
        this.audioCtx &&
        outgoingNodes.gain &&
        incomingNodes.gain &&
        outgoingNodes.hpFilter &&
        outgoingNodes.lpFilter &&
        incomingNodes.hpFilter &&
        incomingNodes.lpFilter &&
        this.audioCtx.state === 'running';

      if (hasWebAudioMix && this.audioCtx) {
        incomingEl.volume = effectiveVol;
        outgoingEl.volume = effectiveVol;
        const now = this.audioCtx.currentTime;

        outgoingNodes.hpFilter!.frequency.setValueAtTime(20, now);
        outgoingNodes.lpFilter!.frequency.setValueAtTime(20000, now);
        outgoingNodes.gain!.gain.setValueAtTime(1, now);

        if (quickSkip) {
          // Clean full-bandwidth studio glide for manual skips
          incomingNodes.hpFilter!.frequency.setValueAtTime(20, now);
          incomingNodes.hpFilter!.Q.setValueAtTime(0.85, now);
          incomingNodes.lpFilter!.frequency.setValueAtTime(20000, now);
          incomingNodes.gain!.gain.setValueAtTime(0.01, now);
        } else {
          // Incoming starts with sub-bass filtered out (300Hz HPF) and slightly warm top (7.5kHz LPF)
          incomingNodes.hpFilter!.frequency.setValueAtTime(300, now);
          incomingNodes.hpFilter!.Q.setValueAtTime(1.25, now);
          incomingNodes.lpFilter!.frequency.setValueAtTime(7500, now);
          incomingNodes.gain!.gain.setValueAtTime(0.01, now);
        }
      } else {
        incomingEl.volume = 0;
      }

      incomingEl.play().catch(() => {});

      const startTime = performance.now();
      const tickMs = 25;

      this.fadeInterval = window.setInterval(() => {
        const elapsed = performance.now() - startTime;
        const p = Math.min(1, elapsed / fadeDurationMs);

        // Equal-power S-curve for full perceived loudness throughout the transition
        const smoothP = p * p * (3 - 2 * p);
        const inAmp = Math.sin(smoothP * 0.5 * Math.PI);
        const outAmp = Math.cos(smoothP * 0.5 * Math.PI);

        // Subtle tempo-lock nudge only on auto DJ crossfades (never warp pitch on manual skip)
        const grooveNudge = !quickSkip && p < 0.6 ? Math.sin(p * Math.PI) * 0.008 : 0;
        incomingEl.playbackRate = rate * (1 + grooveNudge);

        if (hasWebAudioMix && this.audioCtx) {
          const t = this.audioCtx.currentTime;

          if (quickSkip) {
            incomingNodes.gain!.gain.setTargetAtTime(inAmp, t, 0.018);
            outgoingNodes.gain!.gain.setTargetAtTime(outAmp, t, 0.018);
          } else {
            // Gain envelope with slight mid-transition headroom boost so the beat swap hits cleanly
            const swapPresence = Math.exp(-Math.pow((p - 0.52) / 0.18, 2)) * 0.12;
            incomingNodes.gain!.gain.setTargetAtTime(Math.min(1, inAmp + swapPresence), t, 0.025);
            outgoingNodes.gain!.gain.setTargetAtTime(Math.min(1, outAmp + swapPresence * 0.6), t, 0.025);

            // DJ Bass-Swap High-Pass Filter Choreography
            let inHpFreq = 20;
            let outHpFreq = 20;
            if (p < 0.45) {
              const phase1 = p / 0.45;
              inHpFreq = 300 - phase1 * 90;
              outHpFreq = 20;
            } else if (p < 0.62) {
              const swapP = (p - 0.45) / 0.17;
              inHpFreq = 210 * Math.pow(20 / 210, swapP);
              outHpFreq = 20 + swapP * 260;
            } else {
              inHpFreq = 20;
              outHpFreq = 280 + ((p - 0.62) / 0.38) * 140;
            }

            // DJ Low-Pass Filter Choreography
            const inLpFreq = p < 0.4 ? 7500 + (p / 0.4) * 12500 : 20000;
            const outLpFreq =
              p < 0.55
                ? 20000
                : Math.max(850, 20000 * Math.pow(850 / 20000, (p - 0.55) / 0.45));

            incomingNodes.hpFilter!.frequency.setTargetAtTime(inHpFreq, t, 0.025);
            outgoingNodes.hpFilter!.frequency.setTargetAtTime(outHpFreq, t, 0.025);
            incomingNodes.lpFilter!.frequency.setTargetAtTime(inLpFreq, t, 0.025);
            outgoingNodes.lpFilter!.frequency.setTargetAtTime(outLpFreq, t, 0.025);
          }
        } else {
          // Hardware element volume equal-power curve fallback (reads live targetVolume on every tick so Bluetooth/mobile volume slider works mid-transition)
          const liveEffectiveVol = this.isMuted ? 0 : this.targetVolume;
          incomingEl.volume = inAmp * liveEffectiveVol;
          outgoingEl.volume = outAmp * liveEffectiveVol;
        }

        if (p >= 1) {
          if (this.fadeInterval) {
            window.clearInterval(this.fadeInterval);
            this.fadeInterval = null;
          }
          const finalEffectiveVol = this.isMuted ? 0 : this.targetVolume;
          incomingEl.playbackRate = rate;
          outgoingEl.pause();
          try {
            outgoingEl.currentTime = 0;
            if (outgoingEl.src) {
              outgoingEl.removeAttribute('src');
              outgoingEl.load();
            }
          } catch {
            // ignore
          }
          outgoingEl.volume = finalEffectiveVol;
          incomingEl.volume = finalEffectiveVol;
          this.resetDeckFilters(incomingNodes);
          this.resetDeckFilters(outgoingNodes);
          if (this.audioCtx && incomingNodes.gain && outgoingNodes.gain) {
            const endNow = this.audioCtx.currentTime;
            incomingNodes.gain.gain.cancelScheduledValues(0);
            outgoingNodes.gain.gain.cancelScheduledValues(0);
            incomingNodes.gain.gain.setValueAtTime(1, endNow);
            outgoingNodes.gain.gain.setValueAtTime(0, endNow);
          }
        }
      }, tickMs);
    };

    // Wait for incoming track to buffer before starting the mix (faster 240ms max fallback on manual skip)
    const maxBufferWaitMs = quickSkip ? 240 : 450;
    if (incomingEl.readyState >= 3) {
      beginDJMix();
    } else {
      const onReady = () => beginDJMix();
      const fallbackTimer = window.setTimeout(beginDJMix, maxBufferWaitMs);
      incomingEl.addEventListener('canplay', onReady, { once: true });
      this.pendingStartCleanup = () => {
        window.clearTimeout(fallbackTimer);
        incomingEl.removeEventListener('canplay', onReady);
      };
    }
  }
}

export const audioController = new WebAudioController();

export const AudioEngineBridge: React.FC = () => {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const streamQuality = usePlayerStore((s) => s.streamQuality);
  const eqBands = usePlayerStore((s) => s.eqBands);
  const bassBoost = usePlayerStore((s) => s.bassBoost);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const preservePitch = usePlayerStore((s) => s.preservePitch);
  const crossfadeSeconds = usePlayerStore((s) => s.crossfadeSeconds);
  const client = usePlayerStore((s) => s.client);
  const offlineBlobUrls = usePlayerStore((s) => s.offlineBlobUrls);
  const offlineCoverUrls = usePlayerStore((s) => s.offlineCoverUrls);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const recordListenSeconds = usePlayerStore((s) => s.recordListenSeconds);

  const lastSongId = useRef<string | null>(null);
  const lastQuality = useRef<string>(streamQuality);
  const lastWasOfflineBlob = useRef<boolean>(false);
  const lastTimeSample = useRef<number>(0);
  const advancingRef = useRef<boolean>(false);
  const lastTrackSwitchAtRef = useRef<number>(0);
  const isAutoAdvanceRef = useRef<boolean>(false);

  // Sync Equalizer & Bass Boost
  useEffect(() => {
    audioController.applyEqualizer(eqBands, bassBoost);
  }, [eqBands, bassBoost]);

  // Sync Playback Rate & Pitch Preservation
  useEffect(() => {
    audioController.applyPlaybackRate(playbackRate, preservePitch);
  }, [playbackRate, preservePitch]);

  // Track switching with seamless dual-deck crossfade support & resume-from-last-position on launch
  useEffect(() => {
    if (!currentSong) return;

    const localBlobUrl = offlineBlobUrls[currentSong.id];
    const directStreamUrl = (currentSong as any).directStreamUrl as string | undefined;
    const hasOfflineBlob = Boolean(localBlobUrl);

    if (
      lastSongId.current === currentSong.id &&
      lastQuality.current === streamQuality &&
      lastWasOfflineBlob.current === hasOfflineBlob
    ) {
      return;
    }

    const isFirstMount = lastSongId.current === null;
    const isSameSongSwitch = lastSongId.current === currentSong.id;
    const savedStoreTime = usePlayerStore.getState().currentTime;
    const resumeTime = isSameSongSwitch
      ? audioController.audio.currentTime || savedStoreTime
      : isFirstMount
      ? savedStoreTime
      : 0;

    lastSongId.current = currentSong.id;
    lastQuality.current = streamQuality;
    lastWasOfflineBlob.current = hasOfflineBlob;
    lastTimeSample.current = resumeTime;
    lastTrackSwitchAtRef.current = performance.now();

    let targetSrc = '';
    if (localBlobUrl) {
      targetSrc = localBlobUrl;
    } else if (directStreamUrl) {
      targetSrc = directStreamUrl;
    } else if (currentSong.id.startsWith('local:') || currentSong.id.startsWith('imported-')) {
      const cleanName = currentSong.id.replace(/^local:/, '');
      targetSrc = `/api/discover/stream?file=${encodeURIComponent(cleanName)}&title=${encodeURIComponent(currentSong.title)}&artist=${encodeURIComponent(currentSong.artist)}`;
    } else if (client) {
      const maxBitRate = streamQuality === 'raw' ? undefined : parseInt(streamQuality, 10);
      targetSrc = client.getStreamUrl(currentSong.id, maxBitRate);
    } else {
      return;
    }

    const isAutoAdvance = isAutoAdvanceRef.current;
    isAutoAdvanceRef.current = false;

    const isQuickSkip = !isAutoAdvance && !isSameSongSwitch && !isFirstMount;
    const useCrossfade = isSameSongSwitch
      ? 0
      : isAutoAdvance
      ? crossfadeSeconds
      : isQuickSkip
      ? 0.55
      : 0;

    audioController.startTrackWithCrossfade(
      targetSrc,
      hasOfflineBlob,
      isPlaying,
      useCrossfade,
      resumeTime,
      playbackRate,
      preservePitch,
      isQuickSkip
    );
    audioController.applyEqualizer(eqBands, bassBoost);
  }, [
    currentSong,
    client,
    streamQuality,
    isPlaying,
    offlineBlobUrls,
    crossfadeSeconds,
    playbackRate,
    preservePitch,
    eqBands,
    bassBoost,
  ]);

  // Sync play/pause & ensure mobile lock-screen unpause recovers suspended/stalled audio
  useEffect(() => {
    const audio = audioController.audio;
    if (!currentSong) return;

    if (isPlaying) {
      audioController.ensureContext();
      audioController.applyEqualizer(eqBands, bassBoost);
      if (audio.paused && audio.src) {
        audioController.resumePlayback().then((ok) => {
          if (!ok && audioController.audio.paused) {
            setIsPlaying(false);
          }
        });
      }
    } else {
      if (!audioController.deckA.paused) {
        audioController.deckA.pause();
      }
      if (!audioController.deckB.paused) {
        audioController.deckB.pause();
      }
    }
  }, [isPlaying, currentSong, setIsPlaying, eqBands, bassBoost]);

  // Keep UI play/pause state, Bluetooth speaker volume, & iPhone Lock Screen MediaSession synced with real hardware <audio> state
  useEffect(() => {
    const syncLockScreenMediaSession = (el: HTMLAudioElement, forceState?: 'playing' | 'paused') => {
      if (!('mediaSession' in navigator)) return;
      const stateToSet = forceState || (el.paused ? 'paused' : 'playing');
      navigator.mediaSession.playbackState = stateToSet;

      // CRITICAL FOR iOS LOCK SCREEN:
      // Only push setPositionState({ playbackRate: 1 }) while actively PLAYING!
      // Calling setPositionState with playbackRate > 0 while PAUSED tells iOS MPNowPlayingInfoCenter
      // that playback is advancing at 1.0x speed, which flips the Lock Screen icon back from Play to Pause!
      if (stateToSet === 'playing' && 'setPositionState' in navigator.mediaSession) {
        const st = usePlayerStore.getState();
        const rawDur =
          el.duration && isFinite(el.duration) && el.duration > 0
            ? el.duration
            : st.duration || st.currentSong?.duration || 0;
        if (rawDur > 0 && isFinite(rawDur)) {
          const pos = Math.max(0, Math.min(rawDur, isFinite(el.currentTime) ? el.currentTime : 0));
          const validRate = el.playbackRate && isFinite(el.playbackRate) && el.playbackRate > 0 ? el.playbackRate : 1;
          try {
            navigator.mediaSession.setPositionState({
              duration: rawDur,
              playbackRate: validRate,
              position: pos,
            });
          } catch {
            // ignore
          }
        }
      }
    };

    const handleNativePlay = (e: Event) => {
      const el = e.target as HTMLAudioElement;
      if (el !== audioController.audio) return;
      // Stop silent keep-alive loop once the real track is actively playing
      audioController.stopIOSKeepAlive();
      // Re-assert audioSession='playback', volume, and MediaSession action handlers once <audio> enters active playback
      // (fixes iOS 26+ WebKit dropping handlers registered before Now Playing activates & mobile Bluetooth volume desync)
      audioController.configureAudioSession();
      const st = usePlayerStore.getState();
      audioController.applyVolume(st.volume, st.isMuted);
      if (!st.isPlaying) {
        setIsPlaying(true);
      }
      registerMediaSessionHandlersRef.current();
      syncLockScreenMediaSession(el, 'playing');
    };

    const handleNativePause = (e: Event) => {
      const el = e.target as HTMLAudioElement;
      if (el !== audioController.audio) return;
      if (audioController.isTransitioning || el.ended) return;

      // CRITICAL FOR IPHONE LOCK SCREEN & DYNAMIC ISLAND (iOS 26+):
      // Only run the silent keep-alive loop when paused while locked/backgrounded (document.hidden)
      // so iOS does not suspend the PWA WebContent process, and re-assert paused state after WebKit settles!
      if (document.hidden || audioController.isIOS) {
        if (el.paused && !el.ended && !audioController.isTransitioning) {
          if (audioController.isIOS) {
            audioController.startIOSKeepAlive();
          }
          if (usePlayerStore.getState().isPlaying) {
            setIsPlaying(false);
          }
          syncLockScreenMediaSession(el, 'paused');
        }
        return;
      }

      window.setTimeout(() => {
        const active = audioController.audio;
        if (
          active.paused &&
          !active.ended &&
          !audioController.isTransitioning &&
          usePlayerStore.getState().isPlaying
        ) {
          setIsPlaying(false);
          syncLockScreenMediaSession(active, 'paused');
        } else if (!active.paused) {
          syncLockScreenMediaSession(active, 'playing');
        }
      }, 220);
    };

    const handleBluetoothOrRouteSync = () => {
      const st = usePlayerStore.getState();
      audioController.applyVolume(st.volume, st.isMuted);
      if (audioController.audioCtx && (audioController.audioCtx.state as string) !== 'running' && st.isPlaying) {
        audioController.audioCtx.resume().catch(() => {});
      }
      const active = audioController.audio;
      if (!active.paused) {
        syncLockScreenMediaSession(active, 'playing');
      }
    };

    const handleVisibilitySync = () => {
      const active = audioController.audio;
      const st = usePlayerStore.getState();

      // When locking the phone / backgrounding while a track is paused on iOS, start the silent keep-alive anchor
      // so the Lock Screen & Dynamic Island stay awake and responsive if the user later taps Play
      if (document.visibilityState === 'hidden') {
        if (audioController.isIOS && active.paused && active.src && st.currentSong) {
          audioController.startIOSKeepAlive();
          syncLockScreenMediaSession(active, 'paused');
        }
        return;
      }

      if (document.visibilityState !== 'visible') return;
      // Back in foreground: never need the silent keep-alive anchor running
      audioController.stopIOSKeepAlive();
      audioController.applyVolume(st.volume, st.isMuted);
      if (audioController.audioCtx && (audioController.audioCtx.state as string) !== 'running' && st.isPlaying) {
        audioController.audioCtx.resume().catch(() => {});
      }
      if (st.isPlaying && active.paused && active.src) {
        audioController.resumePlayback().then((ok) => {
          if (!ok && audioController.audio.paused) {
            setIsPlaying(false);
            syncLockScreenMediaSession(audioController.audio, 'paused');
          } else {
            syncLockScreenMediaSession(audioController.audio, 'playing');
          }
        });
      } else if (!st.isPlaying && !active.paused) {
        setIsPlaying(true);
        syncLockScreenMediaSession(active, 'playing');
      } else if (!active.paused) {
        syncLockScreenMediaSession(active, 'playing');
      } else {
        syncLockScreenMediaSession(active, 'paused');
      }
    };

    // Whenever the iOS silent keep-alive anchor plays or ticks while the real track is paused,
    // keep navigator.mediaSession.playbackState pinned to 'paused' so WebKit never flips the Lock Screen button back to Pause!
    const handleKeepAliveSync = () => {
      if (audioController.audio.paused && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    };
    const handleKeepAlivePlay = () => {
      handleKeepAliveSync();
      window.setTimeout(handleKeepAliveSync, 50);
      window.setTimeout(handleKeepAliveSync, 160);
      window.setTimeout(handleKeepAliveSync, 350);
    };
    if (audioController.keepAliveAudio) {
      audioController.keepAliveAudio.addEventListener('play', handleKeepAlivePlay);
      audioController.keepAliveAudio.addEventListener('playing', handleKeepAlivePlay);
      audioController.keepAliveAudio.addEventListener('timeupdate', handleKeepAliveSync);
    }

    for (const deck of [audioController.deckA, audioController.deckB]) {
      deck.addEventListener('play', handleNativePlay);
      deck.addEventListener('playing', handleNativePlay);
      deck.addEventListener('pause', handleNativePause);
      deck.addEventListener('durationchange', () => {
        if (deck === audioController.audio && !deck.paused) {
          syncLockScreenMediaSession(deck, 'playing');
        }
      });
      deck.addEventListener('seeked', () => {
        if (deck === audioController.audio) {
          syncLockScreenMediaSession(deck, deck.paused ? 'paused' : 'playing');
        }
      });
    }
    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener('focus', handleBluetoothOrRouteSync);
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleBluetoothOrRouteSync);
    }

    return () => {
      if (audioController.keepAliveAudio) {
        audioController.keepAliveAudio.removeEventListener('play', handleKeepAlivePlay);
        audioController.keepAliveAudio.removeEventListener('playing', handleKeepAlivePlay);
        audioController.keepAliveAudio.removeEventListener('timeupdate', handleKeepAliveSync);
      }
      for (const deck of [audioController.deckA, audioController.deckB]) {
        deck.removeEventListener('play', handleNativePlay);
        deck.removeEventListener('playing', handleNativePlay);
        deck.removeEventListener('pause', handleNativePause);
      }
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.removeEventListener('focus', handleBluetoothOrRouteSync);
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleBluetoothOrRouteSync);
      }
    };
  }, [setIsPlaying]);

  // Sync volume
  useEffect(() => {
    audioController.applyVolume(volume, isMuted);
  }, [volume, isMuted]);

  // Audio events on BOTH decks (so whichever deck is currently active reports time & triggers crossfade before track end)
  useEffect(() => {
    const advanceToNext = () => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      window.setTimeout(() => {
        advancingRef.current = false;
      }, 1500);

      const activeAudio = audioController.audio;
      if (usePlayerStore.getState().repeatMode === 'one') {
        activeAudio.currentTime = 0;
        activeAudio.play().catch(() => {});
      } else {
        isAutoAdvanceRef.current = true;
        usePlayerStore.getState().nextTrack();
      }
    };

    let lastUiTimeUpdateAt = 0;
    let lastMediaPositionAt = 0;

    const handleTimeUpdate = (e: Event) => {
      const el = e.target as HTMLAudioElement;
      if (el !== audioController.audio) return;

      const cur = el.currentTime;
      // Do not overwrite saved launch resume time with 0 while metadata is still loading
      if (audioController.pendingResumeTime > 0 && cur < 0.5) {
        return;
      }

      const nowMs = performance.now();
      // Throttle React state updates on mobile (or when backgrounded) to prevent excessive tree re-renders over long sessions
      const minIntervalMs = document.hidden ? 1000 : audioController.isMobile ? 140 : 80;
      if (nowMs - lastUiTimeUpdateAt >= minIntervalMs || cur < 0.25) {
        lastUiTimeUpdateAt = nowMs;
        setCurrentTime(cur);
      }

      // Record listening stats delta
      if (currentSong && !el.paused) {
        const delta = cur - lastTimeSample.current;
        if (delta >= 1.0 && delta <= 5.0) {
          recordListenSeconds(currentSong, delta);
          lastTimeSample.current = cur;
        } else if (delta < 0 || delta > 5.0) {
          lastTimeSample.current = cur;
        }
      }

      const hasValidMediaDuration =
        Boolean(el.duration) && isFinite(el.duration) && el.duration > 0;
      const targetDur = hasValidMediaDuration
        ? el.duration
        : currentSong?.duration || 0;

      // Trigger seamless crossfade mix N seconds BEFORE the current song ends!
      const cfSec = usePlayerStore.getState().crossfadeSeconds;
      const triggerLead =
        cfSec > 0 && !(audioController.isIOS && document.hidden)
          ? Math.min(cfSec, Math.max(0.5, targetDur * 0.25))
          : 0.25;

      // Guard against stale timeupdate events during track switches before new media metadata has loaded
      const timeSinceSwitch = nowMs - lastTrackSwitchAtRef.current;
      if (
        hasValidMediaDuration &&
        timeSinceSwitch > 1000 &&
        targetDur > 0 &&
        cur >= targetDur - triggerLead &&
        !el.paused
      ) {
        advanceToNext();
      }

      if (
        nowMs - lastMediaPositionAt >= 1200 &&
        'mediaSession' in navigator
      ) {
        if (!el.paused && navigator.mediaSession.playbackState !== 'playing') {
          navigator.mediaSession.playbackState = 'playing';
        }
        if ('setPositionState' in navigator.mediaSession && targetDur > 0 && isFinite(cur) && cur <= targetDur) {
          lastMediaPositionAt = nowMs;
          const validRate = el.playbackRate && isFinite(el.playbackRate) && el.playbackRate > 0 ? el.playbackRate : 1;
          try {
            navigator.mediaSession.setPositionState({
              duration: targetDur,
              playbackRate: validRate,
              position: Math.max(0, cur),
            });
          } catch {
            // ignore
          }
        }
      }
    };

    const handleLoadedMetadata = (e: Event) => {
      const el = e.target as HTMLAudioElement;
      if (el !== audioController.audio) return;
      if (el.duration && !isNaN(el.duration) && isFinite(el.duration)) {
        setDuration(el.duration);
      } else if (currentSong?.duration) {
        setDuration(currentSong.duration);
      }
      if (audioController.pendingResumeTime > 0) {
        const target = audioController.pendingResumeTime;
        audioController.pendingResumeTime = 0;
        try {
          el.currentTime = target;
          setCurrentTime(target);
        } catch {
          // ignore
        }
      }
    };

    const handleCanPlay = (e: Event) => {
      const el = e.target as HTMLAudioElement;
      if (el !== audioController.audio) return;
      if (audioController.pendingResumeTime > 0) {
        const target = audioController.pendingResumeTime;
        audioController.pendingResumeTime = 0;
        try {
          el.currentTime = target;
          setCurrentTime(target);
        } catch {
          // ignore
        }
      }
      if (usePlayerStore.getState().isPlaying && el.paused) {
        el.play().catch(() => {});
      }
    };

    const handleEnded = (e: Event) => {
      const el = e.target as HTMLAudioElement;
      if (el !== audioController.audio) return;
      advanceToNext();
    };

    const onSeekEvent = (e: Event) => {
      const targetTime = (e as CustomEvent<number>).detail;
      audioController.audio.currentTime = targetTime;
      lastTimeSample.current = targetTime;
      setCurrentTime(targetTime);
    };

    for (const deck of [audioController.deckA, audioController.deckB]) {
      deck.addEventListener('timeupdate', handleTimeUpdate);
      deck.addEventListener('loadedmetadata', handleLoadedMetadata);
      deck.addEventListener('canplay', handleCanPlay);
      deck.addEventListener('ended', handleEnded);
    }
    window.addEventListener('liquid-seek', onSeekEvent);

    return () => {
      for (const deck of [audioController.deckA, audioController.deckB]) {
        deck.removeEventListener('timeupdate', handleTimeUpdate);
        deck.removeEventListener('loadedmetadata', handleLoadedMetadata);
        deck.removeEventListener('canplay', handleCanPlay);
        deck.removeEventListener('ended', handleEnded);
      }
      window.removeEventListener('liquid-seek', onSeekEvent);
    };
  }, [currentSong, repeatMode, nextTrack, setCurrentTime, setDuration, recordListenSeconds]);

  const registerMediaSessionHandlersRef = useRef<() => void>(() => {});
  const lastRemoteToggleAtRef = useRef<number>(0);

  // 1. Keep MediaSession remote Lock Screen & Dynamic Island action handlers registered cleanly
  // (Re-invoked on mount, track change, and inside <audio> 'play'/'playing' events to avoid the iOS WebKit timing trap!)
  useEffect(() => {
    const registerHandlers = () => {
      if (!('mediaSession' in navigator)) return;
      audioController.configureAudioSession();

      const safeSetHandler = (
        action: MediaSessionAction,
        handler: MediaSessionActionHandler | null
      ) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch {
          // ignore unsupported action on older browsers
        }
      };

      const resumeFromRemote = () => {
        audioController.configureAudioSession();
        const el = audioController.audio;
        if (!el.src) return;
        // Call el.play() SYNCHRONOUSLY before stopping keepAliveAudio so AVAudioSession never has a 0ms gap!
        const playPromise = el.paused ? el.play() : Promise.resolve();
        navigator.mediaSession.playbackState = 'playing';
        setIsPlaying(true);
        if (playPromise && typeof playPromise.then === 'function') {
          playPromise
            .then(() => {
              audioController.stopIOSKeepAlive();
              navigator.mediaSession.playbackState = 'playing';
              if (!usePlayerStore.getState().isPlaying) {
                setIsPlaying(true);
              }
            })
            .catch(() => {
              audioController.resumePlayback().then((recovered) => {
                if (recovered) {
                  audioController.stopIOSKeepAlive();
                }
                navigator.mediaSession.playbackState = recovered ? 'playing' : 'paused';
                setIsPlaying(recovered);
              });
            });
        } else {
          audioController.stopIOSKeepAlive();
        }
      };

      // CRITICAL FOR iOS 26+ LOCK SCREEN & DYNAMIC ISLAND:
      // 1. Debounce remote Play/Pause commands by 450ms so a single tap never double-fires during the keepAlive handoff.
      // 2. Call el.play() SYNCHRONOUSLY on the first tick of the handler so WebKit preserves the remote-command user-gesture token!
      // 3. Pause deckA BEFORE starting keepAliveAudio, and if the real track is ALREADY paused with keepAlive running,
      //    treat a subsequent tap as a clean Resume command.
      safeSetHandler('play', () => {
        const now = performance.now();
        if (now - lastRemoteToggleAtRef.current < 450) return;
        lastRemoteToggleAtRef.current = now;
        resumeFromRemote();
      });

      safeSetHandler('pause', () => {
        const now = performance.now();
        if (now - lastRemoteToggleAtRef.current < 450) return;
        lastRemoteToggleAtRef.current = now;

        if (audioController.isIOS && audioController.audio.paused && audioController.isIOSKeepAliveActive()) {
          resumeFromRemote();
          return;
        }
        // CRITICAL: Start silent keep-alive BEFORE pausing deckA (and without gating on document.hidden)
        // so there is NEVER a 0ms gap where zero <audio> elements are active on iOS 26+!
        if (audioController.isIOS) {
          audioController.startIOSKeepAlive();
        }
        if (!audioController.deckA.paused) audioController.deckA.pause();
        if (!audioController.isIOS && !audioController.deckB.paused) {
          audioController.deckB.pause();
        }
        navigator.mediaSession.playbackState = 'paused';
        setIsPlaying(false);
      });

      safeSetHandler('previoustrack', () => prevTrack());
      safeSetHandler('nexttrack', () => nextTrack());
      safeSetHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          audioController.audio.currentTime = details.seekTime;
          setCurrentTime(details.seekTime);
        }
      });
    };

    registerMediaSessionHandlersRef.current = registerHandlers;
    registerHandlers();
  }, [setIsPlaying, prevTrack, nextTrack, setCurrentTime]);

  // 2. Update MediaSession Metadata ONLY when the track or its cover URL changes
  // (NEVER re-assign navigator.mediaSession.metadata on pause/unpause, which causes iOS lock screen to drop the paused session!)
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;

    const offlineCover = offlineCoverUrls[currentSong.id];
    const directCover = (currentSong as any).directCoverUrl as string | undefined;
    const artworkUrl =
      offlineCover ||
      directCover ||
      (client ? client.getCoverArtUrl(currentSong.coverArt || currentSong.id, 512) : '');

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist,
      album: currentSong.album,
      artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
    // Re-assert action handlers whenever a new track loads so iOS 26+ Lock Screen & Dynamic Island stay bound
    registerMediaSessionHandlersRef.current();
  }, [currentSong?.id, currentSong?.title, currentSong?.artist, currentSong?.album, client, offlineCoverUrls]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying, currentSong?.id]);

  return null;
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const AudioVisualizerCanvas: React.FC<{
  mode: VisualizerMode;
  barAlign?: VisualizerBarAlign;
  accentRgb?: string;
  secondaryRgb?: string;
  className?: string;
}> = ({
  mode,
  barAlign = 'center',
  accentRgb = '168, 85, 247',
  secondaryRgb = '99, 102, 241',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    if (mode === 'off') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Keep internal canvas resolution matched to CSS display size via ResizeObserver (never call getBoundingClientRect inside 60fps RAF!)
    let cachedGrad: CanvasGradient | null = null;
    let cachedGradHeight = 0;
    const isMobileCanvas = audioController.isMobile;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobileCanvas ? 1.5 : 2);

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const targetW = Math.round(rect.width * dpr);
        const targetH = Math.round(rect.height * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
          cachedGrad = null;
        }
      }
    };
    syncCanvasSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => syncCanvasSize());
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', syncCanvasSize);
    }

    let rafId: number | null = null;
    let lastFrameAt = 0;
    const bufferLength = 128;
    const dataArray = new Uint8Array(bufferLength);

    // Persistent galaxy orbs with off-screen spawn/exit buffer for smooth fade-in / fade-out
    const particleCount = isMobileCanvas ? 22 : 38;
    const particles = Array.from({ length: particleCount }, (_, idx) => ({
      x: (idx / particleCount) * (canvas.width || 480),
      yRatio: 0.15 + ((idx * 37) % 70) / 100,
      r: 1.8 + (idx % 4) * 1.15,
      vx: 0.32 + (idx % 5) * 0.14,
      phase: idx * 0.45,
    }));

    const getBarFrequencyIndex = (barIdx: number, totalBars: number): number => {
      const maxBins = Math.floor(bufferLength * 0.72);
      if (barAlign === 'left') {
        // Main bass/energy on the Left side, trailing highs to the Right
        return Math.min(bufferLength - 1, Math.floor((barIdx / totalBars) * maxBins));
      }
      if (barAlign === 'right') {
        // Main bass/energy on the Right side, trailing highs to the Left
        return Math.min(
          bufferLength - 1,
          Math.floor(((totalBars - 1 - barIdx) / totalBars) * maxBins)
        );
      }
      // 'center' (Middle): Main bass/energy in the center, radiating symmetrically outward
      const center = (totalBars - 1) / 2;
      const normalizedDist = Math.abs(barIdx - center) / Math.max(1, center);
      return Math.min(bufferLength - 1, Math.floor(normalizedDist * maxBins));
    };

    const render = (nowTs: number = performance.now()) => {
      // Stop spinning RAF when tab is hidden; visibilitychange will restart it cleanly
      if (document.hidden) {
        rafId = null;
        return;
      }
      // If canvas is hidden by responsive layout (e.g. viewing Queue/Lyrics on mobile), check lazily
      if (canvas.offsetParent === null) {
        if (isPlaying) {
          rafId = requestAnimationFrame(render);
        } else {
          rafId = null;
        }
        return;
      }

      // Cap mobile visualizer to ~30fps (32ms) to prevent GPU thermal throttling over long sessions
      if (isMobileCanvas && isPlaying && nowTs - lastFrameAt < 32) {
        rafId = requestAnimationFrame(render);
        return;
      }
      lastFrameAt = nowTs;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const analyser = audioController.analyser;
      const isWaveMode = mode === 'waveform';

      if (analyser && isPlaying) {
        if (isWaveMode) {
          analyser.getByteTimeDomainData(dataArray);
        } else {
          analyser.getByteFrequencyData(dataArray);
        }
      } else if (isPlaying) {
        const t = nowTs * 0.0055;
        const beatPulse = Math.pow(Math.max(0, Math.sin(t * 1.45)), 2);
        for (let i = 0; i < bufferLength; i++) {
          if (!isWaveMode) {
            const freqDecay = 1 - (i / bufferLength) * 0.55;
            const wave1 = Math.sin(t * 2.1 + i * 0.23) * 0.5 + 0.5;
            const wave2 = Math.cos(t * 3.4 - i * 0.37) * 0.5 + 0.5;
            const subBass = i < 16 ? beatPulse * 68 : 0;
            const energy = (36 + wave1 * 95 + wave2 * 65 + subBass) * freqDecay;
            dataArray[i] = Math.min(255, Math.max(14, Math.floor(energy)));
          } else {
            const env = Math.sin((i / bufferLength) * Math.PI);
            const osc =
              Math.sin(t * 3.2 + i * 0.18) * 28 +
              Math.cos(t * 5.1 - i * 0.09) * 16 * (0.5 + beatPulse * 0.5);
            dataArray[i] = Math.floor(128 + osc * env);
          }
        }
      } else {
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = !isWaveMode ? 14 : 128;
        }
      }

      if (!cachedGrad || cachedGradHeight !== height) {
        cachedGrad = ctx.createLinearGradient(0, height, 0, 0);
        cachedGrad.addColorStop(0, `rgba(${secondaryRgb}, 0.28)`);
        cachedGrad.addColorStop(0.5, `rgba(${accentRgb}, 0.85)`);
        cachedGrad.addColorStop(1, `rgba(255, 255, 255, 0.95)`);
        cachedGradHeight = height;
      }
      const grad = cachedGrad;

      if (mode === 'spectrum') {
        const bars = isMobileCanvas ? 36 : 48;
        const barWidth = (width / bars) * 0.68;
        const gap = (width / bars) * 0.32;

        ctx.fillStyle = grad;
        if (!isMobileCanvas) {
          ctx.shadowColor = `rgba(${accentRgb}, 0.55)`;
          ctx.shadowBlur = 8 * dpr;
        } else {
          ctx.shadowBlur = 0;
        }

        for (let i = 0; i < bars; i++) {
          const freqIdx = getBarFrequencyIndex(i, bars);
          const val = dataArray[freqIdx] / 255;
          const barHeight = Math.max(4 * dpr, val * (height - 8 * dpr));
          const x = i * (barWidth + gap) + gap / 2;
          const y = height - barHeight;

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 3 * dpr);
          ctx.fill();
        }
      } else if (mode === 'waveform') {
        ctx.lineWidth = 2.4 * dpr;
        ctx.strokeStyle = grad;
        if (!isMobileCanvas) {
          ctx.shadowColor = `rgba(${accentRgb}, 0.65)`;
          ctx.shadowBlur = 10 * dpr;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      } else if (mode === 'mirror') {
        // Symmetric Dual-Horizon Bars mirrored from center line with Middle/Left/Right alignment
        const bars = isMobileCanvas ? 38 : 52;
        const barWidth = (width / bars) * 0.65;
        const gap = (width / bars) * 0.35;
        const midY = height / 2;

        ctx.fillStyle = grad;
        if (!isMobileCanvas) {
          ctx.shadowColor = `rgba(${accentRgb}, 0.6)`;
          ctx.shadowBlur = 8 * dpr;
        } else {
          ctx.shadowBlur = 0;
        }

        for (let i = 0; i < bars; i++) {
          const freqIdx = getBarFrequencyIndex(i, bars);
          const val = dataArray[freqIdx] / 255;
          const halfH = Math.max(2 * dpr, val * (midY - 4 * dpr));
          const x = i * (barWidth + gap) + gap / 2;

          ctx.beginPath();
          ctx.roundRect(x, midY - halfH, barWidth, halfH * 2, 3 * dpr);
          ctx.fill();
        }
      } else if (mode === 'orb') {
        // Fixed Unclipped 360-Degree Liquid Halo Visualizer
        const cx = width / 2;
        const cy = height / 2;
        const maxRadius = Math.min(width, height) * 0.45;

        let bassSum = 0;
        for (let i = 0; i < 12; i++) bassSum += dataArray[i];
        const bassNorm = bassSum / (12 * 255);

        const ringRadius = maxRadius * (0.46 + bassNorm * 0.16);
        const t = performance.now() * 0.0022;

        // 1. Soft atmospheric radial aura (strictly within maxRadius so it never clips)
        const auraGrad = ctx.createRadialGradient(
          cx,
          cy,
          ringRadius * 0.25,
          cx,
          cy,
          maxRadius * 0.98
        );
        auraGrad.addColorStop(0, `rgba(${accentRgb}, ${0.18 + bassNorm * 0.25})`);
        auraGrad.addColorStop(0.55, `rgba(${secondaryRgb}, ${0.12 + bassNorm * 0.18})`);
        auraGrad.addColorStop(1, `rgba(${secondaryRgb}, 0)`);
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, maxRadius * 0.98, 0, Math.PI * 2);
        ctx.fill();

        // 2. Smooth harmonic liquid halo ring (closed 360° wave path)
        const segments = 64;
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const idx = i % segments;
          const angle = (idx / segments) * Math.PI * 2 - Math.PI / 2;
          // Mirror frequency bins around the circle so top and bottom meet seamlessly without a seam
          const mirrorBin =
            idx < segments / 2
              ? Math.floor((idx / (segments / 2)) * 40)
              : Math.floor(((segments - idx) / (segments / 2)) * 40);
          const freqVal = dataArray[mirrorBin] / 255;
          const ripple = Math.sin(angle * 4 + t * 2.2) * (2 * dpr);
          const r = Math.min(
            maxRadius * 0.95,
            ringRadius + freqVal * (maxRadius * 0.34) + ripple
          );
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 + bassNorm * 0.25})`;
        ctx.lineWidth = 2.2 * dpr;
        ctx.shadowColor = `rgba(${accentRgb}, 0.9)`;
        ctx.shadowBlur = 12 * dpr;
        ctx.stroke();

        // 3. Radial crown bars radiating cleanly around the halo
        const rays = 48;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2 * dpr;
        for (let i = 0; i < rays; i++) {
          const angle = (i / rays) * Math.PI * 2 + t * 0.35;
          const mirrorBin =
            i < rays / 2
              ? Math.floor((i / (rays / 2)) * 48)
              : Math.floor(((rays - i) / (rays / 2)) * 48);
          const val = dataArray[mirrorBin] / 255;
          const r1 = ringRadius * 0.88;
          const r2 = Math.min(maxRadius * 0.96, r1 + 3 * dpr + val * (maxRadius * 0.38));
          ctx.strokeStyle =
            i % 2 === 0
              ? `rgba(255, 255, 255, ${0.45 + val * 0.5})`
              : `rgba(${accentRgb}, ${0.65 + val * 0.35})`;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
          ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
          ctx.stroke();
        }

        // 4. Inner dark-glass core ring
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius * 0.62, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${accentRgb}, ${0.45 + bassNorm * 0.4})`;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
        ctx.restore();
      } else if (mode === 'particles') {
        // Floating Bass Galaxy Orbs with smooth fade-in on screen entry and fade-out on screen exit
        let bassSum = 0;
        for (let i = 0; i < 10; i++) bassSum += dataArray[i];
        const bassBoostFactor = 1 + (bassSum / (10 * 255)) * 2.8;

        const margin = 20 * dpr;
        const fadeZoneX = Math.min(width * 0.18, 72 * dpr);
        const fadeZoneY = Math.min(height * 0.24, 18 * dpr);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const freqVal = dataArray[(i * 3) % bufferLength] / 255;
          p.x += p.vx * bassBoostFactor * dpr;

          // Wrap offscreen so the orb enters smoothly from opacity 0 and exits smoothly to opacity 0
          if (p.x > width + margin) {
            p.x = -margin;
            p.yRatio = 0.15 + ((p.yRatio * 100 + 29) % 70) / 100;
          }

          const baseY = p.yRatio * height;
          const yOffset =
            Math.sin(performance.now() * 0.0028 + p.phase) * (5 + freqVal * 13) * dpr;
          const py = baseY + yOffset;

          // Smoothstep alpha fade at left/right & top/bottom screen boundaries
          const fadeInLeft = smoothstep(-margin * 0.5, fadeZoneX, p.x);
          const fadeOutRight = smoothstep(width + margin * 0.5, width - fadeZoneX, p.x);
          const fadeInTop = smoothstep(0, fadeZoneY, py);
          const fadeOutBottom = smoothstep(height, height - fadeZoneY, py);
          const edgeAlpha = fadeInLeft * fadeOutRight * fadeInTop * fadeOutBottom;

          if (edgeAlpha <= 0.01) continue;

          const baseAlpha = (i % 2 === 0 ? 0.48 + freqVal * 0.48 : 0.55 + freqVal * 0.45) * edgeAlpha;
          const orbRadius = (p.r + freqVal * 2.4) * dpr;

          // Soft radial orb glow so each galaxy particle looks luminous and fades seamlessly
          const orbGrad = ctx.createRadialGradient(p.x, py, 0, p.x, py, orbRadius * 2.2);
          if (i % 2 === 0) {
            orbGrad.addColorStop(0, `rgba(255, 255, 255, ${baseAlpha})`);
            orbGrad.addColorStop(0.45, `rgba(${accentRgb}, ${baseAlpha * 0.65})`);
            orbGrad.addColorStop(1, `rgba(${accentRgb}, 0)`);
          } else {
            orbGrad.addColorStop(0, `rgba(${accentRgb}, ${baseAlpha})`);
            orbGrad.addColorStop(0.5, `rgba(${secondaryRgb}, ${baseAlpha * 0.55})`);
            orbGrad.addColorStop(1, `rgba(${secondaryRgb}, 0)`);
          }

          ctx.fillStyle = orbGrad;
          ctx.beginPath();
          ctx.arc(p.x, py, orbRadius * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isPlaying) {
        rafId = requestAnimationFrame(render);
      } else {
        rafId = null;
      }
    };

    const handleVisChange = () => {
      if (!document.hidden && isPlaying && rafId === null) {
        rafId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', handleVisChange);

    rafId = requestAnimationFrame(render);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisChange);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', syncCanvasSize);
      }
    };
  }, [mode, barAlign, isPlaying, accentRgb, secondaryRgb]);

  if (mode === 'off') return null;

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={mode === 'orb' ? 120 : 84}
      className={`w-full ${mode === 'orb' ? 'h-28' : 'h-16'} pointer-events-none transition-all duration-300 ${className}`}
    />
  );
};

