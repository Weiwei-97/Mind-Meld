import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  fade: number;
};

export type ParticlesHandle = {
  burst: (x: number, y: number, color: string, count?: number, opts?: Partial<{ speed: number; size: number; life: number }>) => void;
  ring: (x: number, y: number, color: string) => void;
  clear: () => void;
};

export const Particles = forwardRef<ParticlesHandle, { className?: string }>(function Particles(
  { className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const dprRef = useRef(1);

  useImperativeHandle(ref, () => ({
    burst(x, y, color, count = 24, opts) {
      const speed = opts?.speed ?? 4;
      const size = opts?.size ?? 3;
      const life = opts?.life ?? 60;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 1.2);
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life,
          maxLife: life,
          size: size * (0.5 + Math.random() * 1.2),
          color,
          gravity: 0.08,
          fade: 1,
        });
      }
    },
    ring(x, y, color) {
      const count = 32;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const s = 5;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life: 40,
          maxLife: 40,
          size: 2.5,
          color,
          gravity: 0,
          fade: 1,
        });
      }
    },
    clear() {
      particlesRef.current = [];
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function tick() {
      if (!ctx || !canvas) return;
      const dpr = dprRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      const parts = particlesRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vx *= 0.98;
        p.vy = p.vy * 0.98 + p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        const alpha = Math.max(0, p.life / p.maxLife) * p.fade;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        const size = p.size * (0.5 + (p.life / p.maxLife) * 0.5) * dpr;
        ctx.beginPath();
        ctx.arc(p.x * dpr, p.y * dpr, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
});
