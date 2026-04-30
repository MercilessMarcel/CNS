import { useEffect, useRef } from 'react';

const GLYPHS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*+/-=<>{}[]';

interface MatrixRainProps {
  fontSize?: number;
  intervalMs?: number;
  trailFade?: number;
  resetChance?: number;
  glyphColor?: string;
  burstColor?: string;
  burstEvent?: string;
  burstDurationMs?: number;
  burstIntervalMs?: number;
}

export function MatrixRain({
  fontSize = 11,
  intervalMs = 35,
  trailFade = 0.04,
  resetChance = 0.975,
  glyphColor = 'rgba(168, 200, 190, 0.85)',
  burstColor = 'rgba(216, 239, 230, 0.96)',
  burstEvent = 'cns-matrix-burst',
  burstDurationMs = 2400,
  burstIntervalMs = 22,
}: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let drops: number[] = [];
    let cssW = 0;
    let cssH = 0;
    let burstUntil = 0;

    const resize = () => {
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(cssW / fontSize);
      drops = new Array(cols);
      for (let i = 0; i < cols; i += 1) {
        drops[i] = Math.floor(Math.random() * (cssH / fontSize));
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cssW, cssH);
    };

    const startBurst = () => {
      burstUntil = performance.now() + burstDurationMs;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cssW, cssH);
      for (let i = 0; i < drops.length; i += 1) {
        drops[i] = -Math.floor(Math.random() * 8);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener(burstEvent, startBurst);

    let last = 0;
    let raf = 0;

    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick);
      const isBurst = now < burstUntil;
      const interval = isBurst ? burstIntervalMs : intervalMs;
      if (now - last < interval) return;
      last = now;

      const fade = isBurst ? 0.045 : trailFade;
      ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.font = `${fontSize}px "JetBrains Mono", "Courier New", monospace`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = isBurst ? burstColor : glyphColor;

      for (let i = 0; i < drops.length; i += 1) {
        const ch = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        ctx.fillText(ch, x, y);

        if (y > cssH && Math.random() > resetChance) {
          drops[i] = 0;
        } else {
          drops[i] += 1;
        }
      }
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener(burstEvent, startBurst);
    };
  }, [
    fontSize,
    intervalMs,
    trailFade,
    resetChance,
    glyphColor,
    burstColor,
    burstEvent,
    burstDurationMs,
    burstIntervalMs,
  ]);

  return <canvas ref={canvasRef} className="matrix-canvas" aria-hidden="true" />;
}
