import React, { useEffect, useRef } from 'react';
import { audioController } from './AudioVisualizer';

interface SpaceMeteorBackgroundProps {
  primaryRgb: string;
  secondaryRgb: string;
  tertiaryRgb: string;
  isPlaying: boolean;
}

interface Star {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
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

export const SpaceMeteorBackground: React.FC<SpaceMeteorBackgroundProps> = ({
  primaryRgb,
  secondaryRgb,
  tertiaryRgb,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorsRef = useRef({ primaryRgb, secondaryRgb, tertiaryRgb, isPlaying });

  useEffect(() => {
    colorsRef.current = { primaryRgb, secondaryRgb, tertiaryRgb, isPlaying };
  }, [primaryRgb, secondaryRgb, tertiaryRgb, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const stars: Star[] = [];
    const meteors: Meteor[] = [];
    const freqBuf = new Uint8Array(64);

    const initStars = () => {
      stars.length = 0;
      const count = width < 768 ? 85 : 150;
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.45 + 0.35,
          baseAlpha: Math.random() * 0.45 + 0.14,
          twinkleSpeed: Math.random() * 1.8 + 0.4,
          phase: Math.random() * Math.PI * 2,
        });
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
      initStars();
    };

    resize();
    window.addEventListener('resize', resize);

    const pickColor = (): string => {
      const { primaryRgb: c1, secondaryRgb: c2, tertiaryRgb: c3 } = colorsRef.current;
      const r = Math.random();
      if (r < 0.48) return c1;
      if (r < 0.8) return c2;
      return c3;
    };

    const spawnMeteor = (energy: number) => {
      const fromTop = Math.random() < 0.72;
      const startX = fromTop ? Math.random() * width * 1.15 : width * (0.65 + Math.random() * 0.4);
      const startY = fromTop ? -30 - Math.random() * 80 : Math.random() * height * 0.45;
      const speed = (6.5 + Math.random() * 6.5) * (1 + energy * 0.85);
      const angle = (Math.PI * 0.62) + (Math.random() - 0.5) * 0.16; // diagonal top-right -> bottom-left
      meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length: (70 + Math.random() * 120) * (1 + energy * 0.65),
        width: (1.2 + Math.random() * 1.6) * (1 + energy * 0.4),
        alpha: 0.55 + Math.random() * 0.42,
        life: 0,
        maxLife: 45 + Math.random() * 55,
        rgb: pickColor(),
      });
    };

    // Seed a couple initial meteors so space feels alive immediately
    for (let i = 0; i < 4; i++) {
      spawnMeteor(0.2);
    }

    let rafId = 0;
    let lastTs = performance.now();
    let spawnAccumulator = 0;

    const render = (now: number) => {
      if (document.hidden) {
        rafId = 0;
        return;
      }

      const dt = Math.min(0.05, Math.max(0.008, (now - lastTs) / 1000));
      lastTs = now;
      const tSec = now * 0.001;

      const { primaryRgb: c1, secondaryRgb: c2, isPlaying: playing } = colorsRef.current;

      // Measure live audio energy for reactive meteor shower visualizer
      let energy = 0;
      const analyser = audioController.analyser;
      if (playing && analyser) {
        analyser.getByteFrequencyData(freqBuf);
        let bassSum = 0;
        for (let i = 0; i < 14; i++) bassSum += freqBuf[i];
        energy = Math.min(1, bassSum / (14 * 205));
      } else if (playing) {
        // Smooth organic pulse fallback on mobile/iOS where WebAudio analyser isn't attached
        energy = 0.25 + 0.22 * Math.abs(Math.sin(tSec * 2.8)) + 0.12 * Math.abs(Math.cos(tSec * 4.3));
      } else {
        energy = 0.06;
      }

      ctx.clearRect(0, 0, width, height);

      // Subtle deep-space nebula glow tinted by the current song's colors
      const neb1 = ctx.createRadialGradient(
        width * 0.22,
        height * 0.24,
        10,
        width * 0.22,
        height * 0.24,
        Math.max(width, height) * 0.55
      );
      neb1.addColorStop(0, `rgba(${c1}, ${(0.11 + energy * 0.1).toFixed(3)})`);
      neb1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, width, height);

      const neb2 = ctx.createRadialGradient(
        width * 0.82,
        height * 0.78,
        10,
        width * 0.82,
        height * 0.78,
        Math.max(width, height) * 0.52
      );
      neb2.addColorStop(0, `rgba(${c2}, ${(0.09 + energy * 0.09).toFixed(3)})`);
      neb2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, width, height);

      // Faintly twinkling starfield
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const twinkle = 0.55 + 0.45 * Math.sin(tSec * s.twinkleSpeed + s.phase);
        const a = Math.min(0.85, s.baseAlpha * twinkle + energy * 0.08);
        ctx.fillStyle = `rgba(240, 246, 255, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Spawn meteors continuously (faster & richer when audio energy rises)
      const maxMeteors = width < 768 ? 14 : 26;
      const spawnsPerSec = playing ? 2.4 + energy * 6.5 : 1.1;
      spawnAccumulator += dt * spawnsPerSec;
      while (spawnAccumulator >= 1 && meteors.length < maxMeteors) {
        spawnAccumulator -= 1;
        spawnMeteor(energy);
      }

      // Update & draw streaking meteors with song-colored plasma tails
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        const step = dt * 60;
        m.x += m.vx * step;
        m.y += m.vy * step;
        m.life += step;

        const progress = m.life / m.maxLife;
        const fade = progress < 0.15 ? progress / 0.15 : Math.max(0, 1 - (progress - 0.15) / 0.85);
        const curAlpha = m.alpha * fade;

        if (m.life >= m.maxLife || m.x < -200 || m.y > height + 200) {
          meteors.splice(i, 1);
          continue;
        }

        const speedMag = Math.hypot(m.vx, m.vy) || 1;
        const tailX = m.x - (m.vx / speedMag) * m.length;
        const tailY = m.y - (m.vy / speedMag) * m.length;

        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255, 255, 255, ${Math.min(1, curAlpha * 1.15).toFixed(3)})`);
        grad.addColorStop(0.18, `rgba(${m.rgb}, ${(curAlpha * 0.95).toFixed(3)})`);
        grad.addColorStop(0.6, `rgba(${m.rgb}, ${(curAlpha * 0.35).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${m.rgb}, 0)`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = m.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();

        // Glowing meteor head
        ctx.fillStyle = `rgba(255, 255, 255, ${(curAlpha * 0.95).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.width * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }

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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
};
