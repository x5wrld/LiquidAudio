import type { UiStyleMode } from './themesCatalog';

export interface ExtraThemeCtx {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  tSec: number;
  dt: number;
  step: number;
  bass: number;
  mids: number;
  energy: number;
  playing: boolean;
  c1: string;
  c2: string;
  c3: string;
  c1T: [number, number, number];
  c2T: [number, number, number];
  c3T: [number, number, number];
  freqBuf: Uint8Array;
  offCanvas: HTMLCanvasElement;
  offCtx: CanvasRenderingContext2D | null;
  offImg: ImageData | null;
  songTitle: string;
  songArtist: string;
}

export interface ExtraThemeState {
  embers: { x: number; y: number; vx: number; vy: number; r: number; life: number; maxLife: number; ash: boolean }[];
  matrixDrops: { x: number; y: number; speed: number; len: number; seed: number }[];
  warpStars: { x: number; y: number; z: number; pz: number; rgbIdx: number }[];
  sakuraPetals: { x: number; y: number; vx: number; vy: number; r: number; rot: number; spin: number; phase: number }[];
  mirrorShards: { x: number; y: number; vx: number; vy: number; size: number; rot: number; vrot: number; rgbIdx: number }[];
  sonarBlips: { ang: number; dist: number; alpha: number; rgbIdx: number }[];
  mercuryDrops: { x: number; y: number; vx: number; vy: number; r: number; phase: number }[];
  boids: { x: number; y: number; vx: number; vy: number; rgbIdx: number }[];
  attractorPts: { x: number; y: number; z: number }[];
  ax: number;
  ay: number;
  az: number;
  kintsugiCracks: { pts: { x: number; y: number }[]; width: number; phase: number }[];
  transitLines: { pts: { x: number; y: number }[]; rgbIdx: number; trainT: number; speed: number }[];
  seismoHistory: number[][];
}

export function createExtraThemeState(): ExtraThemeState {
  return {
    embers: [],
    matrixDrops: [],
    warpStars: [],
    sakuraPetals: [],
    mirrorShards: [],
    sonarBlips: [],
    mercuryDrops: [],
    boids: [],
    attractorPts: [],
    ax: 0.1,
    ay: 0,
    az: 0,
    kintsugiCracks: [],
    transitLines: [],
    seismoHistory: [],
  };
}

export function initExtraThemeState(mode: UiStyleMode, width: number, height: number, st: ExtraThemeState) {
  const isMobile = width < 768;
  st.embers.length = 0;
  st.matrixDrops.length = 0;
  st.warpStars.length = 0;
  st.sakuraPetals.length = 0;
  st.mirrorShards.length = 0;
  st.sonarBlips.length = 0;
  st.mercuryDrops.length = 0;
  st.boids.length = 0;
  st.attractorPts.length = 0;
  st.kintsugiCracks.length = 0;
  st.transitLines.length = 0;
  st.seismoHistory.length = 0;

  if (mode === 'embers') {
    const n = isMobile ? 55 : 95;
    for (let i = 0; i < n; i++) {
      const ash = Math.random() < 0.25;
      st.embers.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: -(0.6 + Math.random() * 1.9),
        r: ash ? 1.5 + Math.random() * 2.4 : 1.0 + Math.random() * 2.6,
        life: Math.random() * 180,
        maxLife: 160 + Math.random() * 160,
        ash,
      });
    }
  } else if (mode === 'matrix') {
    const colW = isMobile ? 20 : 18;
    const cols = Math.ceil(width / colW);
    for (let i = 0; i < cols; i++) {
      st.matrixDrops.push({
        x: i * colW + colW * 0.5,
        y: Math.random() * height,
        speed: 1.6 + Math.random() * 3.4,
        len: 8 + Math.floor(Math.random() * 16),
        seed: Math.floor(Math.random() * 1000),
      });
    }
  } else if (mode === 'starwarp') {
    const n = isMobile ? 95 : 175;
    for (let i = 0; i < n; i++) {
      const z = 0.08 + Math.random() * 0.92;
      st.warpStars.push({
        x: (Math.random() - 0.5) * width * 1.6,
        y: (Math.random() - 0.5) * height * 1.6,
        z,
        pz: z,
        rgbIdx: i % 3,
      });
    }
  } else if (mode === 'sakura') {
    const n = isMobile ? 24 : 42;
    for (let i = 0; i < n; i++) {
      st.sakuraPetals.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: 0.45 + Math.random() * 0.75,
        vy: 0.35 + Math.random() * 0.65,
        r: 7 + Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.028,
        phase: Math.random() * Math.PI * 2,
      });
    }
  } else if (mode === 'mirror') {
    const n = isMobile ? 18 : 30;
    for (let i = 0; i < n; i++) {
      st.mirrorShards.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        size: 24 + Math.random() * 52,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.008,
        rgbIdx: i % 3,
      });
    }
  } else if (mode === 'sonar') {
    for (let i = 0; i < 16; i++) {
      st.sonarBlips.push({
        ang: Math.random() * Math.PI * 2,
        dist: 0.14 + Math.random() * 0.78,
        alpha: 0,
        rgbIdx: i % 3,
      });
    }
  } else if (mode === 'mercury') {
    const n = isMobile ? 10 : 15;
    const minD = Math.min(width, height);
    for (let i = 0; i < n; i++) {
      st.mercuryDrops.push({
        x: width * (0.2 + Math.random() * 0.6),
        y: height * (0.2 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 0.9,
        vy: (Math.random() - 0.5) * 0.9,
        r: minD * (0.032 + Math.random() * 0.055),
        phase: Math.random() * Math.PI * 2,
      });
    }
  } else if (mode === 'boids') {
    const n = isMobile ? 55 : 95;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      st.boids.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(a) * 2.1,
        vy: Math.sin(a) * 2.1,
        rgbIdx: i % 3,
      });
    }
  } else if (mode === 'attractor') {
    st.ax = 0.1;
    st.ay = 0;
    st.az = 0;
    for (let i = 0; i < 360; i++) {
      const dtL = 0.008;
      const dx = 10 * (st.ay - st.ax);
      const dy = st.ax * (28 - st.az) - st.ay;
      const dz = st.ax * st.ay - (8 / 3) * st.az;
      st.ax += dx * dtL;
      st.ay += dy * dtL;
      st.az += dz * dtL;
      st.attractorPts.push({ x: st.ax, y: st.ay, z: st.az });
    }
  } else if (mode === 'kintsugi') {
    const cracks = isMobile ? 8 : 13;
    for (let c = 0; c < cracks; c++) {
      let x = c % 2 === 0 ? Math.random() * width : c % 4 === 1 ? 0 : width;
      let y = c % 2 === 0 ? (c % 4 === 0 ? 0 : height) : Math.random() * height;
      let ang = Math.atan2(height * 0.5 - y, width * 0.5 - x) + (Math.random() - 0.5) * 0.7;
      const pts = [{ x, y }];
      const segs = 9 + Math.floor(Math.random() * 8);
      for (let s = 0; s < segs; s++) {
        const len = 38 + Math.random() * 75;
        ang += (Math.random() - 0.5) * 0.85;
        x += Math.cos(ang) * len;
        y += Math.sin(ang) * len;
        pts.push({ x, y });
      }
      st.kintsugiCracks.push({ pts, width: 1.4 + Math.random() * 2.2, phase: Math.random() * Math.PI * 2 });
    }
  } else if (mode === 'transit') {
    const lines = isMobile ? 7 : 11;
    const dirs = [
      [1, 0], [1, 1], [0, 1], [-1, 1],
      [-1, 0], [-1, -1], [0, -1], [1, -1],
    ];
    for (let i = 0; i < lines; i++) {
      let x = (i % 2 === 0) ? 0 : Math.random() * width;
      let y = (i % 2 === 0) ? height * (0.12 + (i / lines) * 0.76) : 0;
      let dIdx = i % 2 === 0 ? 0 : 2;
      const pts = [{ x, y }];
      for (let s = 0; s < 6; s++) {
        const len = (width + height) * (0.07 + Math.random() * 0.11);
        x += dirs[dIdx][0] * len;
        y += dirs[dIdx][1] * len;
        pts.push({ x, y });
        dIdx = (dIdx + (Math.random() < 0.5 ? 1 : 7)) % 8;
      }
      st.transitLines.push({ pts, rgbIdx: i % 3, trainT: Math.random(), speed: 0.08 + Math.random() * 0.14 });
    }
  } else if (mode === 'seismograph') {
    const rows = isMobile ? 6 : 9;
    const cols = 72;
    for (let r = 0; r < rows; r++) {
      st.seismoHistory.push(new Array(cols).fill(0));
    }
  }
}

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

export function renderExtraTheme(mode: UiStyleMode, ec: ExtraThemeCtx, st: ExtraThemeState): boolean {
  const { ctx, width, height, tSec, dt, step, bass, mids, energy, playing, c1, c2, c3, c1T, c2T, c3T, freqBuf, offCanvas, offCtx, offImg, songTitle, songArtist } = ec;
  const pickRgb = (idx: number) => (idx === 0 ? c1 : idx === 1 ? c2 : c3);

  // 1. EMBERS & ASH
  if (mode === 'embers') {
    const glow = ctx.createRadialGradient(width * 0.5, height * 1.08, 10, width * 0.5, height, Math.max(width, height) * 0.65);
    glow.addColorStop(0, `rgba(${c1}, ${(0.22 + bass * 0.18).toFixed(3)})`);
    glow.addColorStop(0.5, `rgba(255, 110, 35, ${(0.08 + bass * 0.08).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < st.embers.length; i++) {
      const e = st.embers[i];
      e.y += e.vy * (1 + bass * 1.35) * step;
      e.x += (e.vx + Math.sin(tSec * 1.4 + i) * 0.45) * step;
      e.life += step;
      if (e.y < -20 || e.life > e.maxLife) {
        e.y = height + 10 + Math.random() * 40;
        e.x = Math.random() * width;
        e.life = 0;
      }
      const fade = Math.sin((e.life / e.maxLife) * Math.PI);
      if (e.ash) {
        ctx.fillStyle = `rgba(180, 175, 170, ${(fade * 0.25).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(e.x, e.y, 0.2, e.x, e.y, e.r * 3.8);
        g.addColorStop(0, `rgba(255, 248, 220, ${(fade * 0.95).toFixed(3)})`);
        g.addColorStop(0.35, `rgba(${i % 2 === 0 ? c1 : '255, 130, 40'}, ${(fade * 0.72).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255, 80, 10, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return true;
  }

  // 2. DIGITAL MATRIX / CODE RAIN
  if (mode === 'matrix') {
    const glyphs = '01アイウエオカキクケコサシスセソ+-*=:;<>';
    ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < st.matrixDrops.length; i++) {
      const d = st.matrixDrops[i];
      d.y += d.speed * (1 + bass * 1.2) * step;
      if (d.y - d.len * 16 > height) {
        d.y = -Math.random() * 120;
      }
      for (let k = 0; k < d.len; k++) {
        const cy = d.y - k * 16;
        if (cy < -16 || cy > height + 16) continue;
        const a = (1 - k / d.len) * (k === 0 ? 0.95 : 0.45 + mids * 0.22);
        const ch = glyphs[(d.seed + k + Math.floor(tSec * 6)) % glyphs.length];
        ctx.fillStyle = k === 0 ? `rgba(240, 255, 245, ${a.toFixed(3)})` : `rgba(${i % 3 === 0 ? c2 : c1}, ${a.toFixed(3)})`;
        ctx.fillText(ch, d.x, cy);
      }
    }
    return true;
  }

  // 3. STARFIELD WARP
  if (mode === 'starwarp') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const spd = (0.008 + bass * 0.018) * step;
    for (let i = 0; i < st.warpStars.length; i++) {
      const s = st.warpStars[i];
      s.pz = s.z;
      s.z -= spd;
      if (s.z <= 0.02) {
        s.x = (Math.random() - 0.5) * width * 1.6;
        s.y = (Math.random() - 0.5) * height * 1.6;
        s.z = 1;
        s.pz = 1;
      }
      const sx = cx + s.x / s.z;
      const sy = cy + s.y / s.z;
      const px = cx + s.x / s.pz;
      const py = cy + s.y / s.pz;
      const alpha = Math.min(0.95, (1 - s.z) * 1.15);
      ctx.strokeStyle = `rgba(${s.z < 0.45 ? pickRgb(s.rgbIdx) : '240, 248, 255'}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = Math.max(0.8, (1 - s.z) * 2.8);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }
    return true;
  }

  // 4. GOLDEN HOUR / AMBER
  if (mode === 'goldenhour') {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#1e1008');
    bg.addColorStop(0.55, '#140a05');
    bg.addColorStop(1, '#090503');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const colors = ['255, 178, 72', '224, 108, 48', '196, 84, 42', c1];
    for (let i = 0; i < 6; i++) {
      const bx = width * (0.1 + i * 0.17) + Math.sin(tSec * 0.25 + i * 1.4) * 55;
      const g = ctx.createLinearGradient(bx, 0, bx + width * 0.28, height);
      g.addColorStop(0, `rgba(${colors[i % colors.length]}, ${(0.18 + bass * 0.12).toFixed(3)})`);
      g.addColorStop(0.55, `rgba(${colors[(i + 1) % colors.length]}, ${(0.08 + mids * 0.06).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx - 50, 0);
      ctx.lineTo(bx + 70, 0);
      ctx.lineTo(bx + width * 0.36, height);
      ctx.lineTo(bx + width * 0.14, height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return true;
  }

  // 5. CHERRY BLOSSOM (SAKURA)
  if (mode === 'sakura') {
    const blush = ctx.createRadialGradient(width * 0.25, height * 0.2, 10, width * 0.25, height * 0.2, Math.max(width, height) * 0.65);
    blush.addColorStop(0, `rgba(244, 143, 177, ${(0.2 + mids * 0.1).toFixed(3)})`);
    blush.addColorStop(0.55, `rgba(194, 24, 91, ${(0.08 + bass * 0.06).toFixed(3)})`);
    blush.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = blush;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < st.sakuraPetals.length; i++) {
      const p = st.sakuraPetals[i];
      p.x += (p.vx + Math.sin(tSec * 0.9 + p.phase) * 0.55 + energy * 0.4) * step;
      p.y += (p.vy + Math.cos(tSec * 0.7 + p.phase) * 0.22) * step;
      p.rot += p.spin * step;
      if (p.x > width + 30) p.x = -25;
      if (p.y > height + 30) {
        p.y = -25;
        p.x = Math.random() * width;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = i % 3 === 0 ? `rgba(255, 195, 218, 0.62)` : i % 3 === 1 ? `rgba(244, 114, 182, 0.52)` : `rgba(${c1}, 0.48)`;
      ctx.beginPath();
      ctx.moveTo(0, -p.r);
      ctx.bezierCurveTo(p.r * 0.85, -p.r * 0.4, p.r * 0.7, p.r * 0.85, 0, p.r);
      ctx.bezierCurveTo(-p.r * 0.7, p.r * 0.85, -p.r * 0.85, -p.r * 0.4, 0, -p.r);
      ctx.fill();
      ctx.restore();
    }
    return true;
  }

  // 6. CYBERPUNK / TOKYO NEON
  if (mode === 'cyberpunk') {
    const paletteNeo = ['255, 30, 145', '0, 238, 255', '238, 255, 45', c1];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const bars = width < 768 ? 14 : 24;
    for (let i = 0; i < bars; i++) {
      const x = ((i + 0.5) / bars) * width + Math.sin(tSec * 0.4 + i * 2.3) * 18;
      const bw = 6 + (i % 4) * 9;
      const h = height * (0.38 + 0.48 * Math.abs(Math.sin(i * 1.7 + tSec * 0.55))) * (0.85 + bass * 0.35);
      const y = (height - h) * (0.3 + 0.4 * Math.sin(i * 2.1 + tSec * 0.3));
      const rgb = paletteNeo[i % paletteNeo.length];
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, `rgba(${rgb}, 0)`);
      g.addColorStop(0.25, `rgba(${rgb}, ${(0.28 + bass * 0.2).toFixed(3)})`);
      g.addColorStop(0.75, `rgba(${rgb}, ${(0.22 + mids * 0.16).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - bw * 0.5, y, bw, h);
    }
    ctx.restore();
    return true;
  }

  // 7. BASS PULSE / CYMATICS
  if (mode === 'cymatics') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const maxR = Math.hypot(width, height) * 0.58;
    const rings = 12;
    const phase = (tSec * (0.45 + bass * 0.55)) % 1;
    for (let i = 0; i < rings; i++) {
      const frac = (i + phase) / rings;
      const r = frac * maxR;
      const fade = Math.sin(frac * Math.PI);
      const sides = 6 + (i % 3) * 2;
      ctx.strokeStyle = `rgba(${pickRgb(i % 3)}, ${(fade * (0.36 + bass * 0.38)).toFixed(3)})`;
      ctx.lineWidth = 1.4 + (1 - frac) * (2.5 + bass * 2.2);
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const a = (k / 72) * Math.PI * 2 + tSec * 0.12 * (i % 2 === 0 ? 1 : -1);
        const ripple = Math.sin(a * sides + tSec * 1.8) * (6 + bass * 18) * fade;
        const px = cx + Math.cos(a) * (r + ripple);
        const py = cy + Math.sin(a) * (r + ripple);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    return true;
  }

  // 8. LISSAJOUS KNOTS
  if (mode === 'lissajous') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const rx = width * 0.36;
    const ry = height * 0.36;
    const aFreq = 3;
    const bFreq = 4;
    const delta = tSec * 0.45;
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      const pts = 220;
      for (let i = 0; i <= pts; i++) {
        const u = (i / pts) * Math.PI * 2;
        const x = cx + Math.sin(u * (aFreq + layer) + delta) * rx * (1 + bass * 0.12);
        const y = cy + Math.sin(u * (bFreq + layer * 0.5) + delta * 0.7) * ry * (1 + mids * 0.12);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const rgb = layer === 0 ? c1 : c2;
      ctx.strokeStyle = `rgba(${rgb}, ${(0.22 + bass * 0.22).toFixed(3)})`;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb}, ${(0.78 + mids * 0.2).toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    return true;
  }

  // 9. STAINED GLASS ROSE WINDOW
  if (mode === 'rosewindow') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const maxR = Math.min(width, height) * 0.48;
    const petals = 16;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tSec * 0.06);
    for (let ring = 0; ring < 3; ring++) {
      const rIn = maxR * (0.18 + ring * 0.26);
      const rOut = maxR * (0.42 + ring * 0.27);
      for (let i = 0; i < petals; i++) {
        const a1 = (i / petals) * Math.PI * 2;
        const a2 = ((i + 1) / petals) * Math.PI * 2;
        const pulse = 0.45 + 0.55 * Math.sin(tSec * 1.4 + i * 0.8 + ring * 1.5);
        const rgb = pickRgb((i + ring) % 3);
        ctx.beginPath();
        ctx.arc(0, 0, rOut, a1, a2);
        ctx.arc(0, 0, rIn, a2, a1, true);
        ctx.closePath();
        ctx.fillStyle = `rgba(${rgb}, ${(0.12 + pulse * (0.18 + bass * 0.22)).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(10, 12, 18, 0.85)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.15 + pulse * 0.2).toFixed(3)})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    ctx.restore();
    return true;
  }

  // 10. MAGNETIC SAND / CHLADNI PLATES
  if (mode === 'chladni' && offCtx && offImg) {
    const data = offImg.data;
    const ow = offCanvas.width;
    const oh = offCanvas.height;
    const m = 2 + Math.floor((tSec * 0.25) % 4);
    const n = 3 + Math.floor((tSec * 0.19 + bass * 2) % 5);
    const blend = Math.sin(tSec * 0.5) * 0.5 + 0.5;
    for (let y = 0; y < oh; y++) {
      const ny = (y / oh) * Math.PI * 2 - Math.PI;
      for (let x = 0; x < ow; x++) {
        const nx = (x / ow) * Math.PI * 2 - Math.PI;
        const v1 = Math.cos(n * nx) * Math.cos(m * ny) - Math.cos(m * nx) * Math.cos(n * ny);
        const v2 = Math.cos((n + 1) * nx) * Math.cos(m * ny) + Math.cos(m * nx) * Math.cos((n + 1) * ny);
        const val = Math.abs(v1 * (1 - blend) + v2 * blend);
        const grain = Math.pow(Math.max(0, 1 - val * 1.8), 3.2) * (0.75 + bass * 0.55);
        const p = (y * ow + x) * 4;
        data[p] = Math.min(255, c1T[0] * grain + c3T[0] * grain * grain * 0.5 + 6);
        data[p + 1] = Math.min(255, c1T[1] * grain + c3T[1] * grain * grain * 0.5 + 7);
        data[p + 2] = Math.min(255, c1T[2] * grain + c3T[2] * grain * grain * 0.5 + 11);
        data[p + 3] = 235;
      }
    }
    offCtx.putImageData(offImg, 0, 0);
    ctx.drawImage(offCanvas, 0, 0, width, height);
    return true;
  }

  // 11. HEXAGONAL HONEYCOMB / HIVE
  if (mode === 'honeycomb') {
    const r = width < 768 ? 28 : 34;
    const dx = r * 1.5;
    const dy = r * Math.sqrt(3);
    const cols = Math.ceil(width / dx) + 2;
    const rows = Math.ceil(height / dy) + 2;
    for (let gx = 0; gx < cols; gx++) {
      for (let gy = 0; gy < rows; gy++) {
        const cx = gx * dx;
        const cy = gy * dy + (gx % 2 === 1 ? dy * 0.5 : 0);
        const dist = Math.hypot(cx - width * 0.5, cy - height * 0.5);
        const wave = 0.5 + 0.5 * Math.sin(dist * 0.018 - tSec * 2.2);
        const energyGlow = wave * (0.12 + bass * 0.32);
        const rgb = pickRgb((gx + gy) % 3);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const px = cx + Math.cos(a) * (r - 2);
          const py = cy + Math.sin(a) * (r - 2);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${rgb}, ${energyGlow.toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${rgb}, ${(0.14 + wave * 0.28).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }
    return true;
  }

  // 12. KINETIC PENDULUM WAVE
  if (mode === 'pendulum') {
    const count = width < 768 ? 14 : 22;
    const topY = height * 0.1;
    for (let i = 0; i < count; i++) {
      const freq = 0.75 + i * 0.065;
      const swing = Math.sin(tSec * freq * 2.1) * (width * 0.24);
      const px = width * 0.5 + swing;
      const py = topY + (i + 1) * ((height * 0.78) / count);
      const rgb = pickRgb(i % 3);

      ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width * 0.5, topY);
      ctx.lineTo(px, py);
      ctx.stroke();

      const orbR = 6 + bass * 5;
      const g = ctx.createRadialGradient(px, py, 1, px, py, orbR * 3);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      g.addColorStop(0.35, `rgba(${rgb}, 0.72)`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, orbR * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }

  // 13. SHATTERED MIRROR / GLASS SHARDS
  if (mode === 'mirror') {
    for (let i = 0; i < st.mirrorShards.length; i++) {
      const sh = st.mirrorShards[i];
      sh.x += sh.vx * (1 + bass * 0.8) * step;
      sh.y += sh.vy * (1 + bass * 0.8) * step;
      sh.rot += sh.vrot * step;
      if (sh.x < -80) sh.x = width + 80;
      if (sh.x > width + 80) sh.x = -80;
      if (sh.y < -80) sh.y = height + 80;
      if (sh.y > height + 80) sh.y = -80;

      const glint = 0.4 + 0.6 * Math.abs(Math.sin(sh.rot * 2 + tSec * 0.8));
      const rgb = pickRgb(sh.rgbIdx);
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot);
      ctx.beginPath();
      ctx.moveTo(0, -sh.size);
      ctx.lineTo(sh.size * 0.78, sh.size * 0.55);
      ctx.lineTo(-sh.size * 0.65, sh.size * 0.82);
      ctx.closePath();
      const g = ctx.createLinearGradient(-sh.size, -sh.size, sh.size, sh.size);
      g.addColorStop(0, `rgba(255, 255, 255, ${(0.08 + glint * 0.28).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(${rgb}, ${(0.18 + bass * 0.22).toFixed(3)})`);
      g.addColorStop(1, 'rgba(10, 14, 24, 0.25)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.22 + glint * 0.35).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
    return true;
  }

  // 14. SONAR RADAR SWEEP
  if (mode === 'sonar') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const maxR = Math.min(width, height) * 0.48;
    const sweep = (tSec * 0.9) % (Math.PI * 2);

    ctx.strokeStyle = `rgba(${c1}, 0.16)`;
    ctx.lineWidth = 1;
    for (let r = 1; r <= 5; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (maxR * r) / 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    // Sweeping phosphor cone
    for (let s = 0; s < 14; s++) {
      const a0 = sweep - s * 0.045;
      const a1 = a0 - 0.045;
      ctx.fillStyle = `rgba(${c1}, ${((1 - s / 14) * (0.16 + bass * 0.12)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxR, a1, a0);
      ctx.closePath();
      ctx.fill();
    }

    // Glowing blips triggered as radar beam passes
    for (let i = 0; i < st.sonarBlips.length; i++) {
      const b = st.sonarBlips[i];
      const diff = Math.abs(((sweep - b.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > Math.PI - 0.14) b.alpha = 1;
      b.alpha = Math.max(0, b.alpha - dt * 0.38);
      if (b.alpha > 0.02) {
        const bx = cx + Math.cos(b.ang) * b.dist * maxR;
        const by = cy + Math.sin(b.ang) * b.dist * maxR;
        const g = ctx.createRadialGradient(bx, by, 0.5, bx, by, 10 + bass * 8);
        g.addColorStop(0, `rgba(255, 255, 255, ${b.alpha.toFixed(3)})`);
        g.addColorStop(0.4, `rgba(${pickRgb(b.rgbIdx)}, ${(b.alpha * 0.8).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, 10 + bass * 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return true;
  }

  // 15. SILK RIBBON / CALLIGRAPHIC BRUSH
  if (mode === 'silk') {
    for (let r = 0; r < 4; r++) {
      const rgb = pickRgb(r % 3);
      const baseY = height * (0.24 + r * 0.18);
      ctx.beginPath();
      for (let x = 0; x <= width; x += 18) {
        const y = baseY + Math.sin(x * 0.0045 + tSec * (0.9 + r * 0.2) + r * 1.4) * (55 + bass * 45);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let x = width; x >= 0; x -= 18) {
        const thickness = 18 + 26 * Math.abs(Math.sin(x * 0.006 - tSec * 0.7 + r));
        const y = baseY + Math.sin(x * 0.0045 + tSec * (0.9 + r * 0.2) + r * 1.4) * (55 + bass * 45) + thickness;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, baseY - 80, width, baseY + 80);
      grad.addColorStop(0, `rgba(${rgb}, 0.05)`);
      grad.addColorStop(0.5, `rgba(${rgb}, ${(0.34 + mids * 0.2).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${c3}, 0.05)`);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.2 + bass * 0.22).toFixed(3)})`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    return true;
  }

  // 16. ISOMETRIC VOXEL CUBES
  if (mode === 'voxel') {
    const gridN = width < 768 ? 6 : 8;
    const tileW = Math.min(width, height) / (gridN * 1.45);
    const tileH = tileW * 0.5;
    const ox = width * 0.5;
    const oy = height * 0.34;

    for (let gy = 0; gy < gridN; gy++) {
      for (let gx = 0; gx < gridN; gx++) {
        const ix = ox + (gx - gy) * tileW * 0.5;
        const iy = oy + (gx + gy) * tileH * 0.5;
        const bin = (gx * gridN + gy) % 48;
        const audioH = playing ? (freqBuf[bin] / 255) * 65 : 0;
        const h = 24 + (Math.sin(gx * 0.7 + tSec * 1.6) * Math.cos(gy * 0.7 - tSec * 1.3) * 0.5 + 0.5) * 48 + audioH;
        const rgb = pickRgb((gx + gy) % 3);

        // Top face
        ctx.beginPath();
        ctx.moveTo(ix, iy - h);
        ctx.lineTo(ix + tileW * 0.5, iy + tileH * 0.5 - h);
        ctx.lineTo(ix, iy + tileH - h);
        ctx.lineTo(ix - tileW * 0.5, iy + tileH * 0.5 - h);
        ctx.closePath();
        ctx.fillStyle = `rgba(${rgb}, 0.52)`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Left face
        ctx.beginPath();
        ctx.moveTo(ix - tileW * 0.5, iy + tileH * 0.5 - h);
        ctx.lineTo(ix, iy + tileH - h);
        ctx.lineTo(ix, iy + tileH);
        ctx.lineTo(ix - tileW * 0.5, iy + tileH * 0.5);
        ctx.closePath();
        ctx.fillStyle = `rgba(${rgb}, 0.28)`;
        ctx.fill();

        // Right face
        ctx.beginPath();
        ctx.moveTo(ix + tileW * 0.5, iy + tileH * 0.5 - h);
        ctx.lineTo(ix, iy + tileH - h);
        ctx.lineTo(ix, iy + tileH);
        ctx.lineTo(ix + tileW * 0.5, iy + tileH * 0.5);
        ctx.closePath();
        ctx.fillStyle = `rgba(${rgb}, 0.16)`;
        ctx.fill();
      }
    }
    return true;
  }

  // 17. ECLIPSE CORONA FLARES
  if (mode === 'corona') {
    const cx = width * 0.5;
    const cy = height * 0.48;
    const r = Math.min(width, height) * 0.17;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + tSec * 0.15;
      const archSpan = 0.35 + 0.15 * Math.sin(tSec * 1.4 + i);
      const flareH = r * (0.45 + 0.55 * Math.abs(Math.sin(tSec * 1.7 + i * 1.9)) + bass * 0.75);
      const x1 = cx + Math.cos(a) * r;
      const y1 = cy + Math.sin(a) * r;
      const x2 = cx + Math.cos(a + archSpan) * r;
      const y2 = cy + Math.sin(a + archSpan) * r;
      const cpx = cx + Math.cos(a + archSpan * 0.5) * (r + flareH);
      const cpy = cy + Math.sin(a + archSpan * 0.5) * (r + flareH);
      ctx.strokeStyle = `rgba(${pickRgb(i % 3)}, ${(0.34 + bass * 0.32).toFixed(3)})`;
      ctx.lineWidth = 3 + bass * 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cpx, cpy, x2, y2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#020205';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 245, 220, ${(0.7 + bass * 0.3).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    return true;
  }

  // 18. OP-ART HYPNOTIC SPIRAL
  if (mode === 'opart') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const maxR = Math.hypot(width, height) * 0.65;
    const arms = 10;
    for (let a = 0; a < arms; a++) {
      ctx.beginPath();
      const baseA = (a / arms) * Math.PI * 2 + tSec * 0.45;
      for (let r = 8; r < maxR; r += 10) {
        const twist = r * 0.012 + Math.sin(r * 0.015 - tSec * 1.5) * (0.35 + bass * 0.3);
        const x = cx + Math.cos(baseA + twist) * r;
        const y = cy + Math.sin(baseA + twist) * r;
        if (r === 8) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${a % 2 === 0 ? c1 : c2}, ${(0.32 + mids * 0.25).toFixed(3)})`;
      ctx.lineWidth = 10 + bass * 6;
      ctx.stroke();
    }
    return true;
  }

  // 19. LIQUID MERCURY DROPS
  if (mode === 'mercury') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    for (let i = 0; i < st.mercuryDrops.length; i++) {
      const m = st.mercuryDrops[i];
      // Gentle surface-tension attraction toward center + orbit
      m.vx += (cx - m.x) * 0.00018 * step;
      m.vy += (cy - m.y) * 0.00018 * step;
      m.x += m.vx * (1 + bass * 0.8) * step;
      m.y += m.vy * (1 + bass * 0.8) * step;
      const rad = m.r * (1 + bass * 0.16);
      const g = ctx.createRadialGradient(m.x - rad * 0.32, m.y - rad * 0.32, rad * 0.06, m.x, m.y, rad);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
      g.addColorStop(0.28, `rgba(210, 222, 238, 0.65)`);
      g.addColorStop(0.68, `rgba(${c1}, 0.28)`);
      g.addColorStop(0.92, 'rgba(30, 36, 48, 0.72)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }

  // 20. DNA DOUBLE HELIX
  if (mode === 'dna') {
    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.rotate(-0.42);
    const span = Math.hypot(width, height) * 0.62;
    const rungs = 28;
    const amp = Math.min(width, height) * (0.12 + bass * 0.04);
    for (let i = 0; i < rungs; i++) {
      const u = (i / (rungs - 1)) * 2 - 1;
      const x = u * span;
      const ph = u * 5.2 + tSec * 1.4;
      const y1 = Math.sin(ph) * amp;
      const y2 = Math.sin(ph + Math.PI) * amp;
      const depth = Math.cos(ph);

      ctx.strokeStyle = `rgba(${c3}, ${(0.18 + Math.abs(depth) * 0.26).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
      ctx.stroke();

      const r1 = 4 + (depth * 0.5 + 0.5) * 4.5 + bass * 2;
      const r2 = 4 + (-depth * 0.5 + 0.5) * 4.5 + bass * 2;
      ctx.fillStyle = `rgba(${c1}, 0.85)`;
      ctx.beginPath();
      ctx.arc(x, y1, r1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${c2}, 0.85)`;
      ctx.beginPath();
      ctx.arc(x, y2, r2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return true;
  }

  // 21. PAPER CUTOUT / SHADOWBOX
  if (mode === 'shadowbox') {
    const layers = 5;
    for (let l = 0; l < layers; l++) {
      const f = l / (layers - 1);
      const baseY = height * (0.28 + f * 0.56);
      const rgb = pickRgb(l % 3);
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 28) {
        const y =
          baseY +
          Math.sin(x * (0.004 + f * 0.003) + tSec * (0.3 + f * 0.35) + l * 2) * (32 + bass * 24) +
          Math.cos(x * 0.009 - l) * 14;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.shadowColor = `rgba(${rgb}, 0.55)`;
      ctx.shadowBlur = 24;
      ctx.fillStyle = `rgba(${Math.floor(10 + f * 12)}, ${Math.floor(12 + f * 12)}, ${Math.floor(20 + f * 14)}, 0.88)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb}, ${(0.35 + bass * 0.3).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    return true;
  }

  // 22. FRACTAL JULIA SET
  if (mode === 'julia' && offCtx && offImg) {
    const data = offImg.data;
    const ow = offCanvas.width;
    const oh = offCanvas.height;
    const cr = -0.74 + Math.cos(tSec * 0.32) * 0.14;
    const ci = 0.18 + Math.sin(tSec * 0.27) * 0.14;
    const zoom = 1.45 - bass * 0.16;
    const maxIter = 20;
    for (let y = 0; y < oh; y++) {
      const zy0 = ((y / oh) * 2 - 1) * zoom;
      for (let x = 0; x < ow; x++) {
        let zx = ((x / ow) * 2 - 1) * zoom * (ow / oh);
        let zy = zy0;
        let it = 0;
        while (zx * zx + zy * zy < 4 && it < maxIter) {
          const xt = zx * zx - zy * zy + cr;
          zy = 2 * zx * zy + ci;
          zx = xt;
          it++;
        }
        const f = it === maxIter ? 0 : it / maxIter;
        const p = (y * ow + x) * 4;
        data[p] = Math.min(255, c1T[0] * f * 1.15 + c2T[0] * f * f * 0.7);
        data[p + 1] = Math.min(255, c1T[1] * f * 1.15 + c2T[1] * f * f * 0.7);
        data[p + 2] = Math.min(255, c1T[2] * f * 1.15 + c2T[2] * f * f * 0.7);
        data[p + 3] = 230;
      }
    }
    offCtx.putImageData(offImg, 0, 0);
    ctx.drawImage(offCanvas, 0, 0, width, height);
    return true;
  }

  // 23. ANAMORPHIC GLASS CYLINDERS
  if (mode === 'fluted') {
    const ribs = width < 768 ? 18 : 32;
    const rw = width / ribs;
    for (let i = 0; i < ribs; i++) {
      const x = i * rw;
      const wave = 0.5 + 0.5 * Math.sin(i * 0.38 + tSec * 0.9);
      const rgb = pickRgb(i % 3);
      const g = ctx.createLinearGradient(x, 0, x + rw, 0);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
      g.addColorStop(0.28, `rgba(${rgb}, ${(0.12 + wave * (0.28 + bass * 0.2)).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255, 255, 255, ${(0.08 + wave * 0.16).toFixed(3)})`);
      g.addColorStop(0.75, `rgba(${c2}, ${(0.1 + (1 - wave) * 0.22).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, rw + 0.5, height);
    }
    return true;
  }

  // 24. BOIDS MURMURATION
  if (mode === 'boids') {
    const targetX = width * (0.5 + Math.cos(tSec * 0.45) * 0.34);
    const targetY = height * (0.5 + Math.sin(tSec * 0.62) * 0.28);
    for (let i = 0; i < st.boids.length; i++) {
      const b = st.boids[i];
      const dx = targetX - b.x;
      const dy = targetY - b.y;
      b.vx += dx * 0.00045 * step + Math.sin(tSec + i) * 0.04 * step;
      b.vy += dy * 0.00045 * step + Math.cos(tSec + i) * 0.04 * step;
      const mag = Math.hypot(b.vx, b.vy) || 1;
      const maxSpd = 2.6 + bass * 2.4;
      b.vx = (b.vx / mag) * maxSpd;
      b.vy = (b.vy / mag) * maxSpd;
      b.x += b.vx * step;
      b.y += b.vy * step;
      if (b.x < -20) b.x = width + 20;
      if (b.x > width + 20) b.x = -20;
      if (b.y < -20) b.y = height + 20;
      if (b.y > height + 20) b.y = -20;

      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      ctx.fillStyle = `rgba(${pickRgb(b.rgbIdx)}, 0.75)`;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, 4);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-5, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    return true;
  }

  // 25. DITHERED 1-BIT / GAME BOY
  if (mode === 'dither' && offCtx && offImg) {
    const data = offImg.data;
    const ow = offCanvas.width;
    const oh = offCanvas.height;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const wave =
          0.5 +
          0.32 * Math.sin(x * 0.14 + tSec * 1.1 + Math.cos(y * 0.12 - tSec * 0.7)) +
          0.18 * Math.cos((x + y) * 0.1 - tSec * 0.9) +
          bass * 0.16;
        const thresh = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        const on = wave > thresh;
        const p = (y * ow + x) * 4;
        data[p] = on ? c1T[0] : 8;
        data[p + 1] = on ? c1T[1] : 14;
        data[p + 2] = on ? c1T[2] : 10;
        data[p + 3] = 225;
      }
    }
    offCtx.putImageData(offImg, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offCanvas, 0, 0, width, height);
    ctx.restore();
    return true;
  }

  // 26. TESLA PLASMA GLOBE
  if (mode === 'tesla') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const arcs = width < 768 ? 7 : 11;
    const maxR = Math.hypot(width, height) * 0.54;
    for (let i = 0; i < arcs; i++) {
      const a = (i / arcs) * Math.PI * 2 + Math.sin(tSec * 0.9 + i * 2.1) * 0.35;
      const rgb = pickRgb(i % 3);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let s = 1; s <= 12; s++) {
        const frac = s / 12;
        const jitter = (Math.sin(tSec * 14 + s * 4.7 + i * 3.1) * 28) * (1 - Math.abs(frac - 0.5)) * (1 + bass);
        const px = cx + Math.cos(a) * maxR * frac - Math.sin(a) * jitter;
        const py = cy + Math.sin(a) * maxR * frac + Math.cos(a) * jitter;
        ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(${rgb}, ${(0.28 + bass * 0.25).toFixed(3)})`;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(250, 253, 255, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, 48 + bass * 24);
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.4, `rgba(${c1}, 0.7)`);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, 48 + bass * 24, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  // 27. KINETIC TYPOGRAPHY / LYRIC MATRIX
  if (mode === 'kinetictype') {
    const label = `${(songTitle || 'LIQUID AUDIO').toUpperCase()}  •  ${(songArtist || 'NOW PLAYING').toUpperCase()}  •  `;
    const rows = 5;
    const fontSize = Math.max(44, Math.floor(height / 5.5));
    ctx.font = `200 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    ctx.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) {
      const y = ((r + 0.5) / rows) * height;
      const dir = r % 2 === 0 ? 1 : -1;
      const offset = ((tSec * (32 + r * 8 + bass * 25) * dir) % (width + 400));
      const rgb = pickRgb(r % 3);
      ctx.strokeStyle = `rgba(${rgb}, ${(0.18 + bass * 0.16).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.strokeText(label + label, offset - 400, y);
    }
    return true;
  }

  // 28. GYROSCOPE / ASTROLABE RINGS
  if (mode === 'astrolabe') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const baseR = Math.min(width, height) * 0.36;
    for (let i = 0; i < 5; i++) {
      const r = baseR * (0.45 + i * 0.15);
      const tilt = Math.cos(tSec * (0.45 + i * 0.14) + i);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tSec * (0.2 + i * 0.09) * (i % 2 === 0 ? 1 : -1));
      ctx.strokeStyle = `rgba(${pickRgb(i % 3)}, ${(0.34 + bass * 0.3).toFixed(3)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, Math.max(8, Math.abs(tilt) * r), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return true;
  }

  // 29. RAYMARCHED METASHAPES
  if (mode === 'metashapes') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const s = Math.min(width, height) * (0.18 + bass * 0.05);
    const rot = tSec * 0.45;
    const shapes = [
      { ox: Math.cos(rot) * s * 0.65, oy: Math.sin(rot * 1.2) * s * 0.45, sides: 4, rgb: c1 },
      { ox: Math.cos(rot + 2.1) * s * 0.65, oy: Math.sin(rot * 1.2 + 2.1) * s * 0.45, sides: 3, rgb: c2 },
      { ox: Math.cos(rot + 4.2) * s * 0.65, oy: Math.sin(rot * 1.2 + 4.2) * s * 0.45, sides: 6, rgb: c3 },
    ];
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i];
      ctx.save();
      ctx.translate(cx + sh.ox, cy + sh.oy);
      ctx.rotate(rot * (i % 2 === 0 ? 1 : -1.2));
      ctx.beginPath();
      for (let k = 0; k < sh.sides; k++) {
        const a = (k / sh.sides) * Math.PI * 2;
        const px = Math.cos(a) * s * 0.65;
        const py = Math.sin(a) * s * 0.65;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${sh.rgb}, ${(0.24 + bass * 0.16).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }
    return true;
  }

  // 30. KINTSUGI GOLD CRACKS
  if (mode === 'kintsugi') {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < st.kintsugiCracks.length; i++) {
      const cr = st.kintsugiCracks[i];
      const pulse = 0.55 + 0.45 * Math.sin(tSec * 1.8 + cr.phase) + bass * 0.45;
      ctx.beginPath();
      ctx.moveTo(cr.pts[0].x, cr.pts[0].y);
      for (let k = 1; k < cr.pts.length; k++) ctx.lineTo(cr.pts[k].x, cr.pts[k].y);
      ctx.strokeStyle = `rgba(245, 198, 84, ${(0.24 * pulse).toFixed(3)})`;
      ctx.lineWidth = cr.width * 4.2;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 224, 130, ${Math.min(1, 0.72 * pulse).toFixed(3)})`;
      ctx.lineWidth = cr.width;
      ctx.stroke();
    }
    return true;
  }

  // 31. BIFURCATION / STRANGE ATTRACTOR (Lorenz)
  if (mode === 'attractor') {
    const dtL = 0.008 * Math.max(0.4, step);
    for (let k = 0; k < 2; k++) {
      const dx = 10 * (st.ay - st.ax);
      const dy = st.ax * (28 - st.az) - st.ay;
      const dz = st.ax * st.ay - (8 / 3) * st.az;
      st.ax += dx * dtL;
      st.ay += dy * dtL;
      st.az += dz * dtL;
      st.attractorPts.push({ x: st.ax, y: st.ay, z: st.az });
      if (st.attractorPts.length > 420) st.attractorPts.shift();
    }
    const cx = width * 0.5;
    const cy = height * 0.54;
    const scale = Math.min(width, height) * 0.017;
    const cosY = Math.cos(tSec * 0.28);
    const sinY = Math.sin(tSec * 0.28);
    ctx.beginPath();
    for (let i = 0; i < st.attractorPts.length; i++) {
      const p = st.attractorPts[i];
      const rx = p.x * cosY - (p.z - 25) * sinY;
      const ry = p.y;
      const sx = cx + rx * scale;
      const sy = cy - ry * scale;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = `rgba(${c1}, ${(0.45 + bass * 0.35).toFixed(3)})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    return true;
  }

  // 32. LOUVRE / VENETIAN BLINDS
  if (mode === 'blinds') {
    const slats = width < 768 ? 14 : 20;
    const slatH = height / slats;
    for (let i = 0; i < slats; i++) {
      const open = 0.5 + 0.5 * Math.sin(tSec * 1.1 + i * 0.32);
      const bandH = slatH * (0.15 + open * (0.62 + bass * 0.2));
      const y = i * slatH + (slatH - bandH) * 0.5;
      const rgb = pickRgb(i % 3);
      const g = ctx.createLinearGradient(0, y, width, y);
      g.addColorStop(0, `rgba(${rgb}, 0.08)`);
      g.addColorStop(0.5, `rgba(${rgb}, ${(0.24 + open * 0.28).toFixed(3)})`);
      g.addColorStop(1, `rgba(${c2}, 0.08)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, y, width, bandH);
    }
    return true;
  }

  // 33. SUBWAY / TRANSIT MAP
  if (mode === 'transit') {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < st.transitLines.length; i++) {
      const ln = st.transitLines[i];
      const rgb = pickRgb(ln.rgbIdx);
      ln.trainT = (ln.trainT + ln.speed * dt * (1 + bass)) % 1;
      ctx.beginPath();
      ctx.moveTo(ln.pts[0].x, ln.pts[0].y);
      for (let k = 1; k < ln.pts.length; k++) ctx.lineTo(ln.pts[k].x, ln.pts[k].y);
      ctx.strokeStyle = `rgba(${rgb}, 0.32)`;
      ctx.lineWidth = 3.2;
      ctx.stroke();

      // Station circles
      for (let k = 0; k < ln.pts.length; k++) {
        ctx.fillStyle = '#080b14';
        ctx.strokeStyle = `rgba(${rgb}, 0.72)`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ln.pts[k].x, ln.pts[k].y, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Glowing train node
      const segs = ln.pts.length - 1;
      const ex = ln.trainT * segs;
      const idx = Math.min(segs - 1, Math.floor(ex));
      const f = ex - idx;
      const tx = ln.pts[idx].x + (ln.pts[idx + 1].x - ln.pts[idx].x) * f;
      const ty = ln.pts[idx].y + (ln.pts[idx + 1].y - ln.pts[idx].y) * f;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tx, ty, 5 + bass * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }

  // 34. CRYSTALLINE GEODE
  if (mode === 'geode') {
    const crystals = 18;
    for (let i = 0; i < crystals; i++) {
      const a = (i / crystals) * Math.PI * 2;
      const ex = width * 0.5 + Math.cos(a) * (width * 0.58);
      const ey = height * 0.5 + Math.sin(a) * (height * 0.58);
      const len = Math.min(width, height) * (0.2 + (i % 3) * 0.06 + bass * 0.08);
      const tx = ex - Math.cos(a) * len;
      const ty = ey - Math.sin(a) * len;
      const perpX = -Math.sin(a) * (24 + (i % 4) * 10);
      const perpY = Math.cos(a) * (24 + (i % 4) * 10);
      const rgb = pickRgb(i % 3);
      ctx.beginPath();
      ctx.moveTo(ex + perpX, ey + perpY);
      ctx.lineTo(tx, ty);
      ctx.lineTo(ex - perpX, ey - perpY);
      ctx.closePath();
      ctx.fillStyle = `rgba(${rgb}, ${(0.22 + mids * 0.22).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.25 + bass * 0.25).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    return true;
  }

  // 35. PENDULUM SAND TRACE (HARMONOGRAPH)
  if (mode === 'harmonograph') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const scale = Math.min(width, height) * 0.38;
    const p1 = tSec * 0.25;
    ctx.beginPath();
    for (let i = 0; i < 420; i++) {
      const u = i * 0.045;
      const damp = Math.exp(-u * 0.035);
      const x = cx + (Math.sin(u * 2.01 + p1) + Math.sin(u * 3.0 - p1 * 0.6)) * 0.5 * scale * damp;
      const y = cy + (Math.sin(u * 3.02 + p1 * 0.8) + Math.cos(u * 2.0 + p1)) * 0.5 * scale * damp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${c1}, ${(0.42 + bass * 0.35).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    return true;
  }

  // 36. LIQUID CHROME MESH
  if (mode === 'chromemesh') {
    const cols = width < 768 ? 14 : 22;
    const rows = width < 768 ? 10 : 14;
    const cw = width / cols;
    const ch = height / rows;
    ctx.lineWidth = 1.1;
    for (let gy = 0; gy <= rows; gy++) {
      ctx.beginPath();
      for (let gx = 0; gx <= cols; gx++) {
        const px = gx * cw;
        const py = gy * ch + Math.sin(gx * 0.45 + tSec * 1.2 + gy * 0.3) * (18 + bass * 24);
        if (gx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(${gy % 2 === 0 ? c1 : '220, 232, 248'}, ${(0.22 + mids * 0.2).toFixed(3)})`;
      ctx.stroke();
    }
    for (let gx = 0; gx <= cols; gx++) {
      ctx.beginPath();
      for (let gy = 0; gy <= rows; gy++) {
        const px = gx * cw;
        const py = gy * ch + Math.sin(gx * 0.45 + tSec * 1.2 + gy * 0.3) * (18 + bass * 24);
        if (gy === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = `rgba(${c2}, ${(0.16 + bass * 0.16).toFixed(3)})`;
      ctx.stroke();
    }
    return true;
  }

  // 37. SPIROGRAPH GEARWORK
  if (mode === 'spirograph') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const R = Math.min(width, height) * 0.34;
    const r = R * 0.31;
    const d = R * (0.24 + bass * 0.08);
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) {
      const a = (i / 360) * Math.PI * 10 + tSec * 0.35;
      const x = cx + (R - r) * Math.cos(a) + d * Math.cos(((R - r) / r) * a);
      const y = cy + (R - r) * Math.sin(a) - d * Math.sin(((R - r) / r) * a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${c1}, ${(0.42 + bass * 0.3).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${c2}, 0.16)`;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    return true;
  }

  // 38. DOT-MATRIX FLIP DISCS
  if (mode === 'flipdisc') {
    const gap = width < 768 ? 28 : 34;
    const cols = Math.ceil(width / gap);
    const rows = Math.ceil(height / gap);
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cx = gx * gap + gap * 0.5;
        const cy = gy * gap + gap * 0.5;
        const flip = Math.cos(gx * 0.28 - tSec * 1.8 + gy * 0.18);
        const absF = Math.abs(flip);
        ctx.fillStyle = flip > 0 ? `rgba(${c1}, ${(0.28 + bass * 0.35).toFixed(3)})` : 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, gap * 0.36, Math.max(1.5, gap * 0.36 * absF), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return true;
  }

  // 39. OPTICAL FIBER BUNDLE
  if (mode === 'fiber') {
    const strands = width < 768 ? 36 : 64;
    const baseX = width * 0.5;
    const baseY = height * 1.05;
    for (let i = 0; i < strands; i++) {
      const spread = (i / (strands - 1) - 0.5) * 2;
      const sway = Math.sin(tSec * 0.8 + i * 0.4) * (28 + bass * 26);
      const tx = width * 0.5 + spread * width * 0.48 + sway;
      const ty = height * (0.14 + Math.abs(spread) * 0.32) + Math.cos(tSec * 0.7 + i) * 18;
      const rgb = pickRgb(i % 3);
      ctx.strokeStyle = `rgba(${rgb}, 0.16)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(baseX + spread * width * 0.2, height * 0.55, tx, ty);
      ctx.stroke();

      const glow = 3.5 + bass * 4;
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.55 + bass * 0.4).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(tx, ty, glow * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }

  // 40. ARCHITECTURAL BRUTALISM / SHADOW CAST
  if (mode === 'brutalism') {
    const sunShift = Math.sin(tSec * 0.25) * width * 0.2;
    const blocks = 6;
    for (let i = 0; i < blocks; i++) {
      const bx = (i / blocks) * width + 18;
      const bw = width / blocks - 36;
      const bh = height * (0.28 + ((i * 37) % 45) / 100);
      const by = height - bh;

      // Sweeping directional sunlight shaft
      const g = ctx.createLinearGradient(bx + sunShift, 0, bx + bw, height);
      g.addColorStop(0, `rgba(${c1}, ${(0.18 + bass * 0.12).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(bx + sunShift, 0);
      ctx.lineTo(bx + bw * 0.6 + sunShift, 0);
      ctx.lineTo(bx + bw, height);
      ctx.lineTo(bx, height);
      ctx.closePath();
      ctx.fill();

      // Monolithic concrete block
      ctx.fillStyle = 'rgba(18, 20, 26, 0.85)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = `rgba(${c2}, 0.22)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
    }
    return true;
  }

  // 41. SOUND-REACTIVE SEISMOGRAPH
  if (mode === 'seismograph') {
    const rows = st.seismoHistory.length;
    for (let r = 0; r < rows; r++) {
      const arr = st.seismoHistory[r];
      const bin = Math.min(63, r * 6 + 2);
      const amp = playing ? (freqBuf[bin] / 255) * (24 + bass * 38) : 3;
      const sample = Math.sin(tSec * (8 + r * 2)) * amp;
      arr.push(sample);
      if (arr.length > 72) arr.shift();

      const yBase = ((r + 0.5) / rows) * height;
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = (i / (arr.length - 1)) * width;
        const y = yBase + arr[i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${pickRgb(r % 3)}, ${(0.35 + bass * 0.35).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    return true;
  }

  // 42. POLAROID / FILM STRIP FRAMES
  if (mode === 'filmstrip') {
    const frameH = 170;
    const scroll = (tSec * (40 + energy * 35)) % frameH;
    const stripW = Math.min(280, width * 0.42);
    const sx = (width - stripW) * 0.5;
    ctx.strokeStyle = `rgba(${c1}, 0.22)`;
    ctx.lineWidth = 1.5;
    for (let y = -frameH + scroll; y < height + frameH; y += frameH) {
      ctx.fillStyle = `rgba(${c2}, ${(0.06 + mids * 0.05).toFixed(3)})`;
      ctx.fillRect(sx + 24, y + 14, stripW - 48, frameH - 28);
      ctx.strokeRect(sx + 24, y + 14, stripW - 48, frameH - 28);
      // Sprocket holes
      ctx.fillStyle = `rgba(${c1}, 0.25)`;
      for (let h = 16; h < frameH - 12; h += 26) {
        ctx.fillRect(sx + 6, y + h, 10, 14);
        ctx.fillRect(sx + stripW - 16, y + h, 10, 14);
      }
    }
    return true;
  }

  // 43. X-RAY / BLUEPRINT SCHEMATIC
  if (mode === 'blueprint') {
    const grid = 40;
    ctx.strokeStyle = 'rgba(110, 215, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    const cx = width * 0.5;
    const cy = height * 0.5;
    const r = Math.min(width, height) * (0.28 + bass * 0.05);
    ctx.strokeStyle = 'rgba(215, 245, 255, 0.42)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, tSec * 0.3, tSec * 0.3 + Math.PI * 1.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.65, -tSec * 0.4, -tSec * 0.4 + Math.PI * 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.25, cy);
    ctx.lineTo(cx + r * 1.25, cy);
    ctx.moveTo(cx, cy - r * 1.25);
    ctx.lineTo(cx, cy + r * 1.25);
    ctx.stroke();
    return true;
  }

  // 44. SOAP FILM INTERFERENCE
  if (mode === 'soapfilm' && offCtx && offImg) {
    const data = offImg.data;
    const ow = offCanvas.width;
    const oh = offCanvas.height;
    const t = tSec * 0.55;
    for (let y = 0; y < oh; y++) {
      const ny = (y / oh) * 4.0;
      for (let x = 0; x < ow; x++) {
        const nx = (x / ow) * 5.2;
        const f = Math.sin(nx + Math.sin(ny + t)) + Math.cos(ny * 1.2 - Math.cos(nx - t * 0.7));
        const edge = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(f * 2.2)) * 1.4), 2.5);
        const ph = f * 3.5 + t + bass * 1.5;
        const p = (y * ow + x) * 4;
        data[p] = Math.min(255, (128 + 127 * Math.cos(ph)) * edge + 6);
        data[p + 1] = Math.min(255, (128 + 127 * Math.cos(ph + 2.09)) * edge + 7);
        data[p + 2] = Math.min(255, (128 + 127 * Math.cos(ph + 4.18)) * edge + 11);
        data[p + 3] = 230;
      }
    }
    offCtx.putImageData(offImg, 0, 0);
    ctx.drawImage(offCanvas, 0, 0, width, height);
    return true;
  }

  // 45. MAGNETIC FIELD LINES
  if (mode === 'magfield') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const loops = 10;
    ctx.setLineDash([12, 10]);
    ctx.lineDashOffset = -tSec * (45 + bass * 60);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 1; i <= loops; i++) {
        const rx = (i / loops) * width * 0.42;
        const ry = (i / loops) * height * 0.44;
        ctx.strokeStyle = `rgba(${i % 2 === 0 ? c1 : c2}, ${(0.24 + mids * 0.22).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(cx + side * rx * 0.55, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    return true;
  }

  // 46. TERRACED RICE FIELDS / STEP PYRAMID
  if (mode === 'terraces') {
    const cx = width * 0.5;
    const cy = height * 0.52;
    const steps = 9;
    const maxR = Math.hypot(width, height) * 0.55;
    for (let i = steps; i >= 1; i--) {
      const f = i / steps;
      const r = f * maxR * (1 + bass * 0.06);
      const ox = Math.sin(tSec * 0.4 + i * 0.4) * 16;
      const oy = Math.cos(tSec * 0.35 + i * 0.4) * 10;
      const rgb = pickRgb(i % 3);
      ctx.beginPath();
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const wobble = Math.sin(a * 3 + i) * 14;
        const px = cx + ox + Math.cos(a) * (r + wobble);
        const py = cy + oy + Math.sin(a) * (r * 0.62 + wobble);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${rgb}, ${(0.08 + (1 - f) * 0.22).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb}, ${(0.35 + bass * 0.25).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    return true;
  }

  // 47. KALEIDOSCOPIC TUNNEL / WORMHOLE
  if (mode === 'wormhole') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const maxR = Math.hypot(width, height) * 0.65;
    const rings = 14;
    const travel = (tSec * (0.6 + energy * 0.45)) % 1;
    for (let i = rings - 1; i >= 0; i--) {
      const z = (i + travel) / rings;
      const r = Math.pow(z, 2.1) * maxR;
      const rot = tSec * 0.25 + i * 0.22 * (i % 2 === 0 ? 1 : -1);
      ctx.beginPath();
      for (let s = 0; s <= 6; s++) {
        const a = (s / 6) * Math.PI * 2 + rot;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${pickRgb(i % 3)}, ${(0.06 + z * 0.14).toFixed(3)})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${pickRgb((i + 1) % 3)}, ${(0.25 + z * 0.45).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    return true;
  }

  // 48. LASER LIDAR POINT CLOUD
  if (mode === 'lidar') {
    const cols = width < 768 ? 28 : 44;
    const rows = width < 768 ? 18 : 26;
    for (let gy = 0; gy < rows; gy++) {
      const z = (gy + 1) / rows;
      const pyBase = height * (0.25 + Math.pow(z, 1.4) * 0.72);
      for (let gx = 0; gx < cols; gx++) {
        const u = (gx / (cols - 1) - 0.5) * 2;
        const px = width * 0.5 + u * width * (0.35 + z * 0.42);
        const elev = Math.sin(gx * 0.35 + tSec * 1.1) * Math.cos(gy * 0.4 - tSec * 0.9) * (24 + bass * 35) * z;
        const py = pyBase - elev;
        const rgb = elev > 10 ? c3 : elev > -6 ? c1 : c2;
        ctx.fillStyle = `rgba(${rgb}, ${(0.25 + z * 0.65).toFixed(3)})`;
        ctx.fillRect(px, py, 1.8 + z * 1.5, 1.8 + z * 1.5);
      }
    }
    return true;
  }

  // 49. RORSCHACH INKBLOT
  if (mode === 'rorschach') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const blobs = 10;
    for (let i = 0; i < blobs; i++) {
      const ox = (0.04 + Math.abs(Math.sin(tSec * 0.4 + i * 1.3)) * 0.24) * width;
      const oy = Math.sin(tSec * 0.35 + i * 2.1) * height * 0.3;
      const r = Math.min(width, height) * (0.07 + (i % 3) * 0.04 + bass * 0.04);
      const rgb = pickRgb(i % 3);
      for (let side = -1; side <= 1; side += 2) {
        const bx = cx + side * ox;
        const by = cy + oy;
        const g = ctx.createRadialGradient(bx, by, r * 0.1, bx, by, r);
        g.addColorStop(0, `rgba(${rgb}, 0.52)`);
        g.addColorStop(0.7, `rgba(${rgb}, 0.18)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return true;
  }

  // 50. NEON TUBE BENDING
  if (mode === 'neontube') {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const r = Math.min(width, height) * 0.28;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let t = 0; t < 2; t++) {
      const rgb = t === 0 ? c1 : c2;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const a = (i / 60) * Math.PI * 2 + tSec * (t === 0 ? 0.3 : -0.25);
        const rad = r * (0.75 + 0.25 * Math.sin(a * 3 + tSec + t));
        const x = cx + Math.cos(a) * rad * 1.25;
        const y = cy + Math.sin(a) * rad * 0.85;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(${rgb}, ${(0.22 + bass * 0.22).toFixed(3)})`;
      ctx.lineWidth = 18;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb}, 0.85)`;
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    return true;
  }

  // 51. PRISM DIFFRACTION GRATING
  if (mode === 'diffraction') {
    const fx = width * 0.5;
    const fy = height * 0.46;
    const len = Math.hypot(width, height) * 0.85;
    const bands = ['255, 50, 90', '255, 165, 40', '240, 245, 70', '45, 245, 155', '40, 200, 255', '160, 85, 255'];
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < bands.length; i++) {
        const ang = (side === 1 ? -0.45 : Math.PI - 0.45) + (i - 2.5) * 0.085 + Math.sin(tSec * 0.4) * 0.1;
        const g = ctx.createLinearGradient(fx, fy, fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
        g.addColorStop(0, `rgba(${bands[i]}, ${(0.28 + bass * 0.2).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${bands[i]}, ${(0.1 + mids * 0.08).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 16 + bass * 10;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(ang) * len, fy + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
    ctx.restore();
    return true;
  }

  return false;
}
