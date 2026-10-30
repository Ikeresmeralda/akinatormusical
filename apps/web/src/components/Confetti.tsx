import { useEffect, useRef } from 'react';

/** Confeti en canvas para la pantalla de victoria (sin dependencias). */
export function Confetti({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!active || !canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const colors = ['#8b5cf6', '#ec4899', '#22d3ee', '#fbbf24', '#22c55e', '#f5f3ff'];
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.6,
      w: (6 + Math.random() * 6) * dpr,
      h: (8 + Math.random() * 10) * dpr,
      vx: (Math.random() - 0.5) * 2.4 * dpr,
      vy: (2 + Math.random() * 3.2) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx + Math.sin((frame + p.y) / 30) * 0.6 * dpr;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - frame / 320);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (frame < 320) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
