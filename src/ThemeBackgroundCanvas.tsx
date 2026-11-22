import React, { useEffect, useRef } from 'react';
import { audioController } from './AudioVisualizer';
import type { UiStyleMode } from './store';

export type AnimatedThemeMode = Exclude<UiStyleMode, 'liquid'>;

interface ThemeBackgroundCanvasProps {
  mode: AnimatedThemeMode;
  primaryRgb: string;
  secondaryRgb: string;
  tertiaryRgb: string;
  isPlaying: boolean;
  speed?: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
  sparkle: boolean;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  width: number;
  alpha: number;
  life: number;
  maxLife: number;
  rgb: string;
}

interface CloudPuff {
  x: number;
  y: number;
  rx: number;
  ry: number;
  speed: number;
  layer: number; // 0 back, 1 front
  seed: number;
}

interface BoltSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

interface LightningBolt {
  segments: BoltSegment[];
  originX: number;
  originY: number;
  life: number;
  maxLife: number;
  rgb: string;
  intensity: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  alpha: number;
}

interface Plankton {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  rgbIdx: number;
}

interface LavaBlob {
  x: number;
  y: number;
  baseR: number;
  vy: number;
  vx: number;
  phase: number;
  wobbleFreq: number;
  rgbIdx: number;
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  pulseSpeed: number;
  rgbIdx: number;
}

interface LeafParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  swayPhase: number;
  alpha: number;
  rgbIdx: number;
}

interface GlassDrop {
  x: number;
  y: number;
  r: number;
  vy: number;
  sliding: boolean;
  trailLen: number;
  wobble: number;
  alpha: number;
}

interface BokehOrb {
  x: number;
  y: number;
  r: number;
  rgbIdx: number;
  phase: number;
}

interface NebulaCloud {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  rotSpeed: number;
  vx: number;
  vy: number;
  rgbIdx: number;
  alpha: number;
}

interface Jellyfish {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
  rgbIdx: number;
}

interface Snowflake {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  alpha: number;
  soft: boolean;
}

interface OrbitParticle {
  angle: number;
  radius: number;
  angularVel: number;
  size: number;
  tilt: number;
  rgbIdx: number;
  alpha: number;
}

function generateLightningSegments(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  width: number,
  displacement: number,
  depth: number,
  out: BoltSegment[]
) {
  if (depth <= 0) {
    out.push({ x1: startX, y1: startY, x2: endX, y2: endY, width });
    return;
  }
  const midX = (startX + endX) * 0.5 + (Math.random() - 0.5) * displacement;
  const midY = (startY + endY) * 0.5 + (Math.random() - 0.5) * displacement * 0.25;
  generateLightningSegments(startX, startY, midX, midY, width, displacement * 0.56, depth - 1, out);
  generateLightningSegments(midX, midY, endX, endY, width * 0.9, displacement * 0.56, depth - 1, out);

  // Occasional realistic fork branch
  if (depth >= 2 && depth <= 4 && Math.random() < 0.42) {
    const branchLen = Math.hypot(endX - midX, endY - midY) * (0.45 + Math.random() * 0.45);
    const branchAngle = Math.atan2(endY - midY, endX - midX) + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.45);
    const bx = midX + Math.cos(branchAngle) * branchLen;
    const by = midY + Math.sin(branchAngle) * branchLen;
    generateLightningSegments(midX, midY, bx, by, width * 0.52, displacement * 0.4, depth - 2, out);
  }
}

export const ThemeBackgroundCanvas: React.FC<ThemeBackgroundCanvasProps> = ({
  mode,
  primaryRgb,
  secondaryRgb,
  tertiaryRgb,
  isPlaying,
  speed = 1.0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef({ primaryRgb, secondaryRgb, tertiaryRgb, isPlaying, speed });

  useEffect(() => {
    colorsRef.current = { primaryRgb, secondaryRgb, tertiaryRgb, isPlaying, speed };
  }, [primaryRgb, secondaryRgb, tertiaryRgb, isPlaying, speed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const freqBuf = new Uint8Array(64);

    // State pools per theme
    const stars: Star[] = [];
    const meteors: Meteor[] = [];
    const clouds: CloudPuff[] = [];
    const bolts: LightningBolt[] = [];
    const rain: RainDrop[] = [];
    const bubbles: Bubble[] = [];
    const plankton: Plankton[] = [];
    const lavaBlobs: LavaBlob[] = [];
    const fireflies: Firefly[] = [];
    const leaves: LeafParticle[] = [];
    const glassDrops: GlassDrop[] = [];
    const bokehOrbs: BokehOrb[] = [];
    const nebulaClouds: NebulaCloud[] = [];
    const jellies: Jellyfish[] = [];
    const snowflakes: Snowflake[] = [];
    const orbitParticles: OrbitParticle[] = [];

    const getRgbByIdx = (idx: number): string => {
      const { primaryRgb: c1, secondaryRgb: c2, tertiaryRgb: c3 } = colorsRef.current;
      if (idx === 0) return c1;
      if (idx === 1) return c2;
      return c3;
    };

    const pickColor = (): string => {
      const r = Math.random();
      if (r < 0.48) return colorsRef.current.primaryRgb;
      if (r < 0.8) return colorsRef.current.secondaryRgb;
      return colorsRef.current.tertiaryRgb;
    };

    const spawnMeteor = (energy: number) => {
      const fromTop = Math.random() < 0.72;
      const startX = fromTop ? Math.random() * width * 1.15 : width * (0.62 + Math.random() * 0.42);
      const startY = fromTop ? -30 - Math.random() * 60 : Math.random() * height * 0.45;
      const speed = (6.8 + Math.random() * 6.5) * (1 + energy * 0.8);
      const angle = Math.PI * 0.62 + (Math.random() - 0.5) * 0.14;
      meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: (115 + Math.random() * 115) * (1 + energy * 0.55),
        width: (1.8 + Math.random() * 1.8) * (1 + energy * 0.35),
        alpha: 0.72 + Math.random() * 0.28,
        life: 0,
        maxLife: 50 + Math.random() * 55,
        rgb: pickColor(),
      });
    };

    const spawnLightning = (energy: number) => {
      const originX = width * (0.1 + Math.random() * 0.8);
      const originY = height * (0.05 + Math.random() * 0.08);
      const endX = originX + (Math.random() - 0.5) * width * 0.28;
      const endY = height * (0.48 + Math.random() * 0.42);
      const segments: BoltSegment[] = [];
      generateLightningSegments(
        originX,
        originY,
        endX,
        endY,
        2.2 + energy * 1.6,
        Math.min(width, height) * 0.16,
        5,
        segments
      );
      bolts.push({
        segments,
        originX,
        originY,
        life: 0,
        maxLife: 18 + Math.random() * 16,
        rgb: Math.random() < 0.65 ? colorsRef.current.primaryRgb : colorsRef.current.secondaryRgb,
        intensity: 0.72 + energy * 0.38,
      });
    };

    const initThemeEntities = () => {
      stars.length = 0;
      meteors.length = 0;
      clouds.length = 0;
      bolts.length = 0;
      rain.length = 0;
      bubbles.length = 0;
      plankton.length = 0;
      lavaBlobs.length = 0;
      fireflies.length = 0;
      leaves.length = 0;
      glassDrops.length = 0;
      bokehOrbs.length = 0;
      nebulaClouds.length = 0;
      jellies.length = 0;
      snowflakes.length = 0;
      orbitParticles.length = 0;

      const isMobile = width < 768;

      if (mode === 'space') {
        const count = isMobile ? 95 : 165;
        for (let i = 0; i < count; i++) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 1.7 + 0.45,
            baseAlpha: Math.random() * 0.52 + 0.24,
            twinkleSpeed: Math.random() * 1.9 + 0.45,
            phase: Math.random() * Math.PI * 2,
            sparkle: Math.random() < 0.13,
          });
        }
        for (let i = 0; i < 5; i++) spawnMeteor(0.25);
      } else if (mode === 'thunder') {
        // Two layered rows of volumetric storm clouds pinned across the top of the screen
        const backCount = isMobile ? 8 : 13;
        const frontCount = isMobile ? 7 : 11;
        for (let i = 0; i < backCount; i++) {
          clouds.push({
            x: (i / backCount) * (width + 260) - 130,
            y: height * (0.01 + Math.random() * 0.06),
            rx: (isMobile ? 115 : 175) + Math.random() * 95,
            ry: (isMobile ? 55 : 78) + Math.random() * 35,
            speed: 5 + Math.random() * 6,
            layer: 0,
            seed: Math.random() * Math.PI * 2,
          });
        }
        for (let i = 0; i < frontCount; i++) {
          clouds.push({
            x: (i / frontCount) * (width + 240) - 120,
            y: height * (0.04 + Math.random() * 0.08),
            rx: (isMobile ? 100 : 155) + Math.random() * 85,
            ry: (isMobile ? 48 : 68) + Math.random() * 32,
            speed: 9 + Math.random() * 8,
            layer: 1,
            seed: Math.random() * Math.PI * 2,
          });
        }
        const rainCount = isMobile ? 28 : 46;
        for (let i = 0; i < rainCount; i++) {
          rain.push({
            x: Math.random() * width,
            y: Math.random() * height,
            len: 14 + Math.random() * 20,
            speed: 9 + Math.random() * 7,
            alpha: 0.06 + Math.random() * 0.1,
          });
        }
        spawnLightning(0.4);
      } else if (mode === 'undersea') {
        const bubbleCount = isMobile ? 26 : 42;
        for (let i = 0; i < bubbleCount; i++) {
          bubbles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: 2.5 + Math.random() * 9.5,
            vy: 0.45 + Math.random() * 1.15,
            swayAmp: 12 + Math.random() * 28,
            swayFreq: 0.6 + Math.random() * 1.1,
            phase: Math.random() * Math.PI * 2,
            alpha: 0.22 + Math.random() * 0.34,
          });
        }
        const planktonCount = isMobile ? 24 : 38;
        for (let i = 0; i < planktonCount; i++) {
          plankton.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.25,
            r: 1.5 + Math.random() * 3.2,
            phase: Math.random() * Math.PI * 2,
            rgbIdx: i % 3,
          });
        }
      } else if (mode === 'lava') {
        const blobCount = isMobile ? 9 : 14;
        const minDim = Math.min(width, height);
        for (let i = 0; i < blobCount; i++) {
          lavaBlobs.push({
            x: width * (0.12 + Math.random() * 0.76),
            y: height * (0.12 + Math.random() * 0.78),
            baseR: minDim * (0.085 + Math.random() * 0.105),
            vy: (Math.random() < 0.5 ? -1 : 1) * (0.28 + Math.random() * 0.42),
            vx: (Math.random() - 0.5) * 0.22,
            phase: Math.random() * Math.PI * 2,
            wobbleFreq: 0.45 + Math.random() * 0.55,
            rgbIdx: i % 3,
          });
        }
      } else if (mode === 'nature') {
        const flyCount = isMobile ? 26 : 44;
        for (let i = 0; i < flyCount; i++) {
          fireflies.push({
            x: Math.random() * width,
            y: height * (0.12 + Math.random() * 0.82),
            vx: (Math.random() - 0.5) * 0.45,
            vy: (Math.random() - 0.5) * 0.35,
            r: 2.2 + Math.random() * 3.4,
            phase: Math.random() * Math.PI * 2,
            pulseSpeed: 1.2 + Math.random() * 1.6,
            rgbIdx: i % 3,
          });
        }
        const leafCount = isMobile ? 10 : 16;
        for (let i = 0; i < leafCount; i++) {
          leaves.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: 0.35 + Math.random() * 0.55,
            vy: 0.3 + Math.random() * 0.5,
            size: 5 + Math.random() * 6.5,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.025,
            swayPhase: Math.random() * Math.PI * 2,
            alpha: 0.28 + Math.random() * 0.32,
            rgbIdx: i % 3,
          });
        }
      } else if (mode === 'rain') {
        const bokehCount = isMobile ? 9 : 15;
        for (let i = 0; i < bokehCount; i++) {
          bokehOrbs.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: (isMobile ? 45 : 75) + Math.random() * 90,
            rgbIdx: i % 3,
            phase: Math.random() * Math.PI * 2,
          });
        }
        const dropCount = isMobile ? 55 : 95;
        for (let i = 0; i < dropCount; i++) {
          const sliding = Math.random() < 0.34;
          glassDrops.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: sliding ? 2.6 + Math.random() * 3.4 : 1.3 + Math.random() * 2.6,
            vy: sliding ? 0.65 + Math.random() * 1.65 : 0,
            sliding,
            trailLen: sliding ? 24 + Math.random() * 68 : 0,
            wobble: Math.random() * Math.PI * 2,
            alpha: 0.35 + Math.random() * 0.45,
          });
        }
      } else if (mode === 'synthwave' || mode === 'eclipse' || mode === 'aurora' || mode === 'blackhole') {
        const starCount = isMobile ? 75 : 130;
        for (let i = 0; i < starCount; i++) {
          stars.push({
            x: Math.random() * width,
            y: mode === 'synthwave' ? Math.random() * height * 0.56 : Math.random() * height,
            r: Math.random() * 1.45 + 0.35,
            baseAlpha: Math.random() * 0.55 + 0.2,
            twinkleSpeed: Math.random() * 1.7 + 0.4,
            phase: Math.random() * Math.PI * 2,
            sparkle: Math.random() < 0.1,
          });
        }
        if (mode === 'blackhole') {
          const minDim = Math.min(width, height);
          const bhR = minDim * 0.13;
          const pCount = isMobile ? 90 : 155;
          for (let i = 0; i < pCount; i++) {
            const radius = bhR * (1.28 + Math.random() * 2.45);
            orbitParticles.push({
              angle: Math.random() * Math.PI * 2,
              radius,
              angularVel: (0.012 + (bhR * 2.4) / Math.max(40, radius) * 0.015) * (0.7 + Math.random() * 0.6),
              size: 1.2 + Math.random() * 2.4,
              tilt: 0.28 + Math.random() * 0.14,
              rgbIdx: i % 3,
              alpha: 0.32 + Math.random() * 0.58,
            });
          }
        }
      } else if (mode === 'nebula') {
        const starCount = isMobile ? 85 : 150;
        for (let i = 0; i < starCount; i++) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: Math.random() * 1.5 + 0.35,
            baseAlpha: Math.random() * 0.55 + 0.22,
            twinkleSpeed: Math.random() * 1.8 + 0.4,
            phase: Math.random() * Math.PI * 2,
            sparkle: Math.random() < 0.14,
          });
        }
        const cloudCount = isMobile ? 8 : 13;
        const maxDim = Math.max(width, height);
        for (let i = 0; i < cloudCount; i++) {
          nebulaClouds.push({
            x: Math.random() * width,
            y: Math.random() * height,
            rx: maxDim * (0.2 + Math.random() * 0.24),
            ry: maxDim * (0.12 + Math.random() * 0.16),
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.0018,
            vx: (Math.random() - 0.5) * 0.16,
            vy: (Math.random() - 0.5) * 0.12,
            rgbIdx: i % 3,
            alpha: 0.16 + Math.random() * 0.14,
          });
        }
      } else if (mode === 'bioluminescent') {
        const jCount = isMobile ? 5 : 8;
        for (let i = 0; i < jCount; i++) {
          jellies.push({
            x: width * (0.1 + Math.random() * 0.8),
            y: Math.random() * height,
            r: (isMobile ? 16 : 22) + Math.random() * 18,
            vy: 0.22 + Math.random() * 0.36,
            phase: Math.random() * Math.PI * 2,
            rgbIdx: i % 3,
          });
        }
        const sporeCount = isMobile ? 32 : 54;
        for (let i = 0; i < sporeCount; i++) {
          plankton.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.42,
            vy: -0.15 - Math.random() * 0.35,
            r: 1.6 + Math.random() * 3.4,
            phase: Math.random() * Math.PI * 2,
            rgbIdx: i % 3,
          });
        }
      } else if (mode === 'snowfall') {
        const flakeCount = isMobile ? 55 : 95;
        for (let i = 0; i < flakeCount; i++) {
          const soft = Math.random() < 0.28;
          snowflakes.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: soft ? 3.5 + Math.random() * 4.5 : 1.0 + Math.random() * 2.4,
            vy: soft ? 0.55 + Math.random() * 0.85 : 0.4 + Math.random() * 0.95,
            vx: 0.12 + Math.random() * 0.32,
            swayAmp: 0.25 + Math.random() * 0.65,
            swayFreq: 0.5 + Math.random() * 1.1,
            phase: Math.random() * Math.PI * 2,
            alpha: soft ? 0.2 + Math.random() * 0.25 : 0.45 + Math.random() * 0.45,
            soft,
          });
        }
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initThemeEntities();
    };

    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    let lastTs = performance.now();
    let simTime = performance.now() * 0.001;
    let spawnAccumulator = 0;
    let prevBass = 0;
    let lightningCooldown = 0.6;
    let cloudFlashAlpha = 0;
    let cloudFlashX = width * 0.5;
    let cloudFlashRgb = colorsRef.current.primaryRgb;

    const render = (now: number) => {
      if (document.hidden) {
        rafId = 0;
        return;
      }

      const rawDt = Math.min(0.05, Math.max(0.008, (now - lastTs) / 1000));
      lastTs = now;
      const spd = Math.max(0.2, Math.min(2.0, colorsRef.current.speed || 1.0));
      const dt = rawDt * spd;
      simTime += dt;
      const tSec = simTime;
      const step = dt * 60;

      const { primaryRgb: c1, secondaryRgb: c2, tertiaryRgb: c3, isPlaying: playing } = colorsRef.current;

      // Measure live audio energy (bass + mids) with smooth fallback for iOS/mobile
      let bass = 0;
      let mids = 0;
      const analyser = audioController.analyser;
      if (playing && analyser) {
        analyser.getByteFrequencyData(freqBuf);
        let bSum = 0;
        for (let i = 0; i < 12; i++) bSum += freqBuf[i];
        bass = Math.min(1, bSum / (12 * 200));

        let mSum = 0;
        for (let i = 12; i < 36; i++) mSum += freqBuf[i];
        mids = Math.min(1, mSum / (24 * 175));
      } else if (playing) {
        bass = 0.28 + 0.26 * Math.abs(Math.sin(tSec * 2.7)) + 0.14 * Math.abs(Math.cos(tSec * 4.1));
        mids = 0.22 + 0.18 * Math.abs(Math.sin(tSec * 1.9 + 1.1));
      } else {
        bass = 0.06;
        mids = 0.05;
      }

      const energy = bass * 0.72 + mids * 0.28;

      ctx.clearRect(0, 0, width, height);

      // ================================================================
      // 1. METEOR SHOWER / SPACE (Enhanced Viewability, Zero Clutter)
      // ================================================================
      if (mode === 'space') {
        const neb1 = ctx.createRadialGradient(
          width * 0.22,
          height * 0.24,
          10,
          width * 0.22,
          height * 0.24,
          Math.max(width, height) * 0.56
        );
        neb1.addColorStop(0, `rgba(${c1}, ${(0.16 + energy * 0.14).toFixed(3)})`);
        neb1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = neb1;
        ctx.fillRect(0, 0, width, height);

        const neb2 = ctx.createRadialGradient(
          width * 0.8,
          height * 0.76,
          10,
          width * 0.8,
          height * 0.76,
          Math.max(width, height) * 0.52
        );
        neb2.addColorStop(0, `rgba(${c2}, ${(0.14 + energy * 0.12).toFixed(3)})`);
        neb2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = neb2;
        ctx.fillRect(0, 0, width, height);

        // Twinkling starfield
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const twinkle = 0.52 + 0.48 * Math.sin(tSec * s.twinkleSpeed + s.phase);
          const a = Math.min(0.95, s.baseAlpha * twinkle + energy * 0.12);
          ctx.fillStyle = `rgba(242, 248, 255, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();

          if (s.sparkle && twinkle > 0.78) {
            ctx.strokeStyle = `rgba(${c1}, ${(a * 0.45).toFixed(3)})`;
            ctx.lineWidth = 0.8;
            const arm = s.r * 3.2;
            ctx.beginPath();
            ctx.moveTo(s.x - arm, s.y);
            ctx.lineTo(s.x + arm, s.y);
            ctx.moveTo(s.x, s.y - arm);
            ctx.lineTo(s.x, s.y + arm);
            ctx.stroke();
          }
        }

        // Spawn meteors at a clean, readable cadence
        const maxMeteors = width < 768 ? 14 : 22;
        const spawnsPerSec = playing ? 2.6 + energy * 5.8 : 1.25;
        spawnAccumulator += dt * spawnsPerSec;
        while (spawnAccumulator >= 1 && meteors.length < maxMeteors) {
          spawnAccumulator -= 1;
          spawnMeteor(energy);
        }

        // Draw brighter, soft-haloed meteors
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.x += m.vx * step;
          m.y += m.vy * step;
          m.life += step;

          const progress = m.life / m.maxLife;
          const fade = progress < 0.14 ? progress / 0.14 : Math.max(0, 1 - (progress - 0.14) / 0.86);
          const curAlpha = m.alpha * fade;

          if (m.life >= m.maxLife || m.x < -260 || m.y > height + 260) {
            meteors.splice(i, 1);
            continue;
          }

          const speedMag = Math.hypot(m.vx, m.vy) || 1;
          const tailX = m.x - (m.vx / speedMag) * m.length;
          const tailY = m.y - (m.vy / speedMag) * m.length;

          // Outer colored aura trail (makes meteors much more viewable without clutter)
          const auraGrad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
          auraGrad.addColorStop(0, `rgba(${m.rgb}, ${(curAlpha * 0.45).toFixed(3)})`);
          auraGrad.addColorStop(0.45, `rgba(${m.rgb}, ${(curAlpha * 0.18).toFixed(3)})`);
          auraGrad.addColorStop(1, `rgba(${m.rgb}, 0)`);
          ctx.strokeStyle = auraGrad;
          ctx.lineWidth = m.width * 3.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();

          // Crisp inner plasma tail
          const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
          grad.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, curAlpha * 1.15).toFixed(3)})`);
          grad.addColorStop(0.2, `rgba(${m.rgb}, ${Math.min(1, curAlpha * 1.0).toFixed(3)})`);
          grad.addColorStop(0.62, `rgba(${m.rgb}, ${(curAlpha * 0.48).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${m.rgb}, 0)`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = m.width;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();

          // Glowing head halo + crisp core
          const headGlow = ctx.createRadialGradient(m.x, m.y, 0.5, m.x, m.y, m.width * 4.5);
          headGlow.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, curAlpha).toFixed(3)})`);
          headGlow.addColorStop(0.35, `rgba(${m.rgb}, ${(curAlpha * 0.65).toFixed(3)})`);
          headGlow.addColorStop(1, `rgba(${m.rgb}, 0)`);
          ctx.fillStyle = headGlow;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.width * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ================================================================
      // 2. THUNDER & LIGHTNING (Top Storm Clouds + Audio-Reactive Bolts)
      // ================================================================
      else if (mode === 'thunder') {
        // Subtle atmospheric storm glow
        const stormGlow = ctx.createRadialGradient(
          width * 0.5,
          height * 0.14,
          20,
          width * 0.5,
          height * 0.25,
          Math.max(width, height) * 0.65
        );
        stormGlow.addColorStop(0, `rgba(${c1}, ${(0.12 + bass * 0.14 + cloudFlashAlpha * 0.24).toFixed(3)})`);
        stormGlow.addColorStop(0.55, `rgba(${c2}, ${(0.06 + mids * 0.06).toFixed(3)})`);
        stormGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = stormGlow;
        ctx.fillRect(0, 0, width, height);

        // Subtle diagonal rain streaks
        ctx.lineWidth = 1;
        for (let i = 0; i < rain.length; i++) {
          const r = rain[i];
          r.x -= r.speed * 0.22 * step;
          r.y += r.speed * (1 + bass * 0.35) * step;
          if (r.y > height + 30) {
            r.y = height * 0.08 + Math.random() * 40;
            r.x = Math.random() * (width + 120);
          }
          if (r.x < -40) r.x = width + 20;

          ctx.strokeStyle = `rgba(210, 228, 255, ${(r.alpha + cloudFlashAlpha * 0.08).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.lineTo(r.x - r.len * 0.22, r.y + r.len);
          ctx.stroke();
        }

        // Trigger lightning on bass transients or ambient interval
        lightningCooldown -= dt;
        const bassDelta = bass - prevBass;
        const shouldStrike =
          lightningCooldown <= 0 &&
          ((playing && (bassDelta > 0.075 || bass > 0.66)) ||
            (!playing && Math.random() < dt * 0.38) ||
            (playing && Math.random() < dt * (0.45 + bass * 1.4)));

        if (shouldStrike && bolts.length < 3) {
          spawnLightning(energy);
          const latest = bolts[bolts.length - 1];
          cloudFlashAlpha = 0.72 + energy * 0.28;
          cloudFlashX = latest.originX;
          cloudFlashRgb = latest.rgb;
          lightningCooldown = playing ? 0.55 + Math.random() * 0.75 : 2.2 + Math.random() * 2.5;
        }
        cloudFlashAlpha = Math.max(0, cloudFlashAlpha - dt * 2.4);

        // Draw active lightning bolts (behind front cloud edge, shooting downward)
        for (let i = bolts.length - 1; i >= 0; i--) {
          const b = bolts[i];
          b.life += step;
          if (b.life >= b.maxLife) {
            bolts.splice(i, 1);
            continue;
          }
          const p = b.life / b.maxLife;
          // Double-flicker envelope like real lightning
          const flicker = p < 0.22 ? 1 : p < 0.35 ? 0.35 : p < 0.52 ? 0.85 : Math.max(0, 1 - (p - 0.52) / 0.48);
          const alpha = flicker * b.intensity;

          // Origin cloud burst
          const burst = ctx.createRadialGradient(b.originX, b.originY, 4, b.originX, b.originY, 170);
          burst.addColorStop(0, `rgba(255, 255, 255, ${(alpha * 0.55).toFixed(3)})`);
          burst.addColorStop(0.35, `rgba(${b.rgb}, ${(alpha * 0.38).toFixed(3)})`);
          burst.addColorStop(1, `rgba(${b.rgb}, 0)`);
          ctx.fillStyle = burst;
          ctx.fillRect(b.originX - 170, Math.max(0, b.originY - 120), 340, 290);

          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Pass 1: Wide colored outer glow
          ctx.strokeStyle = `rgba(${b.rgb}, ${(alpha * 0.32).toFixed(3)})`;
          ctx.beginPath();
          for (let j = 0; j < b.segments.length; j++) {
            const seg = b.segments[j];
            ctx.lineWidth = seg.width * 5.2;
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
          }
          ctx.stroke();

          // Pass 2: Vibrant song-colored plasma sheath
          ctx.strokeStyle = `rgba(${b.rgb}, ${(alpha * 0.82).toFixed(3)})`;
          for (let j = 0; j < b.segments.length; j++) {
            const seg = b.segments[j];
            ctx.lineWidth = seg.width * 2.1;
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.stroke();
          }

          // Pass 3: Crisp white-hot bolt core
          ctx.strokeStyle = `rgba(250, 253, 255, ${Math.min(1, alpha * 1.1).toFixed(3)})`;
          for (let j = 0; j < b.segments.length; j++) {
            const seg = b.segments[j];
            ctx.lineWidth = Math.max(0.8, seg.width * 0.85);
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.stroke();
          }
        }

        // Top Storm Cloud Bank (drifting multi-layered clouds with glowing underbelly)
        for (let layer = 0; layer <= 1; layer++) {
          for (let i = 0; i < clouds.length; i++) {
            const cl = clouds[i];
            if (cl.layer !== layer) continue;
            cl.x += cl.speed * dt;
            if (cl.x - cl.rx > width + 80) {
              cl.x = -cl.rx - 40;
            }
            const bobY = cl.y + Math.sin(tSec * 0.45 + cl.seed) * 5;
            const distToFlash = Math.abs(cl.x - cloudFlashX);
            const flashProximity = Math.max(0, 1 - distToFlash / (width * 0.45));
            const underGlow = Math.min(0.65, bass * 0.22 + cloudFlashAlpha * flashProximity * 0.6);

            // Glowing cloud underbelly tinted by the song's colors
            if (underGlow > 0.04) {
              const glowG = ctx.createRadialGradient(
                cl.x,
                bobY + cl.ry * 0.42,
                cl.ry * 0.1,
                cl.x,
                bobY + cl.ry * 0.42,
                cl.rx * 0.95
              );
              glowG.addColorStop(0, `rgba(${cloudFlashAlpha > 0.1 ? cloudFlashRgb : c1}, ${(underGlow * 0.55).toFixed(3)})`);
              glowG.addColorStop(1, 'rgba(0, 0, 0, 0)');
              ctx.fillStyle = glowG;
              ctx.beginPath();
              ctx.ellipse(cl.x, bobY + cl.ry * 0.35, cl.rx * 1.05, cl.ry * 0.85, 0, 0, Math.PI * 2);
              ctx.fill();
            }

            // Dark volumetric cloud body
            const cloudGrad = ctx.createRadialGradient(
              cl.x,
              bobY - cl.ry * 0.15,
              cl.ry * 0.15,
              cl.x,
              bobY + cl.ry * 0.1,
              cl.rx
            );
            if (layer === 0) {
              cloudGrad.addColorStop(0, 'rgba(18, 22, 34, 0.86)');
              cloudGrad.addColorStop(0.65, 'rgba(12, 15, 25, 0.68)');
              cloudGrad.addColorStop(1, 'rgba(8, 10, 18, 0)');
            } else {
              cloudGrad.addColorStop(0, 'rgba(24, 29, 44, 0.90)');
              cloudGrad.addColorStop(0.6, 'rgba(14, 18, 30, 0.72)');
              cloudGrad.addColorStop(1, 'rgba(8, 10, 18, 0)');
            }
            ctx.fillStyle = cloudGrad;
            ctx.beginPath();
            ctx.ellipse(cl.x, bobY, cl.rx, cl.ry, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ================================================================
      // 3. WATER / UNDERSEA (Caustics, Light Shafts, Bubbles & Plankton)
      // ================================================================
      else if (mode === 'undersea') {
        // Underwater sunbeams / caustic light shafts from the top surface
        const shaftCount = width < 768 ? 5 : 7;
        for (let i = 0; i < shaftCount; i++) {
          const baseX = (width / (shaftCount + 1)) * (i + 1) + Math.sin(tSec * 0.38 + i * 1.3) * 45;
          const topW = 40 + (i % 3) * 28;
          const botW = topW * 3.4;
          const shiftX = 95 + Math.sin(tSec * 0.25 + i) * 35;
          const beamAlpha = (0.045 + mids * 0.065) * (0.7 + 0.3 * Math.sin(tSec * 0.9 + i * 2.1));
          const beamColor = i % 2 === 0 ? c1 : c2;

          const grad = ctx.createLinearGradient(baseX, 0, baseX + shiftX, height * 0.88);
          grad.addColorStop(0, `rgba(${beamColor}, ${(beamAlpha * 1.4).toFixed(3)})`);
          grad.addColorStop(0.45, `rgba(${beamColor}, ${(beamAlpha * 0.65).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${beamColor}, 0)`);

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(baseX - topW * 0.5, 0);
          ctx.lineTo(baseX + topW * 0.5, 0);
          ctx.lineTo(baseX + shiftX + botW * 0.5, height * 0.92);
          ctx.lineTo(baseX + shiftX - botW * 0.5, height * 0.92);
          ctx.closePath();
          ctx.fill();
        }

        // Gentle deep-sea current ribbon waves
        for (let w = 0; w < 2; w++) {
          ctx.beginPath();
          const baseY = height * (0.64 + w * 0.16);
          ctx.moveTo(0, height);
          for (let x = 0; x <= width; x += 36) {
            const y =
              baseY +
              Math.sin(x * 0.0045 + tSec * (0.55 + w * 0.22) + w * 2) * (18 + bass * 22) +
              Math.cos(x * 0.009 - tSec * 0.35) * 10;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fillStyle = `rgba(${w === 0 ? c1 : c2}, ${(0.055 + bass * 0.05).toFixed(3)})`;
          ctx.fill();
        }

        // Bioluminescent plankton motes
        for (let i = 0; i < plankton.length; i++) {
          const p = plankton[i];
          p.x += (p.vx + Math.sin(tSec * 0.6 + p.phase) * 0.22) * step;
          p.y += (p.vy + Math.cos(tSec * 0.5 + p.phase) * 0.18) * step;
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;

          const glow = 0.4 + 0.6 * Math.sin(tSec * 1.7 + p.phase);
          const rgb = getRgbByIdx(p.rgbIdx);
          const pr = p.r * (1 + energy * 0.55);
          const g = ctx.createRadialGradient(p.x, p.y, 0.2, p.x, p.y, pr * 3.2);
          g.addColorStop(0, `rgba(255, 255, 255, ${(glow * 0.65).toFixed(3)})`);
          g.addColorStop(0.35, `rgba(${rgb}, ${(glow * 0.45).toFixed(3)})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, pr * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Audio-reactive rising bubbles
        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i];
          b.y -= b.vy * (1 + bass * 1.45) * step;
          if (b.y < -b.r * 2) {
            b.y = height + b.r * 2 + Math.random() * 40;
            b.x = Math.random() * width;
          }
          const drawX = b.x + Math.sin(tSec * b.swayFreq + b.phase) * b.swayAmp;
          const rad = b.r * (1 + bass * 0.16);

          // Soft translucent bubble body
          const bg = ctx.createRadialGradient(drawX - rad * 0.3, b.y - rad * 0.3, rad * 0.1, drawX, b.y, rad);
          bg.addColorStop(0, `rgba(255, 255, 255, ${(b.alpha * 0.45).toFixed(3)})`);
          bg.addColorStop(0.65, `rgba(${c1}, ${(b.alpha * 0.16).toFixed(3)})`);
          bg.addColorStop(1, `rgba(${c2}, ${(b.alpha * 0.52).toFixed(3)})`);
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(drawX, b.y, rad, 0, Math.PI * 2);
          ctx.fill();

          // Rim + specular highlight dot
          ctx.strokeStyle = `rgba(220, 245, 255, ${(b.alpha * 0.72).toFixed(3)})`;
          ctx.lineWidth = 0.9;
          ctx.stroke();

          ctx.fillStyle = `rgba(255, 255, 255, ${(b.alpha * 0.9).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(drawX - rad * 0.32, b.y - rad * 0.32, Math.max(0.8, rad * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ================================================================
      // 4. LAVA LAMP (Smooth Floating Molten Wax Blobs)
      // ================================================================
      else if (mode === 'lava') {
        // Warm glowing lamp base at the bottom
        const baseGlow = ctx.createRadialGradient(
          width * 0.5,
          height * 1.04,
          10,
          width * 0.5,
          height * 1.0,
          Math.max(width, height) * 0.62
        );
        baseGlow.addColorStop(0, `rgba(${c1}, ${(0.32 + bass * 0.24).toFixed(3)})`);
        baseGlow.addColorStop(0.45, `rgba(${c2}, ${(0.14 + mids * 0.12).toFixed(3)})`);
        baseGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = baseGlow;
        ctx.fillRect(0, 0, width, height);

        // Soft top cap ambient reflection
        const topGlow = ctx.createRadialGradient(
          width * 0.5,
          -height * 0.05,
          10,
          width * 0.5,
          0,
          Math.max(width, height) * 0.42
        );
        topGlow.addColorStop(0, `rgba(${c3}, ${(0.12 + mids * 0.08).toFixed(3)})`);
        topGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = topGlow;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        for (let i = 0; i < lavaBlobs.length; i++) {
          const blob = lavaBlobs[i];
          const speedBoost = 1 + energy * 0.85;
          blob.y += blob.vy * speedBoost * step;
          blob.x += (blob.vx + Math.sin(tSec * 0.35 + blob.phase) * 0.18) * step;

          // Smooth convection turn-around at top & bottom of the lamp
          const topBound = height * 0.1;
          const botBound = height * 0.9;
          if (blob.y < topBound) {
            blob.vy += 0.012 * step;
          } else if (blob.y > botBound) {
            blob.vy -= 0.012 * step;
          }
          // Keep vertical velocity in gentle lava-lamp range
          blob.vy = Math.max(-0.95, Math.min(0.95, blob.vy));

          // Soft horizontal walls
          if (blob.x < width * 0.08) blob.vx = Math.abs(blob.vx) + 0.04;
          if (blob.x > width * 0.92) blob.vx = -Math.abs(blob.vx) - 0.04;

          const rgb = getRgbByIdx(blob.rgbIdx);
          const pulseR = blob.baseR * (1 + bass * 0.14 + Math.sin(tSec * blob.wobbleFreq + blob.phase) * 0.06);
          const stretchX = 1 + Math.sin(tSec * blob.wobbleFreq * 1.1 + blob.phase) * 0.14;
          const stretchY = 1 / stretchX;

          ctx.save();
          ctx.translate(blob.x, blob.y);
          ctx.scale(stretchX, stretchY);

          // Soft outer molten halo
          const outer = ctx.createRadialGradient(0, 0, pulseR * 0.25, 0, 0, pulseR * 1.45);
          outer.addColorStop(0, `rgba(${rgb}, ${(0.44 + bass * 0.16).toFixed(3)})`);
          outer.addColorStop(0.58, `rgba(${rgb}, ${(0.2 + bass * 0.08).toFixed(3)})`);
          outer.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = outer;
          ctx.beginPath();
          ctx.arc(0, 0, pulseR * 1.45, 0, Math.PI * 2);
          ctx.fill();

          // Distinct glossy molten wax core
          const core = ctx.createRadialGradient(
            -pulseR * 0.24,
            -pulseR * 0.24,
            pulseR * 0.08,
            0,
            0,
            pulseR * 0.88
          );
          core.addColorStop(0, `rgba(255, 255, 255, ${(0.32 + bass * 0.12).toFixed(3)})`);
          core.addColorStop(0.32, `rgba(${rgb}, ${(0.68 + bass * 0.14).toFixed(3)})`);
          core.addColorStop(0.84, `rgba(${rgb}, ${(0.42 + bass * 0.1).toFixed(3)})`);
          core.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(0, 0, pulseR * 0.88, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }

        ctx.restore();
      }

      // ================================================================
      // 5. NATURE (Twilight Forest Canopy, Sunbeams, Fireflies & Leaves)
      // ================================================================
      else if (mode === 'nature') {
        // Soft forest moonlight / sunbeams filtering diagonally from top-left
        for (let i = 0; i < 4; i++) {
          const sx = width * (0.08 + i * 0.22) + Math.sin(tSec * 0.25 + i) * 30;
          const beamAlpha = (0.04 + mids * 0.055) * (0.75 + 0.25 * Math.sin(tSec * 0.7 + i * 1.6));
          const g = ctx.createLinearGradient(sx, 0, sx + width * 0.22, height * 0.85);
          g.addColorStop(0, `rgba(${i % 2 === 0 ? c1 : c3}, ${(beamAlpha * 1.35).toFixed(3)})`);
          g.addColorStop(0.6, `rgba(${c2}, ${(beamAlpha * 0.45).toFixed(3)})`);
          g.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(sx - 35, 0);
          ctx.lineTo(sx + 55, 0);
          ctx.lineTo(sx + width * 0.28, height * 0.88);
          ctx.lineTo(sx + width * 0.12, height * 0.88);
          ctx.closePath();
          ctx.fill();
        }

        // Subtle organic canopy silhouette along top edge
        ctx.fillStyle = 'rgba(4, 14, 10, 0.58)';
        for (let i = 0; i < 7; i++) {
          const cx = (width / 6) * i + Math.sin(tSec * 0.3 + i) * 8;
          const r = (width < 768 ? 72 : 120) + (i % 3) * 28;
          ctx.beginPath();
          ctx.arc(cx, -r * 0.45, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Subtle rolling forest floor hills at the very bottom
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 40) {
          const y = height - 28 - Math.sin(x * 0.004 + 0.6) * 22 - Math.cos(x * 0.009) * 10;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(4, 14, 9, 0.55)';
        ctx.fill();

        // Drifting leaves / petals on a gentle breeze
        for (let i = 0; i < leaves.length; i++) {
          const lf = leaves[i];
          lf.x += (lf.vx + Math.sin(tSec * 0.8 + lf.swayPhase) * 0.35 + energy * 0.35) * step;
          lf.y += (lf.vy + Math.cos(tSec * 0.9 + lf.swayPhase) * 0.18) * step;
          lf.angle += lf.spin * (1 + energy * 0.8) * step;

          if (lf.x > width + 30) lf.x = -25;
          if (lf.y > height + 30) {
            lf.y = -20;
            lf.x = Math.random() * width;
          }

          const rgb = getRgbByIdx(lf.rgbIdx);
          ctx.save();
          ctx.translate(lf.x, lf.y);
          ctx.rotate(lf.angle);
          ctx.fillStyle = `rgba(${rgb}, ${(lf.alpha + mids * 0.14).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, lf.size, lf.size * 0.46, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Audio-reactive glowing fireflies
        for (let i = 0; i < fireflies.length; i++) {
          const f = fireflies[i];
          f.x += (f.vx + Math.sin(tSec * 0.75 + f.phase) * 0.42) * step;
          f.y += (f.vy + Math.cos(tSec * 0.65 + f.phase * 1.3) * 0.36) * step;
          if (f.x < -15) f.x = width + 15;
          if (f.x > width + 15) f.x = -15;
          if (f.y < height * 0.08) f.y = height * 0.92;
          if (f.y > height * 0.96) f.y = height * 0.12;

          const pulse = 0.38 + 0.62 * Math.pow(0.5 + 0.5 * Math.sin(tSec * f.pulseSpeed + f.phase), 1.6);
          const intensity = Math.min(1, pulse * (0.72 + bass * 0.68));
          const rgb = getRgbByIdx(f.rgbIdx);
          const haloR = f.r * (4.2 + bass * 2.4);

          const fg = ctx.createRadialGradient(f.x, f.y, 0.3, f.x, f.y, haloR);
          fg.addColorStop(0, `rgba(255, 255, 235, ${intensity.toFixed(3)})`);
          fg.addColorStop(0.3, `rgba(${rgb}, ${(intensity * 0.68).toFixed(3)})`);
          fg.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(f.x, f.y, haloR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ================================================================
      // 6. RAIN ON GLASS (Window Droplets, Wet Trails & Soft Bokeh)
      // ================================================================
      else if (mode === 'rain') {
        // Blurred bokeh city/song lights behind the wet windowpane
        for (let i = 0; i < bokehOrbs.length; i++) {
          const bk = bokehOrbs[i];
          const rgb = getRgbByIdx(bk.rgbIdx);
          const pulse = 0.78 + 0.22 * Math.sin(tSec * 0.9 + bk.phase);
          const r = bk.r * (1 + bass * 0.12);
          const g = ctx.createRadialGradient(bk.x, bk.y, r * 0.1, bk.x, bk.y, r);
          g.addColorStop(0, `rgba(${rgb}, ${(0.16 * pulse + bass * 0.08).toFixed(3)})`);
          g.addColorStop(0.55, `rgba(${rgb}, ${(0.07 * pulse).toFixed(3)})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bk.x, bk.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Droplets beading and rolling down the glass
        for (let i = 0; i < glassDrops.length; i++) {
          const d = glassDrops[i];
          if (d.sliding) {
            d.y += d.vy * (1 + bass * 1.1) * step;
            d.x += Math.sin(d.y * 0.03 + d.wobble) * 0.16 * step;
            if (d.y - d.trailLen > height + 20) {
              d.y = -10 - Math.random() * 40;
              d.x = Math.random() * width;
            }
            // Glistening wet trail behind sliding droplet
            const tGrad = ctx.createLinearGradient(d.x, d.y, d.x, d.y - d.trailLen);
            tGrad.addColorStop(0, `rgba(215, 235, 255, ${(d.alpha * 0.42).toFixed(3)})`);
            tGrad.addColorStop(0.5, `rgba(${c1}, ${(d.alpha * 0.18).toFixed(3)})`);
            tGrad.addColorStop(1, 'rgba(215, 235, 255, 0)');
            ctx.strokeStyle = tGrad;
            ctx.lineWidth = Math.max(1, d.r * 0.65);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x, d.y - d.trailLen);
            ctx.stroke();
          } else if (playing && bass > 0.68 && Math.random() < dt * 0.12) {
            // Bass vibration occasionally dislodges a static drop
            d.sliding = true;
            d.vy = 0.7 + Math.random() * 1.2;
            d.trailLen = 28 + Math.random() * 50;
          }

          // Refractive water bead
          const dg = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.35, 0.2, d.x, d.y, d.r * 1.25);
          dg.addColorStop(0, `rgba(255, 255, 255, ${(d.alpha * 0.92).toFixed(3)})`);
          dg.addColorStop(0.45, `rgba(${c2}, ${(d.alpha * 0.28).toFixed(3)})`);
          dg.addColorStop(1, `rgba(195, 225, 255, ${(d.alpha * 0.55).toFixed(3)})`);
          ctx.fillStyle = dg;
          ctx.beginPath();
          ctx.ellipse(d.x, d.y, d.r * 0.9, d.r * (d.sliding ? 1.25 : 1.05), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ================================================================
      // 7. SYNTHWAVE (Retro Segmented Sun + Perspective Neon Grid)
      // ================================================================
      else if (mode === 'synthwave') {
        const horizonY = height * 0.58;

        // Upper twilight stars
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const tw = 0.55 + 0.45 * Math.sin(tSec * s.twinkleSpeed + s.phase);
          ctx.fillStyle = `rgba(245, 240, 255, ${(s.baseAlpha * tw).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Horizon atmospheric glow
        const hGlow = ctx.createRadialGradient(
          width * 0.5,
          horizonY,
          10,
          width * 0.5,
          horizonY,
          Math.max(width, height) * 0.58
        );
        hGlow.addColorStop(0, `rgba(${c1}, ${(0.34 + bass * 0.24).toFixed(3)})`);
        hGlow.addColorStop(0.45, `rgba(${c2}, ${(0.16 + mids * 0.1).toFixed(3)})`);
        hGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = hGlow;
        ctx.fillRect(0, 0, width, height);

        // Glowing segmented retro sun above the horizon
        const sunR = Math.min(width, height) * (0.16 + bass * 0.025);
        const sunX = width * 0.5;
        const sunY = horizonY - sunR * 0.52;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.clip();

        const sunGrad = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
        sunGrad.addColorStop(0, `rgba(${c3}, 0.92)`);
        sunGrad.addColorStop(0.5, `rgba(${c1}, 0.88)`);
        sunGrad.addColorStop(1, `rgba(${c2}, 0.82)`);
        ctx.fillStyle = sunGrad;
        ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

        // Classic retro horizontal sun scanline bands
        ctx.fillStyle = '#090612';
        for (let b = 0; b < 6; b++) {
          const bandY = sunY + sunR * (0.05 + b * 0.165);
          const bandH = 2.2 + b * 1.45;
          ctx.fillRect(sunX - sunR, bandY, sunR * 2, bandH);
        }
        ctx.restore();

        // Dark ground plane below horizon
        const groundGrad = ctx.createLinearGradient(0, horizonY, 0, height);
        groundGrad.addColorStop(0, '#10071e');
        groundGrad.addColorStop(1, '#040308');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, horizonY, width, height - horizonY);

        // Scrolling perspective neon grid
        ctx.save();
        ctx.strokeStyle = `rgba(${c2}, ${(0.34 + bass * 0.25).toFixed(3)})`;
        ctx.lineWidth = 1.1;

        // Horizontal perspective lines advancing toward viewer
        const gridLines = 14;
        const scrollOffset = (tSec * (0.45 + energy * 0.35)) % 1;
        for (let i = 0; i < gridLines; i++) {
          const z = (i + scrollOffset) / gridLines;
          const y = horizonY + Math.pow(z, 2.15) * (height - horizonY);
          ctx.globalAlpha = Math.min(1, z * 1.15);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Radial perspective vertical lines from vanishing point
        ctx.strokeStyle = `rgba(${c1}, ${(0.28 + mids * 0.2).toFixed(3)})`;
        ctx.globalAlpha = 0.85;
        const vCount = 16;
        for (let i = -vCount; i <= vCount; i++) {
          const bottomX = width * 0.5 + i * (width * 0.12);
          ctx.beginPath();
          ctx.moveTo(width * 0.5, horizonY);
          ctx.lineTo(bottomX, height);
          ctx.stroke();
        }

        // Bright horizon laser line
        ctx.globalAlpha = 1;
        ctx.strokeStyle = `rgba(${c1}, ${(0.7 + bass * 0.25).toFixed(3)})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(width, horizonY);
        ctx.stroke();
        ctx.restore();
      }

      // ================================================================
      // 8. SOLAR ECLIPSE (Dark Lunar Disc + Pulsing Corona & Flares)
      // ================================================================
      else if (mode === 'eclipse') {
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const tw = 0.5 + 0.5 * Math.sin(tSec * s.twinkleSpeed + s.phase);
          ctx.fillStyle = `rgba(245, 248, 255, ${(s.baseAlpha * tw * 0.85).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }

        const cx = width * 0.5;
        const cy = height * 0.42;
        const moonR = Math.min(width, height) * 0.165;

        // Outer expansive corona halo
        const outerCorona = ctx.createRadialGradient(cx, cy, moonR * 0.9, cx, cy, moonR * (2.6 + bass * 0.85));
        outerCorona.addColorStop(0, `rgba(255, 255, 255, ${(0.55 + bass * 0.25).toFixed(3)})`);
        outerCorona.addColorStop(0.18, `rgba(${c1}, ${(0.45 + bass * 0.24).toFixed(3)})`);
        outerCorona.addColorStop(0.52, `rgba(${c2}, ${(0.18 + mids * 0.14).toFixed(3)})`);
        outerCorona.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = outerCorona;
        ctx.beginPath();
        ctx.arc(cx, cy, moonR * (2.6 + bass * 0.85), 0, Math.PI * 2);
        ctx.fill();

        // Swirling plasma corona streamers around the eclipse rim
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const rayCount = 24;
        for (let i = 0; i < rayCount; i++) {
          const angle = (i / rayCount) * Math.PI * 2 + tSec * (i % 2 === 0 ? 0.08 : -0.06);
          const wave = 0.65 + 0.35 * Math.sin(tSec * 1.8 + i * 1.3);
          const len = moonR * (1.28 + wave * 0.52 + bass * 0.65);
          const sx = cx + Math.cos(angle) * moonR * 0.94;
          const sy = cy + Math.sin(angle) * moonR * 0.94;
          const ex = cx + Math.cos(angle) * len;
          const ey = cy + Math.sin(angle) * len;
          const rg = ctx.createLinearGradient(sx, sy, ex, ey);
          rg.addColorStop(0, `rgba(${i % 2 === 0 ? c1 : c3}, ${(0.42 + bass * 0.28).toFixed(3)})`);
          rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.strokeStyle = rg;
          ctx.lineWidth = 4 + wave * 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        ctx.restore();

        // Crisp glowing ring of fire
        ctx.strokeStyle = `rgba(255, 250, 240, ${(0.82 + bass * 0.18).toFixed(3)})`;
        ctx.lineWidth = 2.4 + bass * 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, moonR + 1.5, 0, Math.PI * 2);
        ctx.stroke();

        // Pitch-black lunar silhouette
        ctx.fillStyle = '#030306';
        ctx.beginPath();
        ctx.arc(cx, cy, moonR, 0, Math.PI * 2);
        ctx.fill();

        // Diamond-ring glint on upper-right rim
        const gx = cx + Math.cos(-0.68) * (moonR + 2);
        const gy = cy + Math.sin(-0.68) * (moonR + 2);
        const glintR = 26 + bass * 22;
        const glint = ctx.createRadialGradient(gx, gy, 1, gx, gy, glintR);
        glint.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        glint.addColorStop(0.3, `rgba(${c3}, 0.55)`);
        glint.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glint;
        ctx.beginPath();
        ctx.arc(gx, gy, glintR, 0, Math.PI * 2);
        ctx.fill();
      }

      // ================================================================
      // 9. NEBULA (Swirling Deep-Space Cosmic Gas Clouds & Star Clusters)
      // ================================================================
      else if (mode === 'nebula') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < nebulaClouds.length; i++) {
          const nc = nebulaClouds[i];
          nc.x += nc.vx * step;
          nc.y += nc.vy * step;
          nc.rot += nc.rotSpeed * step;
          if (nc.x < -nc.rx) nc.x = width + nc.rx;
          if (nc.x > width + nc.rx) nc.x = -nc.rx;
          if (nc.y < -nc.ry) nc.y = height + nc.ry;
          if (nc.y > height + nc.ry) nc.y = -nc.ry;

          const rgb = getRgbByIdx(nc.rgbIdx);
          const scale = 1 + bass * 0.12 + Math.sin(tSec * 0.4 + i) * 0.05;
          ctx.save();
          ctx.translate(nc.x, nc.y);
          ctx.rotate(nc.rot);
          ctx.scale(scale, scale * (nc.ry / Math.max(1, nc.rx)));

          const g = ctx.createRadialGradient(0, 0, nc.rx * 0.05, 0, 0, nc.rx);
          g.addColorStop(0, `rgba(${rgb}, ${(nc.alpha + energy * 0.12).toFixed(3)})`);
          g.addColorStop(0.55, `rgba(${rgb}, ${(nc.alpha * 0.45).toFixed(3)})`);
          g.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, nc.rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();

        // Embedded glittering star clusters
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const tw = 0.5 + 0.5 * Math.sin(tSec * s.twinkleSpeed + s.phase);
          const a = Math.min(0.95, s.baseAlpha * tw + mids * 0.12);
          ctx.fillStyle = `rgba(245, 250, 255, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ================================================================
      // 10. AURORA BOREALIS (Flowing Northern Lights Curtains)
      // ================================================================
      else if (mode === 'aurora') {
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const tw = 0.55 + 0.45 * Math.sin(tSec * s.twinkleSpeed + s.phase);
          ctx.fillStyle = `rgba(240, 248, 255, ${(s.baseAlpha * tw * 0.85).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const curtains = 4;
        const stepX = width < 768 ? 22 : 16;
        for (let c = 0; c < curtains; c++) {
          const rgb = getRgbByIdx(c % 3);
          const baseY = height * (0.28 + c * 0.11);
          const ribbonH = height * (0.24 + bass * 0.14 + (c % 2) * 0.05);
          for (let x = 0; x <= width; x += stepX) {
            const wave =
              Math.sin(x * 0.0042 + tSec * (0.45 + c * 0.14) + c * 1.7) * 42 +
              Math.cos(x * 0.009 - tSec * 0.32 + c) * 20;
            const yBot = baseY + wave;
            const yTop = yBot - ribbonH * (0.7 + 0.3 * Math.sin(x * 0.006 + tSec * 0.7 + c));
            const alpha = (0.1 + energy * 0.12) * (0.65 + 0.35 * Math.sin(x * 0.008 - tSec * 0.9 + c * 2));

            const colGrad = ctx.createLinearGradient(x, yBot, x, yTop);
            colGrad.addColorStop(0, `rgba(${rgb}, 0)`);
            colGrad.addColorStop(0.22, `rgba(${rgb}, ${alpha.toFixed(3)})`);
            colGrad.addColorStop(0.65, `rgba(${c % 2 === 0 ? c2 : c3}, ${(alpha * 0.55).toFixed(3)})`);
            colGrad.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = colGrad;
            ctx.fillRect(x, yTop, stepX + 1, yBot - yTop);
          }
        }
        ctx.restore();
      }

      // ================================================================
      // 11. BIOLUMINESCENT (Glowing Jellyfish Pulses & Luminous Spores)
      // ================================================================
      else if (mode === 'bioluminescent') {
        // Floating glowing spores
        for (let i = 0; i < plankton.length; i++) {
          const p = plankton[i];
          p.x += (p.vx + Math.sin(tSec * 0.8 + p.phase) * 0.3) * step;
          p.y += p.vy * (1 + bass * 0.9) * step;
          if (p.y < -15) {
            p.y = height + 15;
            p.x = Math.random() * width;
          }
          if (p.x < -15) p.x = width + 15;
          if (p.x > width + 15) p.x = -15;

          const rgb = getRgbByIdx(p.rgbIdx);
          const pulse = 0.45 + 0.55 * Math.sin(tSec * 2.1 + p.phase);
          const r = p.r * (2.6 + bass * 2.0);
          const g = ctx.createRadialGradient(p.x, p.y, 0.2, p.x, p.y, r);
          g.addColorStop(0, `rgba(255, 255, 255, ${(pulse * 0.8).toFixed(3)})`);
          g.addColorStop(0.35, `rgba(${rgb}, ${(pulse * 0.65).toFixed(3)})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Translucent pulsing jellyfish bells & trails
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < jellies.length; i++) {
          const j = jellies[i];
          const swimPulse = Math.sin(tSec * 1.45 + j.phase);
          j.y -= (j.vy + Math.max(0, swimPulse) * 0.38) * (1 + bass * 0.8) * step;
          j.x += Math.sin(tSec * 0.45 + j.phase) * 0.28 * step;
          if (j.y < -j.r * 4) {
            j.y = height + j.r * 3;
            j.x = width * (0.1 + Math.random() * 0.8);
          }

          const rgb = getRgbByIdx(j.rgbIdx);
          const rx = j.r * (1 + swimPulse * 0.12 + bass * 0.12);
          const ry = j.r * (0.72 - swimPulse * 0.08);

          // Luminous aura around bell
          const aura = ctx.createRadialGradient(j.x, j.y, rx * 0.15, j.x, j.y, rx * 2.3);
          aura.addColorStop(0, `rgba(${rgb}, ${(0.42 + bass * 0.25).toFixed(3)})`);
          aura.addColorStop(0.55, `rgba(${rgb}, ${(0.14 + mids * 0.1).toFixed(3)})`);
          aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = aura;
          ctx.beginPath();
          ctx.arc(j.x, j.y, rx * 2.3, 0, Math.PI * 2);
          ctx.fill();

          // Dome bell
          ctx.fillStyle = `rgba(${rgb}, ${(0.34 + bass * 0.18).toFixed(3)})`;
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.45 + bass * 0.25).toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(j.x, j.y, rx, ry, 0, Math.PI, Math.PI * 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Flowing glowing tentacles
          ctx.strokeStyle = `rgba(${rgb}, ${(0.35 + mids * 0.22).toFixed(3)})`;
          ctx.lineWidth = 1;
          for (let t = -2; t <= 2; t++) {
            const tx = j.x + (t / 2.6) * rx;
            ctx.beginPath();
            ctx.moveTo(tx, j.y);
            ctx.quadraticCurveTo(
              tx + Math.sin(tSec * 2 + j.phase + t) * 10,
              j.y + j.r * 1.35,
              tx + Math.cos(tSec * 1.5 + j.phase + t) * 14,
              j.y + j.r * 2.6
            );
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // ================================================================
      // 12. SNOWFALL (Multi-Depth Drifting Winter Flakes + Frost Glow)
      // ================================================================
      else if (mode === 'snowfall') {
        const frostGlow = ctx.createRadialGradient(
          width * 0.5,
          0,
          20,
          width * 0.5,
          height * 0.15,
          Math.max(width, height) * 0.65
        );
        frostGlow.addColorStop(0, `rgba(${c1}, ${(0.16 + mids * 0.12).toFixed(3)})`);
        frostGlow.addColorStop(0.5, `rgba(${c2}, ${(0.08 + bass * 0.06).toFixed(3)})`);
        frostGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = frostGlow;
        ctx.fillRect(0, 0, width, height);

        const wind = (0.35 + mids * 0.85) * Math.sin(tSec * 0.28);
        for (let i = 0; i < snowflakes.length; i++) {
          const sf = snowflakes[i];
          sf.y += sf.vy * (1 + energy * 0.55) * step;
          sf.x += (sf.vx + wind + Math.sin(tSec * sf.swayFreq + sf.phase) * sf.swayAmp) * step;
          if (sf.y > height + 16) {
            sf.y = -12;
            sf.x = Math.random() * width;
          }
          if (sf.x > width + 16) sf.x = -12;
          if (sf.x < -16) sf.x = width + 12;

          if (sf.soft) {
            const g = ctx.createRadialGradient(sf.x, sf.y, 0.2, sf.x, sf.y, sf.r * 1.4);
            g.addColorStop(0, `rgba(245, 250, 255, ${(sf.alpha * 0.9).toFixed(3)})`);
            g.addColorStop(0.55, `rgba(${c2}, ${(sf.alpha * 0.35).toFixed(3)})`);
            g.addColorStop(1, 'rgba(245, 250, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(sf.x, sf.y, sf.r * 1.4, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = `rgba(245, 250, 255, ${(sf.alpha + bass * 0.1).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(sf.x, sf.y, sf.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // ================================================================
      // 13. BLACKHOLE (Event Horizon, Photon Ring & Accretion Disk)
      // ================================================================
      else if (mode === 'blackhole') {
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const tw = 0.5 + 0.5 * Math.sin(tSec * s.twinkleSpeed + s.phase);
          ctx.fillStyle = `rgba(240, 246, 255, ${(s.baseAlpha * tw * 0.78).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }

        const cx = width * 0.5;
        const cy = height * 0.48;
        const bhR = Math.min(width, height) * 0.135;

        // Gravitational lensing halo
        const lens = ctx.createRadialGradient(cx, cy, bhR * 0.85, cx, cy, bhR * (3.1 + bass * 0.7));
        lens.addColorStop(0, `rgba(255, 255, 255, ${(0.35 + bass * 0.2).toFixed(3)})`);
        lens.addColorStop(0.22, `rgba(${c1}, ${(0.36 + bass * 0.22).toFixed(3)})`);
        lens.addColorStop(0.55, `rgba(${c2}, ${(0.14 + mids * 0.1).toFixed(3)})`);
        lens.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = lens;
        ctx.beginPath();
        ctx.arc(cx, cy, bhR * (3.1 + bass * 0.7), 0, Math.PI * 2);
        ctx.fill();

        // Update & draw back half of orbiting accretion disk
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < orbitParticles.length; i++) {
          const op = orbitParticles[i];
          op.angle += op.angularVel * (1 + bass * 1.15) * step;
          if (Math.sin(op.angle) >= 0) continue; // front half drawn after event horizon
          const px = cx + Math.cos(op.angle) * op.radius;
          const py = cy + Math.sin(op.angle) * op.radius * op.tilt;
          const rgb = getRgbByIdx(op.rgbIdx);
          ctx.fillStyle = `rgba(${rgb}, ${(op.alpha * 0.72).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, op.size * (1 + bass * 0.35), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Glowing warped photon ring around the event horizon
        ctx.strokeStyle = `rgba(${c1}, ${(0.72 + bass * 0.25).toFixed(3)})`;
        ctx.lineWidth = 3.2 + bass * 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy, bhR * 1.04, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 248, 235, ${(0.85 + bass * 0.15).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, bhR * 1.01, 0, Math.PI * 2);
        ctx.stroke();

        // Pitch-black singularity event horizon
        ctx.fillStyle = '#020204';
        ctx.beginPath();
        ctx.arc(cx, cy, bhR, 0, Math.PI * 2);
        ctx.fill();

        // Front half of orbiting accretion disk sweeping across the event horizon
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < orbitParticles.length; i++) {
          const op = orbitParticles[i];
          if (Math.sin(op.angle) < 0) continue;
          const px = cx + Math.cos(op.angle) * op.radius;
          const py = cy + Math.sin(op.angle) * op.radius * op.tilt;
          const rgb = getRgbByIdx(op.rgbIdx);
          const pr = op.size * (1.15 + bass * 0.45);
          const pg = ctx.createRadialGradient(px, py, 0.2, px, py, pr * 2.6);
          pg.addColorStop(0, `rgba(255, 255, 255, ${(op.alpha * 0.9).toFixed(3)})`);
          pg.addColorStop(0.4, `rgba(${rgb}, ${(op.alpha * 0.78).toFixed(3)})`);
          pg.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(px, py, pr * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      prevBass = bass;
      rafId = requestAnimationFrame(render);
    };

    const handleVisibility = () => {
      if (!document.hidden && !rafId) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(render);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
};
