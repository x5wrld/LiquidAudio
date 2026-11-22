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
