import { useEffect, useRef } from 'react';
import candle from '../public/assets/home-candle.json';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);
type PointerSample = { x: number; y: number; time: number };

/** The canvas shares the image's cover/right-top fit and its enclosing edge mask. */
export function HomeScene({ paused }: { paused: boolean }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = sceneRef.current!;
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d');
    if (!context) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const plate = new Image();
    const flame = new Image();
    let disposed = false;
    let ready = false;
    let frame = 0;
    let lastFrame = 0;
    let elapsed = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let fit = 1;
    let offsetX = 0;
    let bounds = scene.getBoundingClientRect();
    let pointer: PointerSample | null = null;
    let windX = 0;
    let windY = 0;
    let bend = 0;
    let bendVelocity = 0;
    let stretch = 1;
    let stretchVelocity = 0;

    const clear = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
    const resetAir = () => {
      pointer = null;
      windX = windY = bend = bendVelocity = stretchVelocity = 0;
      stretch = 1;
    };
    const resize = () => {
      bounds = scene.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      fit = Math.max(width / candle.size.width, height / candle.size.height);
      offsetX = width - candle.size.width * fit;
      resetAir();
    };

    const paint = () => {
      clear();
      context.setTransform(pixelRatio * fit, 0, 0, pixelRatio * fit, pixelRatio * offsetX, 0);
      if (!ready) return;
      const repair = candle.repair;
      context.drawImage(plate, repair.x, repair.y, repair.width, repair.height,
        repair.x, repair.y, repair.width, repair.height);

      const phase = elapsed;
      const flicker = 0.5 + 0.3 * Math.sin(phase * 7.7) + 0.2 * Math.sin(phase * 12.9 + 1.3);
      const intensity = clamp(Math.abs(bend) * 0.65 + Math.abs(stretch - 1), 0, 1);
      const flameHeight = candle.anchor.y - candle.flame.y;
      const glowX = candle.anchor.x + bend * flameHeight * 0.35;
      const glowY = candle.anchor.y - flameHeight * stretch * 0.4;
      const radius = 67 + 8 * flicker + 14 * intensity;
      const glow = context.createRadialGradient(glowX, glowY, 2, glowX, glowY, radius);
      const light = 0.07 + 0.025 * flicker + 0.045 * intensity;
      glow.addColorStop(0, `rgba(255, 194, 103, ${light})`);
      glow.addColorStop(0.35, `rgba(255, 142, 48, ${light * 0.55})`);
      glow.addColorStop(1, 'rgba(255, 118, 32, 0)');
      context.save();
      context.globalCompositeOperation = 'screen';
      context.fillStyle = glow;
      context.fillRect(glowX - radius, glowY - radius, radius * 2, radius * 2);
      // A faint reflection on the wax and adjacent holder follows the same light.
      const reflection = context.createRadialGradient(candle.anchor.x, candle.anchor.y + 34, 0,
        candle.anchor.x, candle.anchor.y + 34, 64);
      reflection.addColorStop(0, `rgba(255, 179, 71, ${light * 0.45})`);
      reflection.addColorStop(1, 'rgba(255, 128, 32, 0)');
      context.fillStyle = reflection;
      context.fillRect(candle.anchor.x - 64, candle.anchor.y - 30, 128, 128);
      context.restore();

      context.save();
      context.translate(candle.anchor.x, candle.anchor.y);
      // Shear and stretch around (0, 0): the luminous base never leaves the wick.
      context.transform(1 - 0.14 * intensity, 0, -bend, stretch, 0, 0);
      context.shadowColor = `rgba(255, 171, 62, ${0.62 + 0.15 * flicker})`;
      context.shadowBlur = (7 + 2 * flicker) * fit * pixelRatio;
      context.drawImage(flame, candle.flame.x - candle.anchor.x,
        candle.flame.y - candle.anchor.y, candle.flame.width, candle.flame.height);
      context.restore();
    };

    const animate = (now: number) => {
      frame = 0;
      const dt = lastFrame ? clamp((now - lastFrame) / 1000, 0, 1 / 30) : 1 / 60;
      lastFrame = now;
      elapsed += dt;
      // Airflow dies away quickly; the damped flame then settles more gradually.
      const decay = Math.exp(-dt / 0.2);
      windX *= decay;
      windY *= decay;
      const sway = 0.025 * Math.sin(elapsed * 2.9) + 0.017 * Math.sin(elapsed * 5.3 + 0.8);
      const targetBend = sway + windX * 0.78;
      const targetStretch = clamp(1 + 0.02 * Math.sin(elapsed * 4.4 + 0.5)
        + Math.hypot(windX, windY) * 0.38 - windY * 0.08, 0.9, 1.55);
      // Short integration steps keep recovery stable on slow frames.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const step = dt / steps;
      for (let i = 0; i < steps; i++) {
        bendVelocity += ((targetBend - bend) * 95 - bendVelocity * 17) * step;
        stretchVelocity += ((targetStretch - stretch) * 85 - stretchVelocity * 16) * step;
        bend = clamp(bend + bendVelocity * step, -0.85, 0.85);
        stretch = clamp(stretch + stretchVelocity * step, 0.88, 1.55);
      }
      paint();
      frame = window.requestAnimationFrame(animate);
    };

    const canAnimate = () => ready && !paused && !motion.matches
      && !document.hidden && document.hasFocus() && width > 0 && height > 0;
    const sync = () => {
      if (!canAnimate()) {
        window.cancelAnimationFrame(frame);
        frame = lastFrame = 0;
        resetAir();
        clear(); // The original artwork supplies the static flame while paused.
      } else if (!frame) {
        lastFrame = 0;
        frame = window.requestAnimationFrame(animate);
      }
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !ready || !canAnimate()) return;
      const current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
      const previous = pointer;
      pointer = current;
      if (!previous) return;
      const deltaTime = current.time - previous.time;
      // No entry impulse after a gap, a focus change, or a resized window.
      if (deltaTime <= 0 || deltaTime > 100) return;
      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      const distance = Math.hypot(dx, dy);
      const speed = distance * 1000 / deltaTime;
      if (speed < 220 || distance === 0) return;
      const centerX = bounds.left + offsetX + candle.anchor.x * fit;
      const centerY = bounds.top + (candle.anchor.y - candle.flame.height * 0.45) * fit;
      // Measure against the swept segment, so a fast pass cannot skip the flame.
      const along = clamp(((centerX - previous.x) * dx + (centerY - previous.y) * dy)
        / (distance * distance), 0, 1);
      const proximity = Math.hypot(centerX - previous.x - along * dx,
        centerY - previous.y - along * dy);
      const radius = clamp(95 * fit, 70, 135);
      if (proximity >= radius) return;
      // Ignore the portions covered by navigation, entries or modal controls.
      const hit = document.elementFromPoint(previous.x + along * dx, previous.y + along * dy);
      if (hit?.closest('button, input, select, [role="dialog"]')) return;
      const falloff = smoothstep(1 - proximity / radius);
      const strength = clamp((speed - 220) / 1400, 0, 1) * falloff;
      // Accumulate by travelled distance rather than event count (polling rate).
      const coupling = 1 - Math.exp(-distance / (24 * fit));
      windX = clamp(windX + (dx / distance * strength - windX) * coupling, -1, 1);
      windY = clamp(windY + (dy / distance * strength - windY) * coupling, -1, 1);
    };
    const leave = () => { pointer = null; };
    const resized = () => { resize(); sync(); };
    const observer = new ResizeObserver(resized);
    observer.observe(scene);
    window.addEventListener('resize', resized);
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('blur', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    resize();
    plate.src = `/assets/${candle.plateAsset}`;
    flame.src = `/assets/${candle.flameAsset}`;
    void Promise.all([plate.decode(), flame.decode()]).then(() => {
      if (disposed) return;
      ready = true;
      sync();
    }).catch(() => { /* Keep the original artwork when a decorative asset fails. */ });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resized);
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
      clear();
    };
  }, [paused]);

  return <div className="home-scene" ref={sceneRef}>
    <img className="home-scene-image" src="/assets/observatory-home.png" alt="夜间天文台、望远镜与手稿" />
    <canvas className="home-candle" ref={canvasRef} aria-hidden="true" />
  </div>;
}
