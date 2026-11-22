import React, { useEffect, useRef } from 'react';
import { audioController } from './AudioVisualizer';
import type { UiStyleMode } from './themesCatalog';
import type { ExtraThemeState } from './extraThemeRenderers';

type ExtraRenderersModule = typeof import('./extraThemeRenderers');
let cachedExtraModule: ExtraRenderersModule | null = null;
let loadingExtraPromise: Promise<ExtraRenderersModule> | null = null;

function loadExtraRenderers(): Promise<ExtraRenderersModule> {
  if (cachedExtraModule) return Promise.resolve(cachedExtraModule);
  if (!loadingExtraPromise) {
    loadingExtraPromise = import('./extraThemeRenderers').then((mod) => {
      cachedExtraModule = mod;
      return mod;
    });
  }
  return loadingExtraPromise;
}

const CORE_CANVAS_MODES = new Set<string>([
  'space', 'thunder', 'undersea', 'lava', 'nature', 'rain', 'synthwave', 'eclipse',
  'nebula', 'aurora', 'bioluminescent', 'snowfall', 'blackhole', 'ink', 'bokeh',
  'tunnel', 'vinyl', 'oscilloscope', 'vumeter', 'kaleidoscope', 'voronoi', 'crt',
  'topographic', 'laser', 'circuit', 'origami', 'thermal', 'turing', 'moire',
  'halftone', 'pixelsort', 'caustics', 'prism', 'ferrofluid', 'oilslick',
]);

const PIXEL_SHADER_MODES = new Set<string>([
  'thermal', 'turing', 'caustics', 'oilslick', 'chladni', 'julia', 'dither', 'soapfilm',
]);

export type AnimatedThemeMode = Exclude<UiStyleMode, 'liquid'>;

interface ThemeBackgroundCanvasProps {
  mode: AnimatedThemeMode;
  primaryRgb: string;
  secondaryRgb: string;
  tertiaryRgb: string;
  isPlaying: boolean;
  speed?: number;
  songTitle?: string;
  songArtist?: string;
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

interface RootBranch {
  points: { x: number; y: number }[];
  angle: number;
  width: number;
  depth: number;
  maxLen: number;
  grown: number;
  rgbIdx: number;
  alpha: number;
  done: boolean;
}

interface InkWisp {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  maxR: number;
  rot: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  rgbIdx: number;
  curlPhase: number;
}

interface LensBokeh {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  depth: number; // 0..1
  alpha: number;
  phase: number;
  rgbIdx: number;
}

interface VoronoiSite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rgbIdx: number;
}

interface CircuitTrace {
  pts: { x: number; y: number }[];
  pulsePos: number; // 0..1
  pulseSpeed: number;
  rgbIdx: number;
}

interface MeltColumn {
  x: number;
  w: number;
  dripY: number;
  speed: number;
  rgbIdx: number;
  alpha: number;
  phase: number;
}

function parseRgbTuple(rgb: string, fallback: [number, number, number]): [number, number, number] {
  const parts = rgb.split(',');
  if (parts.length !== 3) return fallback;
  const r = parseInt(parts[0], 10);
  const g = parseInt(parts[1], 10);
  const b = parseInt(parts[2], 10);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  return [r, g, b];
}

function clipPolygonHalfPlane(
  poly: { x: number; y: number }[],
  px: number,
  py: number,
  nx: number,
  ny: number
): { x: number; y: number }[] {
  if (poly.length === 0) return poly;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const dCur = (cur.x - px) * nx + (cur.y - py) * ny;
    const dPrev = (prev.x - px) * nx + (prev.y - py) * ny;
    if (dCur <= 0) {
      if (dPrev > 0) {
        const t = dPrev / (dPrev - dCur);
        out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t });
      }
      out.push(cur);
    } else if (dPrev <= 0) {
      const t = dPrev / (dPrev - dCur);
      out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t });
    }
  }
  return out;
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
  songTitle = '',
  songArtist = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef({
    primaryRgb,
    secondaryRgb,
    tertiaryRgb,
    c1Tuple: parseRgbTuple(primaryRgb, [168, 85, 247]),
    c2Tuple: parseRgbTuple(secondaryRgb, [56, 189, 248]),
    c3Tuple: parseRgbTuple(tertiaryRgb, [244, 114, 182]),
    isPlaying,
    speed,
    songTitle,
    songArtist,
  });

  useEffect(() => {
    colorsRef.current = {
      primaryRgb,
      secondaryRgb,
      tertiaryRgb,
      c1Tuple: parseRgbTuple(primaryRgb, [168, 85, 247]),
      c2Tuple: parseRgbTuple(secondaryRgb, [56, 189, 248]),
      c3Tuple: parseRgbTuple(tertiaryRgb, [244, 114, 182]),
      isPlaying,
      speed,
      songTitle,
      songArtist,
    };
  }, [primaryRgb, secondaryRgb, tertiaryRgb, isPlaying, speed, songTitle, songArtist]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, width < 768 ? 1.5 : 2);

    const freqBuf = new Uint8Array(64);
    const timeBuf = new Uint8Array(128);

    // Reusable offscreen buffer for pixel-shader themes (thermal, turing, caustics, oilslick)
    const offCanvas = document.createElement('canvas');
    let offW = 96;
    let offH = 54;
    offCanvas.width = offW;
    offCanvas.height = offH;
    const offCtx = offCanvas.getContext('2d');
    let offImg: ImageData | null = offCtx ? offCtx.createImageData(offW, offH) : null;

    // Pre-allocated Reaction-Diffusion (Turing) double buffers (80x48)
    const rdW = 80;
    const rdH = 48;
    const rdSize = rdW * rdH;
    let rdA = new Float32Array(rdSize);
    let rdB = new Float32Array(rdSize);
    let rdA2 = new Float32Array(rdSize);
    let rdB2 = new Float32Array(rdSize);

    // Pre-allocated topographic elevation field (avoids per-frame TypedArray GC)
    let topoField = new Float32Array(43 * 29);

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
    const roots: RootBranch[] = [];
    const inkWisps: InkWisp[] = [];
    const lensBokehs: LensBokeh[] = [];
    const voronoiSites: VoronoiSite[] = [];
    const circuitTraces: CircuitTrace[] = [];
    const meltCols: MeltColumn[] = [];
    const vuLevels = new Float32Array(28);
    const vuPeaks = new Float32Array(28);
    let extraState: ExtraThemeState | null = cachedExtraModule
      ? cachedExtraModule.createExtraThemeState()
      : null;
    const needsExtra = !CORE_CANVAS_MODES.has(mode);
    let cancelled = false;
    if (needsExtra && !cachedExtraModule) {
      loadExtraRenderers().then((mod) => {
        if (cancelled) return;
        extraState = mod.createExtraThemeState();
        mod.initExtraThemeState(mode, width, height, extraState);
      });
    }

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
      roots.length = 0;
      inkWisps.length = 0;
      lensBokehs.length = 0;
      voronoiSites.length = 0;
      circuitTraces.length = 0;
      meltCols.length = 0;
      vuLevels.fill(0);
      vuPeaks.fill(0);

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
        // Seed primary growing tree roots from the top & upper edges
        const seedCount = isMobile ? 5 : 8;
        for (let i = 0; i < seedCount; i++) {
          const sx = width * (0.08 + (i / Math.max(1, seedCount - 1)) * 0.84) + (Math.random() - 0.5) * 40;
          roots.push({
            points: [{ x: sx, y: -10 }],
            angle: Math.PI * 0.5 + (Math.random() - 0.5) * 0.42,
            width: 3.4 + Math.random() * 2.2,
            depth: 0,
            maxLen: height * (0.34 + Math.random() * 0.38),
            grown: 0,
            rgbIdx: i % 3,
            alpha: 0.85,
            done: false,
          });
        }
      } else if (mode === 'ink') {
        const wispCount = isMobile ? 16 : 26;
        for (let i = 0; i < wispCount; i++) {
          const cx = width * (0.2 + Math.random() * 0.6);
          const cy = height * (0.2 + Math.random() * 0.6);
          const ang = Math.random() * Math.PI * 2;
          inkWisps.push({
            x: cx,
            y: cy,
            vx: Math.cos(ang) * (0.2 + Math.random() * 0.45),
            vy: Math.sin(ang) * (0.2 + Math.random() * 0.45),
            r: 25 + Math.random() * 45,
            maxR: Math.min(width, height) * (0.18 + Math.random() * 0.2),
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.014,
            life: Math.random() * 220,
            maxLife: 240 + Math.random() * 180,
            rgbIdx: i % 3,
            curlPhase: Math.random() * Math.PI * 2,
          });
        }
      } else if (mode === 'bokeh') {
        const bCount = isMobile ? 18 : 30;
        for (let i = 0; i < bCount; i++) {
          const depth = Math.random();
          lensBokehs.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * (0.15 + depth * 0.4),
            vy: -0.1 - Math.random() * (0.18 + depth * 0.35),
            r: (isMobile ? 22 : 34) + depth * (isMobile ? 55 : 88),
            depth,
            alpha: 0.14 + (1 - depth * 0.5) * 0.24,
            phase: Math.random() * Math.PI * 2,
            rgbIdx: i % 3,
          });
        }
      } else if (mode === 'voronoi') {
        const siteCount = isMobile ? 14 : 22;
        for (let i = 0; i < siteCount; i++) {
          voronoiSites.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 0.55,
            vy: (Math.random() - 0.5) * 0.55,
            rgbIdx: i % 3,
          });
        }
      } else if (mode === 'circuit') {
        const traceCount = isMobile ? 18 : 32;
        const grid = isMobile ? 36 : 44;
        const dirs = [
          [1, 0],
          [1, 1],
          [0, 1],
          [-1, 1],
          [-1, 0],
          [-1, -1],
          [0, -1],
          [1, -1],
        ];
        for (let i = 0; i < traceCount; i++) {
          let gx = Math.floor(Math.random() * Math.max(4, Math.floor(width / grid))) * grid;
          let gy = Math.floor(Math.random() * Math.max(4, Math.floor(height / grid))) * grid;
          const pts = [{ x: gx, y: gy }];
          let dirIdx = Math.floor(Math.random() * 8);
          const segs = 4 + Math.floor(Math.random() * 5);
          for (let s = 0; s < segs; s++) {
            const len = (1 + Math.floor(Math.random() * 3)) * grid;
            gx += dirs[dirIdx][0] * len;
            gy += dirs[dirIdx][1] * len;
            pts.push({ x: gx, y: gy });
            // 45-degree or 90-degree PCB turn
            dirIdx = (dirIdx + (Math.random() < 0.5 ? 1 : 7)) % 8;
          }
          circuitTraces.push({
            pts,
            pulsePos: Math.random(),
            pulseSpeed: 0.14 + Math.random() * 0.24,
            rgbIdx: i % 3,
          });
        }
      } else if (mode === 'pixelsort') {
        const colCount = isMobile ? 36 : 64;
        const colW = width / colCount;
        for (let i = 0; i < colCount; i++) {
          meltCols.push({
            x: i * colW,
            w: colW + 1,
            dripY: Math.random() * height,
            speed: 0.5 + Math.random() * 1.9,
            rgbIdx: i % 3,
            alpha: 0.18 + Math.random() * 0.34,
            phase: Math.random() * Math.PI * 2,
          });
        }
      } else if (mode === 'turing') {
        offW = rdW;
        offH = rdH;
        offCanvas.width = offW;
        offCanvas.height = offH;
        offImg = offCtx ? offCtx.createImageData(offW, offH) : null;
        rdA.fill(1);
        rdB.fill(0);
        // Seed organic coral/zebra centers
        for (let s = 0; s < 14; s++) {
          const sx = 6 + Math.floor(Math.random() * (rdW - 12));
          const sy = 6 + Math.floor(Math.random() * (rdH - 12));
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              rdB[(sy + dy) * rdW + (sx + dx)] = 1;
            }
          }
        }
      } else if (
        mode === 'thermal' ||
        mode === 'caustics' ||
        mode === 'oilslick' ||
        mode === 'chladni' ||
        mode === 'julia' ||
        mode === 'dither' ||
        mode === 'soapfilm'
      ) {
        offW = isMobile ? 76 : 104;
        offH = isMobile ? 44 : 60;
        offCanvas.width = offW;
        offCanvas.height = offH;
        offImg = offCtx ? offCtx.createImageData(offW, offH) : null;
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
      if (needsExtra && cachedExtraModule && extraState) {
        cachedExtraModule.initExtraThemeState(mode, width, height, extraState);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    let lastTs = performance.now();
    let lastDrawTs = 0;
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

      // Adaptive frame pacing: cap mobile & pixel-shader themes to ~30fps to save CPU/battery
      const minFrameMs = width < 768 || PIXEL_SHADER_MODES.has(mode) ? 32 : 0;
      if (minFrameMs > 0 && now - lastDrawTs < minFrameMs) {
        rafId = requestAnimationFrame(render);
        return;
      }
      lastDrawTs = now;

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
        if (mode === 'oscilloscope') {
          analyser.getByteTimeDomainData(timeBuf);
        }
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
      // 3. OCEAN WAVES (Layered Rolling Wave Swells & Glowing Seafoam)
      // ================================================================
      else if (mode === 'undersea') {
        // Moonlit / song-colored horizon reflection glow
        const moonGlow = ctx.createRadialGradient(
          width * 0.5,
          height * 0.22,
          10,
          width * 0.5,
          height * 0.28,
          Math.max(width, height) * 0.55
        );
        moonGlow.addColorStop(0, `rgba(${c3}, ${(0.18 + mids * 0.14).toFixed(3)})`);
        moonGlow.addColorStop(0.45, `rgba(${c1}, ${(0.1 + bass * 0.08).toFixed(3)})`);
        moonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = moonGlow;
        ctx.fillRect(0, 0, width, height);

        // 6 layered rolling ocean wave swells from distant horizon to foreground
        const waveLayers = 6;
        for (let w = 0; w < waveLayers; w++) {
          const depthFrac = w / (waveLayers - 1); // 0 = far, 1 = near
          const baseY = height * (0.38 + depthFrac * 0.5);
          const amp = (14 + depthFrac * 26) * (1 + bass * 0.72);
          const freq = 0.0028 + (1 - depthFrac) * 0.0025;
          const phase = tSec * (0.55 + depthFrac * 0.55) * (w % 2 === 0 ? 1 : -0.8) + w * 1.9;
          const rgb = getRgbByIdx(w % 3);

          ctx.beginPath();
          ctx.moveTo(0, height);
          const crestPoints: { x: number; y: number }[] = [];
          const stepX = width < 768 ? 22 : 18;
          for (let x = 0; x <= width + stepX; x += stepX) {
            const y =
              baseY +
              Math.sin(x * freq + phase) * amp +
              Math.cos(x * freq * 1.9 - phase * 0.75) * (amp * 0.38);
            ctx.lineTo(x, y);
            crestPoints.push({ x, y });
          }
          ctx.lineTo(width, height);
          ctx.closePath();

          const fillGrad = ctx.createLinearGradient(0, baseY - amp, 0, height);
          fillGrad.addColorStop(0, `rgba(${rgb}, ${(0.14 + depthFrac * 0.16 + bass * 0.08).toFixed(3)})`);
          fillGrad.addColorStop(0.55, `rgba(${c2}, ${(0.08 + depthFrac * 0.12).toFixed(3)})`);
          fillGrad.addColorStop(1, 'rgba(2, 10, 20, 0.78)');
          ctx.fillStyle = fillGrad;
          ctx.fill();

          // Luminous seafoam / light-catching crest ridge
          ctx.beginPath();
          for (let k = 0; k < crestPoints.length; k++) {
            const pt = crestPoints[k];
            if (k === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
          ctx.strokeStyle = `rgba(235, 248, 255, ${(0.18 + depthFrac * 0.28 + bass * 0.22).toFixed(3)})`;
          ctx.lineWidth = 1.1 + depthFrac * 1.5;
          ctx.stroke();
        }
      }

      // ================================================================
      else if (mode === 'oilslick' && offCtx && offImg) {
        const data = offImg.data;
        const [r1, g1, b1] = colorsRef.current.c1Tuple;
        const t = tSec * 0.45;
        const shift = bass * 1.4;

        for (let y = 0; y < offH; y++) {
          const ny = (y / offH) * 3.4;
          for (let x = 0; x < offW; x++) {
            const nx = (x / offW) * 4.8;
            // Thin-film optical thickness field
            const thick =
              Math.sin(nx + Math.cos(ny * 1.3 + t)) +
              Math.cos(ny - Math.sin(nx * 1.1 - t * 0.8)) +
              0.6 * Math.sin((nx + ny) * 1.2 + t * 0.65);
            const phase = thick * 2.8 + shift;
            // Pearlescent RGB thin-film interference curves
            const ir = 0.5 + 0.5 * Math.cos(phase);
            const ig = 0.5 + 0.5 * Math.cos(phase + 2.094);
            const ib = 0.5 + 0.5 * Math.cos(phase + 4.188);
            // Keep obsidian troughs dark so iridescent bands gleam cleanly
            const sheen = Math.pow(0.5 + 0.5 * Math.sin(thick * 1.9 + t * 0.5), 1.8) * (0.58 + energy * 0.35);

            const idx = (y * offW + x) * 4;
            data[idx] = Math.min(255, (ir * 195 + r1 * 0.28) * sheen + 6);
            data[idx + 1] = Math.min(255, (ig * 195 + g1 * 0.28) * sheen + 7);
            data[idx + 2] = Math.min(255, (ib * 210 + b1 * 0.28) * sheen + 11);
            data[idx + 3] = 235;
          }
        }
        offCtx.putImageData(offImg, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offCanvas, 0, 0, width, height);
        ctx.restore();
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
      // 5. GROWING TREE ROOTS (Organic Branching Roots + Luminous Sap)
      // ================================================================
      else if (mode === 'nature') {
        const earthGlow = ctx.createRadialGradient(
          width * 0.5,
          0,
          10,
          width * 0.5,
          height * 0.3,
          Math.max(width, height) * 0.65
        );
        earthGlow.addColorStop(0, `rgba(${c1}, ${(0.14 + bass * 0.1).toFixed(3)})`);
        earthGlow.addColorStop(0.55, `rgba(${c2}, ${(0.06 + mids * 0.05).toFixed(3)})`);
        earthGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = earthGlow;
        ctx.fillRect(0, 0, width, height);

        const maxBranches = width < 768 ? 52 : 88;
        let activeGrowing = 0;

        for (let i = roots.length - 1; i >= 0; i--) {
          const rt = roots[i];
          if (!rt.done) {
            activeGrowing++;
            const growStep = (1.1 + bass * 2.2) * step;
            const last = rt.points[rt.points.length - 1];
            rt.angle += (Math.sin(tSec * 1.4 + i * 2.1 + rt.grown * 0.03) * 0.045 + (Math.random() - 0.5) * 0.08) * step;
            // Gently bias downward while allowing wide organic spread
            rt.angle += (Math.PI * 0.5 - rt.angle) * 0.008 * step;
            const nx = last.x + Math.cos(rt.angle) * growStep;
            const ny = last.y + Math.sin(rt.angle) * growStep;
            rt.grown += growStep;

            if (rt.points.length < 120) {
              const prev = rt.points[rt.points.length - 1];
              if (Math.hypot(nx - prev.x, ny - prev.y) > 4.5) {
                rt.points.push({ x: nx, y: ny });
              }
            }

            // Organic root forking
            if (
              rt.depth < 3 &&
              roots.length < maxBranches &&
              rt.grown > 32 &&
              Math.random() < dt * (0.55 + bass * 0.9)
            ) {
              const dir = Math.random() < 0.5 ? -1 : 1;
              roots.push({
                points: [{ x: nx, y: ny }],
                angle: rt.angle + dir * (0.35 + Math.random() * 0.45),
                width: Math.max(0.85, rt.width * 0.66),
                depth: rt.depth + 1,
                maxLen: rt.maxLen * (0.52 + Math.random() * 0.25),
                grown: 0,
                rgbIdx: (rt.rgbIdx + 1) % 3,
                alpha: rt.alpha * 0.92,
                done: false,
              });
            }

            if (rt.grown >= rt.maxLen || ny > height + 20 || nx < -30 || nx > width + 30) {
              rt.done = true;
            }
          } else {
            // Gently fade completed roots so fresh luminous networks continuously grow
            rt.alpha -= dt * 0.065;
            if (rt.alpha <= 0.02) {
              roots.splice(i, 1);
              continue;
            }
          }

          if (rt.points.length < 2) continue;
          const rgb = getRgbByIdx(rt.rgbIdx);

          // Soft bioluminescent root glow
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(rt.points[0].x, rt.points[0].y);
          for (let p = 1; p < rt.points.length; p++) {
            ctx.lineTo(rt.points[p].x, rt.points[p].y);
          }
          ctx.strokeStyle = `rgba(${rgb}, ${(rt.alpha * (0.22 + bass * 0.28)).toFixed(3)})`;
          ctx.lineWidth = rt.width * 3.1;
          ctx.stroke();

          // Crisp bark / vein core
          ctx.strokeStyle = `rgba(${rgb}, ${(rt.alpha * (0.68 + mids * 0.25)).toFixed(3)})`;
          ctx.lineWidth = rt.width;
          ctx.stroke();

          // Glowing growing root tip
          if (!rt.done) {
            const tip = rt.points[rt.points.length - 1];
            const tg = ctx.createRadialGradient(tip.x, tip.y, 0.5, tip.x, tip.y, rt.width * 4.5);
            tg.addColorStop(0, `rgba(255, 255, 240, ${(rt.alpha * 0.9).toFixed(3)})`);
            tg.addColorStop(0.4, `rgba(${rgb}, ${(rt.alpha * 0.6).toFixed(3)})`);
            tg.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = tg;
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, rt.width * 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Sprout fresh primary roots whenever the network thins out
        if (activeGrowing < 3 && roots.length < maxBranches * 0.75) {
          roots.push({
            points: [{ x: width * (0.08 + Math.random() * 0.84), y: -10 }],
            angle: Math.PI * 0.5 + (Math.random() - 0.5) * 0.45,
            width: 3.2 + Math.random() * 2.0,
            depth: 0,
            maxLen: height * (0.36 + Math.random() * 0.4),
            grown: 0,
            rgbIdx: Math.floor(Math.random() * 3),
            alpha: 0.88,
            done: false,
          });
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

      // ================================================================
      // 14. INK IN WATER (Billowing Smoke-Like Color Plumes & Curls)
      // ================================================================
      else if (mode === 'ink') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < inkWisps.length; i++) {
          const w = inkWisps[i];
          w.life += step * (0.75 + energy * 0.65);
          if (w.life >= w.maxLife) {
            w.life = 0;
            w.x = width * (0.18 + Math.random() * 0.64);
            w.y = height * (0.18 + Math.random() * 0.64);
            const ang = Math.random() * Math.PI * 2;
            w.vx = Math.cos(ang) * (0.2 + Math.random() * 0.45);
            w.vy = Math.sin(ang) * (0.2 + Math.random() * 0.45);
            w.r = 20 + Math.random() * 35;
          }
          const prog = w.life / w.maxLife;
          // Fluid curl trajectory
          const curlAng = Math.sin(tSec * 0.45 + w.curlPhase + prog * 4.2) * 0.035;
          const nvx = w.vx * Math.cos(curlAng) - w.vy * Math.sin(curlAng);
          const nvy = w.vx * Math.sin(curlAng) + w.vy * Math.cos(curlAng);
          w.vx = nvx;
          w.vy = nvy;
          w.x += w.vx * (1 + bass * 0.8) * step;
          w.y += w.vy * (1 + bass * 0.8) * step;
          w.rot += w.rotSpeed * step;

          const curR = w.r + (w.maxR - w.r) * Math.pow(prog, 0.65) * (1 + bass * 0.16);
          const fade = prog < 0.2 ? prog / 0.2 : Math.max(0, 1 - (prog - 0.2) / 0.8);
          const rgb = getRgbByIdx(w.rgbIdx);

          ctx.save();
          ctx.translate(w.x, w.y);
          ctx.rotate(w.rot);
          // Multi-lobe billowing smoke/ink feather rather than a smooth sphere
          for (let lobe = 0; lobe < 3; lobe++) {
            const ox = Math.cos(lobe * 2.1 + w.curlPhase) * curR * 0.34;
            const oy = Math.sin(lobe * 2.1 + w.curlPhase) * curR * 0.24;
            const lr = curR * (0.65 + lobe * 0.14);
            const g = ctx.createRadialGradient(ox, oy, lr * 0.06, ox, oy, lr);
            g.addColorStop(0, `rgba(${rgb}, ${(fade * (0.28 + bass * 0.16)).toFixed(3)})`);
            g.addColorStop(0.42, `rgba(${rgb}, ${(fade * 0.14).toFixed(3)})`);
            g.addColorStop(0.78, `rgba(${c3}, ${(fade * 0.04).toFixed(3)})`);
            g.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(ox, oy, lr * 1.25, lr * 0.72, lobe * 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        ctx.restore();
      }

      // ================================================================
      // 15. BOKEH LIGHTS (Multi-Depth Out-of-Focus Photographic Lens Orbs)
      // ================================================================
      else if (mode === 'bokeh') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < lensBokehs.length; i++) {
          const bk = lensBokehs[i];
          bk.x += (bk.vx + Math.sin(tSec * 0.3 + bk.phase) * 0.15) * step;
          bk.y += bk.vy * (1 + bass * 0.55) * step;
          if (bk.y < -bk.r * 1.4) {
            bk.y = height + bk.r * 1.3;
            bk.x = Math.random() * width;
          }
          if (bk.x < -bk.r * 1.4) bk.x = width + bk.r * 1.3;
          if (bk.x > width + bk.r * 1.4) bk.x = -bk.r * 1.3;

          const rgb = getRgbByIdx(bk.rgbIdx);
          const breathe = 1 + bass * (0.08 + bk.depth * 0.1) + Math.sin(tSec * 0.8 + bk.phase) * 0.04;
          const r = bk.r * breathe;
          const a = bk.alpha * (0.82 + mids * 0.35);

          // Photographic prime-lens bokeh disc (soft fill + subtly brighter optical rim)
          const g = ctx.createRadialGradient(bk.x, bk.y, r * 0.1, bk.x, bk.y, r);
          g.addColorStop(0, `rgba(${rgb}, ${(a * 0.42).toFixed(3)})`);
          g.addColorStop(0.76, `rgba(${rgb}, ${(a * 0.52).toFixed(3)})`);
          g.addColorStop(0.92, `rgba(255, 248, 240, ${(a * 0.65).toFixed(3)})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bk.x, bk.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ================================================================
      // 16. GRID / PERSPECTIVE TUNNEL (Infinite Geometric Wireframe)
      // ================================================================
      else if (mode === 'tunnel') {
        const cx = width * 0.5 + Math.sin(tSec * 0.45) * (width * 0.05);
        const cy = height * 0.5 + Math.cos(tSec * 0.38) * (height * 0.04);
        const maxR = Math.hypot(width, height) * 0.68;
        const sides = 8;
        const ringCount = 16;
        const travel = (tSec * (0.52 + energy * 0.42)) % 1;

        // Vanishing point core glow
        const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, maxR * 0.42);
        core.addColorStop(0, `rgba(${c1}, ${(0.34 + bass * 0.25).toFixed(3)})`);
        core.addColorStop(0.5, `rgba(${c2}, ${(0.12 + mids * 0.08).toFixed(3)})`);
        core.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, width, height);

        // Radial tunnel depth struts
        const twistBase = tSec * 0.14;
        ctx.lineWidth = 1.1;
        for (let s = 0; s < sides; s++) {
          const ang = (s / sides) * Math.PI * 2 + twistBase;
          ctx.strokeStyle = `rgba(${s % 2 === 0 ? c1 : c2}, ${(0.22 + mids * 0.16).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * 14, cy + Math.sin(ang) * 14);
          ctx.lineTo(cx + Math.cos(ang) * maxR, cy + Math.sin(ang) * maxR);
          ctx.stroke();
        }

        // Advancing perspective octagonal wireframe rings
        for (let i = 0; i < ringCount; i++) {
          const z = (i + travel) / ringCount; // 0 far -> 1 near
          const r = Math.pow(z, 2.35) * maxR;
          if (r < 6) continue;
          const rot = twistBase + (1 - z) * 0.35;
          const alpha = Math.min(0.9, Math.pow(z, 1.1) * (0.55 + bass * 0.42));
          ctx.strokeStyle = `rgba(${i % 2 === 0 ? c1 : c3}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 0.8 + z * (1.8 + bass * 1.1);
          ctx.beginPath();
          for (let s = 0; s <= sides; s++) {
            const ang = (s / sides) * Math.PI * 2 + rot;
            const px = cx + Math.cos(ang) * r;
            const py = cy + Math.sin(ang) * r;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }

      // ================================================================
      else if (mode === 'oilslick' && offCtx && offImg) {
        const data = offImg.data;
        const [r1, g1, b1] = colorsRef.current.c1Tuple;
        const t = tSec * 0.45;
        const shift = bass * 1.4;

        for (let y = 0; y < offH; y++) {
          const ny = (y / offH) * 3.4;
          for (let x = 0; x < offW; x++) {
            const nx = (x / offW) * 4.8;
            // Thin-film optical thickness field
            const thick =
              Math.sin(nx + Math.cos(ny * 1.3 + t)) +
              Math.cos(ny - Math.sin(nx * 1.1 - t * 0.8)) +
              0.6 * Math.sin((nx + ny) * 1.2 + t * 0.65);
            const phase = thick * 2.8 + shift;
            // Pearlescent RGB thin-film interference curves
            const ir = 0.5 + 0.5 * Math.cos(phase);
            const ig = 0.5 + 0.5 * Math.cos(phase + 2.094);
            const ib = 0.5 + 0.5 * Math.cos(phase + 4.188);
            // Keep obsidian troughs dark so iridescent bands gleam cleanly
            const sheen = Math.pow(0.5 + 0.5 * Math.sin(thick * 1.9 + t * 0.5), 1.8) * (0.58 + energy * 0.35);

            const idx = (y * offW + x) * 4;
            data[idx] = Math.min(255, (ir * 195 + r1 * 0.28) * sheen + 6);
            data[idx + 1] = Math.min(255, (ig * 195 + g1 * 0.28) * sheen + 7);
            data[idx + 2] = Math.min(255, (ib * 210 + b1 * 0.28) * sheen + 11);
            data[idx + 3] = 235;
          }
        }
        offCtx.putImageData(offImg, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offCanvas, 0, 0, width, height);
        ctx.restore();
      }

      // ================================================================
      // 17. VINYL GROOVE SHEEN (Full-Screen Spinning Record + Reflection)
      // ================================================================
      else if (mode === 'vinyl') {
        const cx = width * 0.5;
        const cy = height * 0.5;
        const discR = Math.hypot(width, height) * 0.56;

        // Subtle dark vinyl base disc
        const discBg = ctx.createRadialGradient(cx, cy, discR * 0.08, cx, cy, discR);
        discBg.addColorStop(0, `rgba(${c1}, ${(0.26 + bass * 0.14).toFixed(3)})`);
        discBg.addColorStop(0.16, '#0d0e14');
        discBg.addColorStop(0.55, '#07080d');
        discBg.addColorStop(1, '#030407');
        ctx.fillStyle = discBg;
        ctx.beginPath();
        ctx.arc(cx, cy, discR, 0, Math.PI * 2);
        ctx.fill();

        // Concentric micro-grooves
        const grooveStep = width < 768 ? 7 : 5.5;
        for (let r = discR * 0.18; r < discR; r += grooveStep) {
          const bandMod = 0.55 + 0.45 * Math.sin(r * 0.075);
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.035 + bandMod * 0.045 + mids * 0.02).toFixed(3)})`;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Slow-spinning anisotropic diagonal light reflection sheen (classic vinyl shimmer)
        const sheenAngle = tSec * 0.24;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(sheenAngle);
        ctx.globalCompositeOperation = 'screen';
        for (let half = 0; half < 2; half++) {
          ctx.save();
          ctx.rotate(half * Math.PI);
          const sheenGrad = ctx.createLinearGradient(-discR * 0.28, -discR, discR * 0.28, 0);
          sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          sheenGrad.addColorStop(0.35, `rgba(${c1}, ${(0.12 + bass * 0.1).toFixed(3)})`);
          sheenGrad.addColorStop(0.5, `rgba(255, 255, 255, ${(0.16 + bass * 0.12).toFixed(3)})`);
          sheenGrad.addColorStop(0.65, `rgba(${c2}, ${(0.1 + mids * 0.08).toFixed(3)})`);
          sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = sheenGrad;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, discR, -Math.PI * 0.62, -Math.PI * 0.38);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();

        // Center record label tinted by song colors + spindle hole
        const labelR = Math.min(width, height) * 0.12;
        const labelG = ctx.createRadialGradient(cx, cy, 4, cx, cy, labelR);
        labelG.addColorStop(0, `rgba(${c3}, ${(0.55 + bass * 0.2).toFixed(3)})`);
        labelG.addColorStop(0.65, `rgba(${c1}, ${(0.42 + bass * 0.16).toFixed(3)})`);
        labelG.addColorStop(1, `rgba(${c2}, 0.25)`);
        ctx.fillStyle = labelG;
        ctx.beginPath();
        ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, 0.22)`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = '#040508';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(5, labelR * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }

      // ================================================================
      // 18. OSCILLOSCOPE / WAVEFORM (Crisp Glowing Trace + Circular Ring)
      // ================================================================
      else if (mode === 'oscilloscope') {
        const cx = width * 0.5;
        const cy = height * 0.5;

        // Subtle phosphor calibration grid
        ctx.strokeStyle = `rgba(${c1}, 0.055)`;
        ctx.lineWidth = 1;
        const gridGap = 48;
        for (let x = cx % gridGap; x < width; x += gridGap) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = cy % gridGap; y < height; y += gridGap) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        // Circular frequency ring in the background
        const ringR = Math.min(width, height) * 0.28;
        ctx.save();
        ctx.beginPath();
        const ringPts = 96;
        for (let i = 0; i <= ringPts; i++) {
          const a = (i / ringPts) * Math.PI * 2;
          const bin = Math.floor(((i % ringPts) / ringPts) * 40);
          const amp = playing && analyser
            ? (freqBuf[bin] / 255) * (46 + bass * 28)
            : (Math.sin(a * 4 + tSec * 2.2) * 14 + Math.cos(a * 7 - tSec * 1.8) * 10) * (playing ? 1 : 0.25);
          const rr = ringR + amp;
          const rx = cx + Math.cos(a) * rr;
          const ry = cy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${c2}, ${(0.22 + mids * 0.25).toFixed(3)})`;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${c2}, ${(0.65 + mids * 0.3).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();

        // Central glowing live waveform trace
        ctx.beginPath();
        const samples = 128;
        for (let i = 0; i < samples; i++) {
          const x = (i / (samples - 1)) * width;
          let norm = 0;
          if (playing && analyser) {
            norm = (timeBuf[i] - 128) / 128;
          } else if (playing) {
            norm =
              Math.sin(i * 0.18 + tSec * 4.5) * 0.35 +
              Math.cos(i * 0.31 - tSec * 3.1) * 0.22 * (0.5 + bass);
          } else {
            norm = Math.sin(i * 0.14 + tSec * 1.4) * 0.08;
          }
          const env = Math.sin((i / (samples - 1)) * Math.PI);
          const y = cy + norm * (height * 0.26) * (0.35 + env * 0.65);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${c1}, ${(0.28 + bass * 0.28).toFixed(3)})`;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.strokeStyle = `rgba(${c1}, 0.92)`;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      // ================================================================
      // 19. VU METER / SPECTRUM COLUMNS (Giant Ambient Equalizer Pillars)
      // ================================================================
      else if (mode === 'vumeter') {
        const cols = width < 768 ? 16 : 28;
        const gap = width < 768 ? 6 : 10;
        const colW = (width - gap * (cols + 1)) / cols;

        for (let i = 0; i < cols; i++) {
          const bin = Math.min(63, Math.floor((i / cols) * 44));
          let target = 0.08;
          if (playing && analyser) {
            target = Math.min(0.92, (freqBuf[bin] / 255) * 0.95);
          } else if (playing) {
            target =
              0.16 +
              0.38 * Math.abs(Math.sin(tSec * 2.4 + i * 0.42)) +
              0.22 * Math.abs(Math.cos(tSec * 3.7 - i * 0.28));
          } else {
            target = 0.08 + 0.05 * Math.sin(tSec * 1.2 + i * 0.5);
          }

          // Smooth attack & calm decay
          const riseRate = Math.min(1, dt * 10);
          const fallRate = Math.min(1, dt * 3.8);
          vuLevels[i] += (target - vuLevels[i]) * (target > vuLevels[i] ? riseRate : fallRate);
          if (vuLevels[i] > vuPeaks[i]) vuPeaks[i] = vuLevels[i];
          else vuPeaks[i] = Math.max(vuLevels[i], vuPeaks[i] - dt * 0.28);

          const x = gap + i * (colW + gap);
          const barH = vuLevels[i] * height * 0.84;
          const y = height - barH;
          const rgb = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;

          const grad = ctx.createLinearGradient(x, height, x, y);
          grad.addColorStop(0, `rgba(${rgb}, 0.08)`);
          grad.addColorStop(0.55, `rgba(${rgb}, ${(0.24 + vuLevels[i] * 0.2).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${rgb}, ${(0.52 + vuLevels[i] * 0.25).toFixed(3)})`);
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, colW, barH);

          // Glowing peak-hold cap
          const peakY = height - vuPeaks[i] * height * 0.84;
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.35 + vuPeaks[i] * 0.45).toFixed(3)})`;
          ctx.fillRect(x, peakY - 3, colW, 3);
        }
      }

      // ================================================================
      // 20. KALEIDOSCOPE / STAINED GLASS (Rotating Glowing Facets)
      // ================================================================
      else if (mode === 'kaleidoscope') {
        const cx = width * 0.5;
        const cy = height * 0.5;
        const maxR = Math.hypot(width, height) * 0.65;
        const wedges = 12;
        const baseRot = tSec * 0.12;
        const rings = [0.16, 0.34, 0.56, 0.82, 1.05];

        ctx.save();
        ctx.translate(cx, cy);
        for (let rIdx = 0; rIdx < rings.length - 1; rIdx++) {
          const r1 = maxR * rings[rIdx] * (1 + bass * 0.08 * (rIdx % 2 === 0 ? 1 : -0.5));
          const r2 = maxR * rings[rIdx + 1] * (1 + bass * 0.08 * ((rIdx + 1) % 2 === 0 ? 1 : -0.5));
          const dir = rIdx % 2 === 0 ? 1 : -1;
          const rot = baseRot * dir * (1 + rIdx * 0.22);

          for (let w = 0; w < wedges; w++) {
            const a1 = (w / wedges) * Math.PI * 2 + rot;
            const a2 = ((w + 1) / wedges) * Math.PI * 2 + rot;
            const aMid = (a1 + a2) * 0.5 + Math.sin(tSec * 0.6 + rIdx) * 0.08;
            const rgb = getRgbByIdx((w + rIdx) % 3);
            const alpha = 0.14 + ((w + rIdx) % 3) * 0.06 + bass * 0.14;

            ctx.beginPath();
            ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
            ctx.lineTo(Math.cos(aMid) * r2, Math.sin(aMid) * r2);
            ctx.lineTo(Math.cos(a2) * r1, Math.sin(a2) * r1);
            ctx.closePath();

            ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 255, 255, ${(0.18 + mids * 0.24).toFixed(3)})`;
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // ================================================================
      // 21. VORONOI / CELLULAR (Interlocking Organic Cell Membranes)
      // ================================================================
      else if (mode === 'voronoi') {
        for (let i = 0; i < voronoiSites.length; i++) {
          const s = voronoiSites[i];
          s.x += s.vx * (1 + energy * 1.1) * step;
          s.y += s.vy * (1 + energy * 1.1) * step;
          if (s.x < 0) {
            s.x = 0;
            s.vx = Math.abs(s.vx);
          } else if (s.x > width) {
            s.x = width;
            s.vx = -Math.abs(s.vx);
          }
          if (s.y < 0) {
            s.y = 0;
            s.vy = Math.abs(s.vy);
          } else if (s.y > height) {
            s.y = height;
            s.vy = -Math.abs(s.vy);
          }
        }

        const bounds = [
          { x: -10, y: -10 },
          { x: width + 10, y: -10 },
          { x: width + 10, y: height + 10 },
          { x: -10, y: height + 10 },
        ];

        for (let i = 0; i < voronoiSites.length; i++) {
          const si = voronoiSites[i];
          let poly = bounds;
          for (let j = 0; j < voronoiSites.length; j++) {
            if (i === j) continue;
            const sj = voronoiSites[j];
            const mx = (si.x + sj.x) * 0.5;
            const my = (si.y + sj.y) * 0.5;
            const nx = sj.x - si.x;
            const ny = sj.y - si.y;
            poly = clipPolygonHalfPlane(poly, mx, my, nx, ny);
            if (poly.length < 3) break;
          }
          if (poly.length < 3) continue;

          const rgb = getRgbByIdx(si.rgbIdx);
          ctx.beginPath();
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k].x, poly[k].y);
          ctx.closePath();

          // Soft iridescent cell interior
          const cellG = ctx.createRadialGradient(si.x, si.y, 4, si.x, si.y, Math.min(width, height) * 0.24);
          cellG.addColorStop(0, `rgba(${rgb}, ${(0.24 + bass * 0.18).toFixed(3)})`);
          cellG.addColorStop(0.7, `rgba(${rgb}, ${(0.08 + mids * 0.08).toFixed(3)})`);
          cellG.addColorStop(1, `rgba(${rgb}, 0.02)`);
          ctx.fillStyle = cellG;
          ctx.fill();

          // Crisp glowing cell membrane wall
          ctx.strokeStyle = `rgba(${rgb}, ${(0.42 + bass * 0.32).toFixed(3)})`;
          ctx.lineWidth = 2.0;
          ctx.stroke();

          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.18 + mids * 0.16).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }

      // ================================================================
      else if (mode === 'oilslick' && offCtx && offImg) {
        const data = offImg.data;
        const [r1, g1, b1] = colorsRef.current.c1Tuple;
        const t = tSec * 0.45;
        const shift = bass * 1.4;

        for (let y = 0; y < offH; y++) {
          const ny = (y / offH) * 3.4;
          for (let x = 0; x < offW; x++) {
            const nx = (x / offW) * 4.8;
            // Thin-film optical thickness field
            const thick =
              Math.sin(nx + Math.cos(ny * 1.3 + t)) +
              Math.cos(ny - Math.sin(nx * 1.1 - t * 0.8)) +
              0.6 * Math.sin((nx + ny) * 1.2 + t * 0.65);
            const phase = thick * 2.8 + shift;
            // Pearlescent RGB thin-film interference curves
            const ir = 0.5 + 0.5 * Math.cos(phase);
            const ig = 0.5 + 0.5 * Math.cos(phase + 2.094);
            const ib = 0.5 + 0.5 * Math.cos(phase + 4.188);
            // Keep obsidian troughs dark so iridescent bands gleam cleanly
            const sheen = Math.pow(0.5 + 0.5 * Math.sin(thick * 1.9 + t * 0.5), 1.8) * (0.58 + energy * 0.35);

            const idx = (y * offW + x) * 4;
            data[idx] = Math.min(255, (ir * 195 + r1 * 0.28) * sheen + 6);
            data[idx + 1] = Math.min(255, (ig * 195 + g1 * 0.28) * sheen + 7);
            data[idx + 2] = Math.min(255, (ib * 210 + b1 * 0.28) * sheen + 11);
            data[idx + 3] = 235;
          }
        }
        offCtx.putImageData(offImg, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offCanvas, 0, 0, width, height);
        ctx.restore();
      }

      // ================================================================
      // 22. CRT / SCANLINES & APERTURE GRILLE (Retro Display Texture)
      // ================================================================
      else if (mode === 'crt') {
        // Warm phosphor center glow tinted by song colors
        const phos = ctx.createRadialGradient(
          width * 0.5,
          height * 0.5,
          20,
          width * 0.5,
          height * 0.5,
          Math.max(width, height) * 0.65
        );
        phos.addColorStop(0, `rgba(${c1}, ${(0.24 + bass * 0.16).toFixed(3)})`);
        phos.addColorStop(0.55, `rgba(${c2}, ${(0.12 + mids * 0.08).toFixed(3)})`);
        phos.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = phos;
        ctx.fillRect(0, 0, width, height);

        // Subtle vertical RGB aperture grille sub-pixel stripes
        const stripeStep = 6;
        for (let x = 0; x < width; x += stripeStep) {
          ctx.fillStyle = 'rgba(255, 70, 70, 0.035)';
          ctx.fillRect(x, 0, 2, height);
          ctx.fillStyle = 'rgba(70, 255, 110, 0.03)';
          ctx.fillRect(x + 2, 0, 2, height);
          ctx.fillStyle = 'rgba(70, 140, 255, 0.035)';
          ctx.fillRect(x + 4, 0, 2, height);
        }

        // Crisp horizontal CRT scanlines
        ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
        for (let y = 0; y < height; y += 4) {
          ctx.fillRect(0, y, width, 1.8);
        }

        // Gentle scrolling vertical sync refresh bar
        const syncY = ((tSec * 85) % (height + 160)) - 80;
        const syncGrad = ctx.createLinearGradient(0, syncY - 45, 0, syncY + 45);
        syncGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        syncGrad.addColorStop(0.5, `rgba(${c3}, ${(0.1 + bass * 0.12).toFixed(3)})`);
        syncGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = syncGrad;
        ctx.fillRect(0, syncY - 45, width, 90);

        // Curved CRT tube edge vignette
        const vig = ctx.createRadialGradient(
          width * 0.5,
          height * 0.5,
          Math.min(width, height) * 0.35,
          width * 0.5,
          height * 0.5,
          Math.hypot(width, height) * 0.58
        );
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(0.72, 'rgba(0, 0, 0, 0.25)');
        vig.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, width, height);
      }

      // ================================================================
      // 23. TOPOGRAPHIC CONTOUR (Animated Morphing Elevation Map Lines)
      // ================================================================
      else if (mode === 'topographic') {
        const cols = width < 768 ? 28 : 42;
        const rows = width < 768 ? 20 : 28;
        const cw = width / cols;
        const ch = height / rows;
        const needed = (cols + 1) * (rows + 1);
        if (topoField.length < needed) topoField = new Float32Array(needed);
        const field = topoField;

        const t1 = tSec * 0.38;
        const t2 = tSec * 0.24;
        const swell = 1 + bass * 0.32;

        for (let gy = 0; gy <= rows; gy++) {
          const ny = (gy / rows) * 4.2;
          for (let gx = 0; gx <= cols; gx++) {
            const nx = (gx / cols) * 5.2;
            const v =
              Math.sin(nx + t1) * Math.cos(ny - t2) +
              0.65 * Math.sin(nx * 1.7 - ny * 1.2 + t2 * 1.3) +
              0.4 * Math.cos((nx + ny) * 1.4 - t1 * 0.9);
            field[gy * (cols + 1) + gx] = v * swell;
          }
        }

        const levels = [-1.2, -0.75, -0.3, 0.15, 0.6, 1.05, 1.45];
        ctx.lineCap = 'round';
        for (let l = 0; l < levels.length; l++) {
          const iso = levels[l];
          const isMajor = l % 2 === 1;
          const rgb = l >= 4 ? c3 : l >= 2 ? c1 : c2;
          ctx.strokeStyle = `rgba(${rgb}, ${(isMajor ? 0.48 + bass * 0.3 : 0.24 + mids * 0.18).toFixed(3)})`;
          ctx.lineWidth = isMajor ? 1.8 : 1.0;
          ctx.beginPath();

          for (let gy = 0; gy < rows; gy++) {
            for (let gx = 0; gx < cols; gx++) {
              const i00 = gy * (cols + 1) + gx;
              const v0 = field[i00];
              const v1 = field[i00 + 1];
              const v2 = field[i00 + cols + 2];
              const v3 = field[i00 + cols + 1];

              const pts: { x: number; y: number }[] = [];
              const x0 = gx * cw;
              const y0 = gy * ch;
              if ((v0 < iso) !== (v1 < iso)) {
                pts.push({ x: x0 + ((iso - v0) / (v1 - v0)) * cw, y: y0 });
              }
              if ((v1 < iso) !== (v2 < iso)) {
                pts.push({ x: x0 + cw, y: y0 + ((iso - v1) / (v2 - v1)) * ch });
              }
              if ((v2 < iso) !== (v3 < iso)) {
                pts.push({ x: x0 + (1 - (iso - v2) / (v3 - v2)) * cw, y: y0 + ch });
              }
              if ((v3 < iso) !== (v0 < iso)) {
                pts.push({ x: x0, y: y0 + (1 - (iso - v3) / (v0 - v3)) * ch });
              }
              if (pts.length >= 2) {
                ctx.moveTo(pts[0].x, pts[0].y);
                ctx.lineTo(pts[1].x, pts[1].y);
                if (pts.length === 4) {
                  ctx.moveTo(pts[2].x, pts[2].y);
                  ctx.lineTo(pts[3].x, pts[3].y);
                }
              }
            }
          }
          ctx.stroke();
        }
      }

      // ================================================================
      // 24. LASER HARP / STAGE BEAMS (Concert Spotlights & Laser Planes)
      // ================================================================
      else if (mode === 'laser') {
        // Soft stage haze in upper half
        const haze = ctx.createRadialGradient(width * 0.5, 0, 20, width * 0.5, height * 0.35, Math.max(width, height) * 0.7);
        haze.addColorStop(0, `rgba(${c1}, ${(0.12 + bass * 0.1).toFixed(3)})`);
        haze.addColorStop(0.6, `rgba(${c2}, ${(0.06 + mids * 0.05).toFixed(3)})`);
        haze.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const origins = [
          { x: 0, y: 0, baseAng: 0.42 },
          { x: width, y: 0, baseAng: Math.PI - 0.42 },
        ];
        const beamPerSide = width < 768 ? 5 : 7;
        const beamLen = Math.hypot(width, height) * 1.15;

        for (let side = 0; side < 2; side++) {
          const orig = origins[side];
          const dirSign = side === 0 ? 1 : -1;
          for (let b = 0; b < beamPerSide; b++) {
            const sweep = Math.sin(tSec * (0.65 + b * 0.14) + side * 2.1 + b) * (0.28 + bass * 0.16);
            const ang = orig.baseAng + dirSign * ((b / (beamPerSide - 1)) * 0.78 - 0.2) + sweep;
            const rgb = getRgbByIdx((b + side) % 3);
            const ex = orig.x + Math.cos(ang) * beamLen;
            const ey = orig.y + Math.sin(ang) * beamLen;
            const spread = 0.032 + bass * 0.018;

            // Volumetric cone beam
            const coneGrad = ctx.createLinearGradient(orig.x, orig.y, ex, ey);
            coneGrad.addColorStop(0, `rgba(${rgb}, ${(0.34 + bass * 0.24).toFixed(3)})`);
            coneGrad.addColorStop(0.55, `rgba(${rgb}, ${(0.11 + mids * 0.08).toFixed(3)})`);
            coneGrad.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = coneGrad;
            ctx.beginPath();
            ctx.moveTo(orig.x, orig.y);
            ctx.lineTo(orig.x + Math.cos(ang - spread) * beamLen, orig.y + Math.sin(ang - spread) * beamLen);
            ctx.lineTo(orig.x + Math.cos(ang + spread) * beamLen, orig.y + Math.sin(ang + spread) * beamLen);
            ctx.closePath();
            ctx.fill();

            // Razor-sharp laser core line
            ctx.strokeStyle = `rgba(255, 255, 255, ${(0.28 + bass * 0.4).toFixed(3)})`;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(orig.x, orig.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // ================================================================
      // 25. CYBERNETIC CIRCUITRY / PCB TRACES (45-Degree Glowing Pathways)
      // ================================================================
      else if (mode === 'circuit') {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < circuitTraces.length; i++) {
          const tr = circuitTraces[i];
          const rgb = getRgbByIdx(tr.rgbIdx);
          tr.pulsePos = (tr.pulsePos + tr.pulseSpeed * dt * (1 + bass * 1.4)) % 1;

          // Base copper/neon PCB pathway
          ctx.beginPath();
          ctx.moveTo(tr.pts[0].x, tr.pts[0].y);
          for (let p = 1; p < tr.pts.length; p++) ctx.lineTo(tr.pts[p].x, tr.pts[p].y);
          ctx.strokeStyle = `rgba(${rgb}, ${(0.14 + mids * 0.1).toFixed(3)})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Solder pad nodes at start & end
          const start = tr.pts[0];
          const end = tr.pts[tr.pts.length - 1];
          ctx.fillStyle = `rgba(${rgb}, ${(0.26 + bass * 0.25).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(start.x, start.y, 3.2, 0, Math.PI * 2);
          ctx.arc(end.x, end.y, 3.2, 0, Math.PI * 2);
          ctx.fill();

          // Traveling luminous data pulse along segments
          const segCount = tr.pts.length - 1;
          const exactSeg = tr.pulsePos * segCount;
          const segIdx = Math.min(segCount - 1, Math.floor(exactSeg));
          const segT = exactSeg - segIdx;
          const pA = tr.pts[segIdx];
          const pB = tr.pts[segIdx + 1];
          const px = pA.x + (pB.x - pA.x) * segT;
          const py = pA.y + (pB.y - pA.y) * segT;

          const pg = ctx.createRadialGradient(px, py, 0.5, px, py, 14 + bass * 10);
          pg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          pg.addColorStop(0.35, `rgba(${rgb}, ${(0.75 + bass * 0.2).toFixed(3)})`);
          pg.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = pg;
          ctx.beginPath();
          ctx.arc(px, py, 14 + bass * 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ================================================================
      // 26. ORIGAMI / LOW-POLY MESH (3D Lit Flat Triangular Facets)
      // ================================================================
      else if (mode === 'origami') {
        const cols = width < 768 ? 9 : 14;
        const rows = width < 768 ? 7 : 10;
        const cw = width / cols;
        const ch = height / rows;
        const [r1, g1, b1] = colorsRef.current.c1Tuple;
        const [r2, g2, b2] = colorsRef.current.c2Tuple;

        const getZ = (gx: number, gy: number) =>
          (Math.sin(gx * 0.85 + tSec * 0.75) * Math.cos(gy * 0.9 - tSec * 0.55) +
            0.5 * Math.sin((gx + gy) * 0.65 + tSec * 0.45)) *
          (28 + bass * 32);

        const drawTri = (
          x1: number, y1: number, z1: number,
          x2: number, y2: number, z2: number,
          x3: number, y3: number, z3: number,
          alt: boolean
        ) => {
          // 3D cross product normal for flat-shaded directional lighting
          const ux = x2 - x1, uy = y2 - y1, uz = z2 - z1;
          const vx = x3 - x1, vy = y3 - y1, vz = z3 - z1;
          const nx = uy * vz - uz * vy;
          const ny = uz * vx - ux * vz;
          const nz = ux * vy - uy * vx;
          const nLen = Math.hypot(nx, ny, nz) || 1;
          // Light direction drifting softly
          const lx = Math.cos(tSec * 0.3) * 0.55;
          const ly = Math.sin(tSec * 0.25) * 0.45;
          const lz = 0.75;
          const dot = Math.max(0.08, Math.min(1, (nx * lx + ny * ly + nz * lz) / nLen));

          const shade = 0.14 + dot * (0.48 + bass * 0.24);
          const rr = Math.floor((alt ? r1 : r2) * shade);
          const gg = Math.floor((alt ? g1 : g2) * shade);
          const bb = Math.floor((alt ? b1 : b2) * shade);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.closePath();
          ctx.fillStyle = `rgba(${rr}, ${gg}, ${bb}, 0.78)`;
          ctx.fill();
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.06 + dot * 0.14).toFixed(3)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        };

        for (let gy = 0; gy < rows; gy++) {
          for (let gx = 0; gx < cols; gx++) {
            const x0 = gx * cw, y0 = gy * ch;
            const x1 = x0 + cw, y1 = y0 + ch;
            const z00 = getZ(gx, gy);
            const z10 = getZ(gx + 1, gy);
            const z11 = getZ(gx + 1, gy + 1);
            const z01 = getZ(gx, gy + 1);
            drawTri(x0, y0, z00, x1, y0, z10, x1, y1, z11, (gx + gy) % 2 === 0);
            drawTri(x0, y0, z00, x1, y1, z11, x0, y1, z01, (gx + gy) % 2 !== 0);
          }
        }
      }

      // ================================================================
      // 27. SOLARIZED THERMAL / INFRARED (Heat-Map Plumes in Cover Hues)
      // ================================================================
      else if (mode === 'thermal' && offCtx && offImg) {
        const data = offImg.data;
        const [r1, g1, b1] = colorsRef.current.c1Tuple;
        const [r2, g2, b2] = colorsRef.current.c2Tuple;
        const [r3, g3, b3] = colorsRef.current.c3Tuple;
        const tA = tSec * 0.55;
        const tB = tSec * 0.38;

        for (let y = 0; y < offH; y++) {
          const ny = (y / offH) * 3.8;
          for (let x = 0; x < offW; x++) {
            const nx = (x / offW) * 5.0;
            const heat =
              0.5 +
              0.24 * Math.sin(nx + tA + Math.sin(ny * 1.3 - tB)) +
              0.18 * Math.cos(ny * 1.6 - tA * 0.8 + Math.cos(nx * 1.1 + tB)) +
              0.12 * Math.sin((nx - ny) * 1.5 + tB * 1.4) +
              bass * 0.14;
            const h = Math.max(0, Math.min(1, heat));
            // Stark 4-stop thermal camera ramp using cover art hues
            let rr = 0, gg = 0, bb = 0;
            if (h < 0.35) {
              const k = h / 0.35;
              rr = r2 * k * 0.35;
              gg = g2 * k * 0.35;
              bb = b2 * k * 0.55;
            } else if (h < 0.65) {
              const k = (h - 0.35) / 0.3;
              rr = r2 * 0.35 * (1 - k) + r1 * k;
              gg = g2 * 0.35 * (1 - k) + g1 * k;
              bb = b2 * 0.55 * (1 - k) + b1 * k;
            } else if (h < 0.86) {
              const k = (h - 0.65) / 0.21;
              rr = r1 * (1 - k) + r3 * k;
              gg = g1 * (1 - k) + g3 * k;
              bb = b1 * (1 - k) + b3 * k;
            } else {
              const k = (h - 0.86) / 0.14;
              rr = r3 * (1 - k) + 255 * k;
              gg = g3 * (1 - k) + 250 * k;
              bb = b3 * (1 - k) + 220 * k;
            }
            const idx = (y * offW + x) * 4;
            data[idx] = rr;
            data[idx + 1] = gg;
            data[idx + 2] = bb;
            data[idx + 3] = 215;
          }
        }
        offCtx.putImageData(offImg, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offCanvas, 0, 0, width, height);
        ctx.restore();
      }

      // ================================================================
      // 28. REACTION-DIFFUSION (TURING PATTERNS) (Gray-Scott Coral/Zebra)
      // ================================================================
      else if (mode === 'turing' && offCtx && offImg) {
        const dA = 1.0;
        const dB = 0.5;
        const feed = 0.037 + mids * 0.008;
        const kill = 0.06 + bass * 0.004;
        const subSteps = Math.max(1, Math.min(5, Math.round(3 * (colorsRef.current.speed || 1))));

        // Occasionally inject fresh seed on strong bass beat so pattern never stagnates
        if (playing && bass > 0.65 && Math.random() < dt * 1.2) {
          const sx = 4 + Math.floor(Math.random() * (rdW - 8));
          const sy = 4 + Math.floor(Math.random() * (rdH - 8));
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              rdB[(sy + dy) * rdW + (sx + dx)] = 1;
            }
          }
        }

        for (let st = 0; st < subSteps; st++) {
          for (let y = 1; y < rdH - 1; y++) {
            const row = y * rdW;
            for (let x = 1; x < rdW - 1; x++) {
              const i = row + x;
              const a = rdA[i];
              const b = rdB[i];
              const lapA =
                (rdA[i - 1] + rdA[i + 1] + rdA[i - rdW] + rdA[i + rdW]) * 0.2 +
                (rdA[i - rdW - 1] + rdA[i - rdW + 1] + rdA[i + rdW - 1] + rdA[i + rdW + 1]) * 0.05 -
                a;
              const lapB =
                (rdB[i - 1] + rdB[i + 1] + rdB[i - rdW] + rdB[i + rdW]) * 0.2 +
                (rdB[i - rdW - 1] + rdB[i - rdW + 1] + rdB[i + rdW - 1] + rdB[i + rdW + 1]) * 0.05 -
                b;
              const abb = a * b * b;
              rdA2[i] = Math.max(0, Math.min(1, a + (dA * lapA - abb + feed * (1 - a))));
              rdB2[i] = Math.max(0, Math.min(1, b + (dB * lapB + abb - (kill + feed) * b)));
            }
          }
          const tmpA = rdA; rdA = rdA2; rdA2 = tmpA;
          const tmpB = rdB; rdB = rdB2; rdB2 = tmpB;
        }

        const data = offImg.data;
        const [r1, g1, b1] = colorsRef.current.c1Tuple;
        const [r2, g2, b2] = colorsRef.current.c2Tuple;
        for (let i = 0; i < rdSize; i++) {
          const v = Math.min(1, Math.max(0, (rdA[i] - rdB[i] * 1.45)));
          const inv = 1 - v;
          const p = i * 4;
          data[p] = r1 * inv + r2 * v * 0.22;
          data[p + 1] = g1 * inv + g2 * v * 0.22;
          data[p + 2] = b1 * inv + b2 * v * 0.28;
          data[p + 3] = 225;
        }
        offCtx.putImageData(offImg, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offCanvas, 0, 0, width, height);
        ctx.restore();
      }

      // ================================================================
      // 29. MOIRÉ INTERFERENCE (Overlapping Rotating Optical Ring Grids)
      // ================================================================
      else if (mode === 'moire') {
        const cx = width * 0.5;
        const cy = height * 0.5;
        const orbitR = Math.min(width, height) * (0.12 + bass * 0.05);
        const maxR = Math.hypot(width, height) * 0.72;
        const ringGap = width < 768 ? 13 : 11;

        const cA = { x: cx + Math.cos(tSec * 0.42) * orbitR, y: cy + Math.sin(tSec * 0.35) * orbitR };
        const cB = { x: cx - Math.cos(tSec * 0.31) * orbitR, y: cy - Math.sin(tSec * 0.48) * orbitR };

        ctx.lineWidth = 1.3;
        ctx.strokeStyle = `rgba(${c1}, ${(0.32 + bass * 0.24).toFixed(3)})`;
        ctx.beginPath();
        for (let r = ringGap; r < maxR; r += ringGap) {
          ctx.moveTo(cA.x + r, cA.y);
          ctx.arc(cA.x, cA.y, r, 0, Math.PI * 2);
        }
        ctx.stroke();

        ctx.strokeStyle = `rgba(${c2}, ${(0.32 + mids * 0.24).toFixed(3)})`;
        ctx.beginPath();
        for (let r = ringGap; r < maxR; r += ringGap) {
          ctx.moveTo(cB.x + r, cB.y);
          ctx.arc(cB.x, cB.y, r, 0, Math.PI * 2);
        }
        ctx.stroke();
      }

      // ================================================================
      // 30. ASCII / HALFTONE MATRIX (Live Pulsing Typographic & Dot Grid)
      // ================================================================
      else if (mode === 'halftone') {
        const cell = width < 768 ? 22 : 24;
        const chars = '·:+*#@';
        ctx.font = `bold ${Math.floor(cell * 0.62)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const cols = Math.ceil(width / cell);
        const rows = Math.ceil(height / cell);
        for (let gy = 0; gy < rows; gy++) {
          const y = gy * cell + cell * 0.5;
          for (let gx = 0; gx < cols; gx++) {
            const x = gx * cell + cell * 0.5;
            const wave =
              0.5 +
              0.3 * Math.sin(gx * 0.28 + tSec * 1.4 + Math.cos(gy * 0.22 - tSec * 0.8)) +
              0.2 * Math.cos((gx - gy) * 0.25 - tSec * 1.1);
            const val = Math.max(0, Math.min(1, wave * (0.65 + bass * 0.65)));
            const rgb = (gx + gy) % 3 === 0 ? c1 : (gx + gy) % 3 === 1 ? c2 : c3;

            // Halftone background dot + crisp ASCII glyph
            const dotR = val * cell * 0.34;
            ctx.fillStyle = `rgba(${rgb}, ${(0.12 + val * 0.22).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(x, y, dotR, 0, Math.PI * 2);
            ctx.fill();

            const ch = chars[Math.min(chars.length - 1, Math.floor(val * chars.length))];
            ctx.fillStyle = `rgba(${rgb}, ${(0.28 + val * 0.55).toFixed(3)})`;
            ctx.fillText(ch, x, y);
          }
        }
      }

      // ================================================================
      // 31. PIXEL SORT / GLITCH MELT (Melting Vertical Color Columns)
      // ================================================================
      else if (mode === 'pixelsort') {
        for (let i = 0; i < meltCols.length; i++) {
          const mc = meltCols[i];
          mc.dripY += mc.speed * (1 + bass * 2.2) * step;
          if (mc.dripY > height + 260) {
            mc.dripY = -80 - Math.random() * 140;
          }
          const rgb = getRgbByIdx(mc.rgbIdx);
          const streakLen = height * (0.35 + 0.35 * Math.sin(mc.phase + tSec * 0.45) + bass * 0.22);
          const grad = ctx.createLinearGradient(mc.x, mc.dripY - streakLen, mc.x, mc.dripY);
          grad.addColorStop(0, `rgba(${rgb}, 0)`);
          grad.addColorStop(0.55, `rgba(${rgb}, ${(mc.alpha * 0.65).toFixed(3)})`);
          grad.addColorStop(0.92, `rgba(${rgb}, ${(mc.alpha * 1.25).toFixed(3)})`);
          grad.addColorStop(1, `rgba(255, 255, 255, ${(mc.alpha * 0.85).toFixed(3)})`);
          ctx.fillStyle = grad;
          ctx.fillRect(mc.x, mc.dripY - streakLen, mc.w, streakLen);
        }

        // Occasional subtle digital tape horizontal glitch slice on bass hits
        if (playing && bass > 0.52) {
          const sliceY = ((Math.sin(tSec * 19.3) * 0.5 + 0.5) * height) | 0;
          const sliceH = 3 + ((bass * 12) | 0);
          ctx.fillStyle = `rgba(${c3}, ${(0.14 + bass * 0.16).toFixed(3)})`;
          ctx.fillRect(0, sliceY, width, sliceH);
        }
      }

      // ================================================================
      // 32. CAUSTICS (REFRACTED POOL LIGHT) (Razor-Sharp Web Patterns)
      // ================================================================
      else if (mode === 'caustics' && offCtx && offImg) {
        const data = offImg.data;
        const [r1, g1, b1] = colorsRef.current.c1Tuple;
        const [r2, g2, b2] = colorsRef.current.c2Tuple;
        const [r3, g3, b3] = colorsRef.current.c3Tuple;
        const t = tSec * 0.72;
        const boost = 1 + bass * 0.45;

        for (let y = 0; y < offH; y++) {
          const py = (y / offH) * 5.2;
          for (let x = 0; x < offW; x++) {
            const px = (x / offW) * 7.8;
            // Overlapping refracted wave interference ridges -> razor-sharp caustic webs
            const w1 = Math.sin(px + Math.sin(py + t) * 1.35 + t * 0.6);
            const w2 = Math.cos(py * 1.2 + Math.cos(px - t * 0.85) * 1.35 - t * 0.5);
            const w3 = Math.sin((px + py) * 0.85 + Math.sin(px - py + t * 1.1));
            const ridge = Math.abs(w1 + w2 + w3 * 0.7);
            const web = Math.pow(Math.max(0, 1 - ridge * 0.58), 4.2) * boost;
            const c = Math.min(1, web);

            const idx = (y * offW + x) * 4;
            data[idx] = Math.min(255, r2 * 0.08 + r1 * c * 0.85 + r3 * c * c * 0.75 + 90 * c * c * c);
            data[idx + 1] = Math.min(255, g2 * 0.1 + g1 * c * 0.85 + g3 * c * c * 0.75 + 95 * c * c * c);
            data[idx + 2] = Math.min(255, b2 * 0.14 + b1 * c * 0.85 + b3 * c * c * 0.75 + 100 * c * c * c);
            data[idx + 3] = 235;
          }
        }
        offCtx.putImageData(offImg, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offCanvas, 0, 0, width, height);
        ctx.restore();
      }

      // ================================================================
      // 33. CHROMATIC PRISM / DISPERSION (CMY + Accent Refracted Beams)
      // ================================================================
      else if (mode === 'prism') {
        const cx = width * 0.5;
        const cy = height * 0.5;
        const rot = tSec * 0.22;
        const beamLen = Math.hypot(width, height) * 0.85;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        // Incoming white/accent beam hitting the crystal
        const inAng = Math.PI + Math.sin(tSec * 0.35) * 0.22;
        const inGrad = ctx.createLinearGradient(cx + Math.cos(inAng) * beamLen, cy + Math.sin(inAng) * beamLen, cx, cy);
        inGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        inGrad.addColorStop(1, `rgba(255, 255, 255, ${(0.28 + bass * 0.2).toFixed(3)})`);
        ctx.strokeStyle = inGrad;
        ctx.lineWidth = 10 + bass * 8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(inAng) * beamLen, cy + Math.sin(inAng) * beamLen);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        // Dispersed overlapping CMY + track-accent spectral beams
        const spectra = [
          { rgb: '0, 235, 255', offset: -0.24 },
          { rgb: c1, offset: -0.1 },
          { rgb: '255, 45, 195', offset: 0.04 },
          { rgb: c3, offset: 0.16 },
          { rgb: '255, 225, 65', offset: 0.28 },
        ];
        const baseOutAng = Math.sin(tSec * 0.35) * 0.18;
        for (let s = 0; s < spectra.length; s++) {
          const sp = spectra[s];
          const a = baseOutAng + sp.offset * (1 + bass * 0.35);
          const spread = 0.075 + mids * 0.03;
          const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * beamLen, cy + Math.sin(a) * beamLen);
          g.addColorStop(0, `rgba(${sp.rgb}, ${(0.34 + bass * 0.2).toFixed(3)})`);
          g.addColorStop(0.55, `rgba(${sp.rgb}, ${(0.14 + mids * 0.1).toFixed(3)})`);
          g.addColorStop(1, `rgba(${sp.rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a - spread) * beamLen, cy + Math.sin(a - spread) * beamLen);
          ctx.lineTo(cx + Math.cos(a + spread) * beamLen, cy + Math.sin(a + spread) * beamLen);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Rotating glass triangle prism crystal at center
        const prismR = Math.min(width, height) * 0.13;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 - Math.PI * 0.5;
          const px = Math.cos(a) * prismR;
          const py = Math.sin(a) * prismR;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.35 + bass * 0.3).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      }

      // ================================================================
      // 34. FERROFLUID SPIKES (Magnetic Glossy Liquid Metal Ridges)
      // ================================================================
      else if (mode === 'ferrofluid') {
        const cx = width * 0.5;
        const cy = height * 0.52;
        const baseR = Math.min(width, height) * 0.24;
        const layers = 3;

        for (let l = layers - 1; l >= 0; l--) {
          const spikeCount = 12 + l * 4;
          const rScale = 1 + l * 0.18;
          const pts = 160;
          ctx.beginPath();
          for (let i = 0; i <= pts; i++) {
            const a = (i / pts) * Math.PI * 2;
            const harmonic =
              Math.pow(Math.max(0, Math.sin(a * spikeCount + tSec * (1.2 - l * 0.25))), 3) *
                (38 + bass * 78) +
              Math.pow(Math.max(0, Math.cos(a * (spikeCount * 0.5) - tSec * 0.9)), 2) *
                (18 + mids * 32);
            const r = baseR * rScale + harmonic;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();

          // Glossy dark liquid metal fill + bright metallic accent ridge
          const rgb = l === 0 ? c1 : l === 1 ? c2 : c3;
          const fg = ctx.createRadialGradient(cx - baseR * 0.25, cy - baseR * 0.25, baseR * 0.1, cx, cy, baseR * 1.7);
          fg.addColorStop(0, `rgba(${rgb}, ${(0.22 + bass * 0.14).toFixed(3)})`);
          fg.addColorStop(0.55, '#090b10');
          fg.addColorStop(1, '#020306');
          ctx.fillStyle = fg;
          ctx.fill();

          ctx.strokeStyle = `rgba(${rgb}, ${(0.45 + bass * 0.42).toFixed(3)})`;
          ctx.lineWidth = l === 0 ? 2.4 : 1.4;
          ctx.stroke();

          if (l === 0) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${(0.28 + bass * 0.35).toFixed(3)})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      }

      // ================================================================
      // 35. OIL SLICK / IRIDESCENCE (Thin-Film Pearlescent Bands)
      // ================================================================
      else if (mode === 'oilslick' && offCtx && offImg) {
        const data = offImg.data;
        const [r1, g1, b1] = colorsRef.current.c1Tuple;
        const t = tSec * 0.45;
        const shift = bass * 1.4;

        for (let y = 0; y < offH; y++) {
          const ny = (y / offH) * 3.4;
          for (let x = 0; x < offW; x++) {
            const nx = (x / offW) * 4.8;
            // Thin-film optical thickness field
            const thick =
              Math.sin(nx + Math.cos(ny * 1.3 + t)) +
              Math.cos(ny - Math.sin(nx * 1.1 - t * 0.8)) +
              0.6 * Math.sin((nx + ny) * 1.2 + t * 0.65);
            const phase = thick * 2.8 + shift;
            // Pearlescent RGB thin-film interference curves
            const ir = 0.5 + 0.5 * Math.cos(phase);
            const ig = 0.5 + 0.5 * Math.cos(phase + 2.094);
            const ib = 0.5 + 0.5 * Math.cos(phase + 4.188);
            // Keep obsidian troughs dark so iridescent bands gleam cleanly
            const sheen = Math.pow(0.5 + 0.5 * Math.sin(thick * 1.9 + t * 0.5), 1.8) * (0.58 + energy * 0.35);

            const idx = (y * offW + x) * 4;
            data[idx] = Math.min(255, (ir * 195 + r1 * 0.28) * sheen + 6);
            data[idx + 1] = Math.min(255, (ig * 195 + g1 * 0.28) * sheen + 7);
            data[idx + 2] = Math.min(255, (ib * 210 + b1 * 0.28) * sheen + 11);
            data[idx + 3] = 235;
          }
        }
        offCtx.putImageData(offImg, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(offCanvas, 0, 0, width, height);
        ctx.restore();
      } else if (cachedExtraModule && extraState) {
        cachedExtraModule.renderExtraTheme(
          mode,
          {
            ctx,
            width,
            height,
            tSec,
            dt,
            step,
            bass,
            mids,
            energy,
            playing,
            c1,
            c2,
            c3,
            c1T: colorsRef.current.c1Tuple,
            c2T: colorsRef.current.c2Tuple,
            c3T: colorsRef.current.c3Tuple,
            freqBuf,
            offCanvas,
            offCtx,
            offImg,
            songTitle: colorsRef.current.songTitle,
            songArtist: colorsRef.current.songArtist,
          },
          extraState
        );
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
      cancelled = true;
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
