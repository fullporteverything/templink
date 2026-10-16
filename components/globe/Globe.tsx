"use client";

import { useEffect, useRef } from "react";
import { landDots } from "./land";

type LatLon = [number, number];
export type Arc = { from: LatLon; to: LatLon };

/** Ambient routes between major cities, used only when there's no real activity to show yet. */
const AMBIENT: Arc[] = [
  [[40.7, -74], [51.5, -0.1]],
  [[37.8, -122.4], [35.7, 139.7]],
  [[-23.5, -46.6], [38.7, -9.1]],
  [[52.5, 13.4], [1.35, 103.8]],
  [[19.4, -99.1], [41.9, -87.6]],
  [[48.9, 2.35], [25.2, 55.3]],
  [[-33.9, 151.2], [37.6, 127]],
  [[6.5, 3.4], [51.5, -0.1]],
  [[43.7, -79.4], [-34.6, -58.4]],
  [[28.6, 77.2], [52.4, 4.9]],
  [[34.1, -118.2], [-33.9, 18.4]],
  [[59.3, 18.1], [40.4, -3.7]],
].map(([from, to]) => ({ from: from as LatLon, to: to as LatLon }));

const RAD = Math.PI / 180;

function toVec([lat, lon]: LatLon): [number, number, number] {
  const p = lat * RAD;
  const l = lon * RAD;
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
}

type Flight = { a: number[]; b: number[]; omega: number; lift: number; born: number; life: number };

function readColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    dot: v("--globe-dot", "#8a8a86"),
    accent: v("--accent", "#3d4cf5"),
    sphere: v("--globe-sphere", "#ffffff"),
    shade: v("--globe-shade", "#ececea"),
    rim: v("--globe-rim", "rgba(61,76,245,0.18)"),
  };
}

/**
 * Dot-matrix globe drawn on a 2D canvas. Shows `arcs` as animated flights (falls back to
 * ambient routes), pulses `points`, rotates slowly, and can be dragged. Always animates, by design.
 */
export default function Globe({
  arcs = [],
  points = [],
  focus = [25, -40],
  className = "",
  speed = 1,
}: {
  arcs?: Arc[];
  points?: LatLon[];
  focus?: LatLon;
  className?: string;
  speed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef({ arcs, points });
  dataRef.current = { arcs, points };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dots = landDots().map(toVec);

    let colors = readColors(canvas);
    let w = 0;
    let h = 0;
    let dpr = 1;
    let yaw = -focus[1] * RAD;
    let pitch = focus[0] * RAD * 0.8;
    let velocity = 0.0011 * speed; // rad/frame of auto-rotation
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let visible = true;
    let raf = 0;
    let flights: Flight[] = [];
    let nextSpawn = 0;
    let arcCursor = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const spawn = (time: number) => {
      const real = dataRef.current.arcs;
      const pool = real.length ? real : AMBIENT;
      const arc = pool[arcCursor++ % pool.length];
      const a = toVec(arc.from);
      const b = toVec(arc.to);
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const omega = Math.acos(dot);
      if (omega < 0.01) return;
      flights.push({ a, b, omega, lift: 0.08 + 0.32 * (omega / Math.PI), born: time, life: 2600 + omega * 900 });
    };

    // Rotate a unit-sphere point by the current yaw/pitch, then project orthographically.
    const project = (x: number, y: number, z: number, cy: number, sy: number, cp: number, sp: number) => {
      const x1 = x * cy + z * sy;
      const z1 = z * cy - x * sy;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      return [x1, y2, z2];
    };

    const slerp = (f: Flight, t: number) => {
      const s = Math.sin(f.omega);
      const k1 = Math.sin((1 - t) * f.omega) / s;
      const k2 = Math.sin(t * f.omega) / s;
      const lift = 1 + f.lift * Math.sin(Math.PI * t);
      return [(f.a[0] * k1 + f.b[0] * k2) * lift, (f.a[1] * k1 + f.b[1] * k2) * lift, (f.a[2] * k1 + f.b[2] * k2) * lift];
    };

    const draw = (time: number) => {
      const R = Math.min(w, h) * 0.47;
      const cx = w / 2;
      const cyc = h / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Sphere body and rim glow.
      const body = ctx.createRadialGradient(cx - R * 0.35, cyc - R * 0.4, R * 0.1, cx, cyc, R);
      body.addColorStop(0, colors.sphere);
      body.addColorStop(1, colors.shade);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cyc, R, 0, Math.PI * 2);
      ctx.fill();
      const glow = ctx.createRadialGradient(cx, cyc, R * 0.92, cx, cyc, R * 1.08);
      glow.addColorStop(0, "rgba(0,0,0,0)");
      glow.addColorStop(0.5, colors.rim);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cyc, R * 1.08, 0, Math.PI * 2);
      ctx.fill();

      const cY = Math.cos(yaw);
      const sY = Math.sin(yaw);
      const cP = Math.cos(pitch);
      const sP = Math.sin(pitch);

      // Land dots, batched by depth into a few alpha bands.
      const size = Math.max(1.1, R / 260);
      ctx.fillStyle = colors.dot;
      const bands = 5;
      const buckets: number[][] = Array.from({ length: bands }, () => []);
      for (const d of dots) {
        const [x, y, z] = project(d[0], d[1], d[2], cY, sY, cP, sP);
        if (z <= 0.02) continue;
        const band = Math.min(bands - 1, Math.floor(z * bands));
        buckets[band].push(cx + x * R, cyc - y * R);
      }
      for (let b = 0; b < bands; b++) {
        ctx.globalAlpha = 0.18 + (0.72 * (b + 1)) / bands;
        const pts = buckets[b];
        for (let i = 0; i < pts.length; i += 2) ctx.fillRect(pts[i] - size / 2, pts[i + 1] - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // Upload locations: soft pulsing points.
      ctx.fillStyle = colors.accent;
      const pulse = (Math.sin(time / 500) + 1) / 2;
      for (const p of dataRef.current.points.slice(0, 40)) {
        const v = toVec(p);
        const [x, y, z] = project(v[0], v[1], v[2], cY, sY, cP, sP);
        if (z <= 0) continue;
        ctx.globalAlpha = 0.35 + 0.4 * z;
        ctx.beginPath();
        ctx.arc(cx + x * R, cyc - y * R, 2 + pulse * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Flights.
      ctx.lineCap = "round";
      ctx.strokeStyle = colors.accent;
      flights = flights.filter((f) => time - f.born < f.life);
      for (const f of flights) {
        const age = (time - f.born) / f.life;
        const head = Math.min(1, age / 0.6);
        const tail = Math.max(0, (age - 0.35) / 0.65);
        const fade = age > 0.85 ? (1 - age) / 0.15 : 1;
        const steps = 40;
        let prev: number[] | null = null;
        for (let i = 0; i <= steps; i++) {
          const t = tail + ((head - tail) * i) / steps;
          const [px, py, pz] = slerp(f, t);
          const [x, y, z] = project(px, py, pz, cY, sY, cP, sP);
          const hidden = z < 0 && x * x + y * y < 1;
          const sx = cx + x * R;
          const sy = cyc - y * R;
          if (prev && !hidden) {
            ctx.globalAlpha = fade * (0.25 + (0.75 * i) / steps);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(prev[0], prev[1]);
            ctx.lineTo(sx, sy);
            ctx.stroke();
          }
          prev = hidden ? null : [sx, sy];
        }
        // Endpoints: a dot at the origin and a landing ring at the destination.
        for (const [end, t] of [
          [f.a, 0],
          [f.b, 1],
        ] as const) {
          const [x, y, z] = project(end[0], end[1], end[2], cY, sY, cP, sP);
          if (z <= 0) continue;
          ctx.globalAlpha = fade;
          ctx.fillStyle = colors.accent;
          ctx.beginPath();
          ctx.arc(cx + x * R, cyc - y * R, 2.6, 0, Math.PI * 2);
          ctx.fill();
          if (t === 1 && head >= 1) {
            const ring = Math.min(1, (age - 0.6) / 0.4);
            ctx.globalAlpha = fade * (1 - ring);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(cx + x * R, cyc - y * R, 3 + ring * 14, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const frame = (time: number) => {
      raf = 0;
      if (!visible) return;
      if (!dragging) {
        yaw += velocity;
        velocity += (0.0011 * speed - velocity) * 0.02; // ease back to cruising speed after a fling
      }
      if (time >= nextSpawn) {
        spawn(time);
        nextSpawn = time + 650 + Math.random() * 500;
      }
      draw(time);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    resize();
    start();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && document.visibilityState === "visible";
      if (visible) start();
    });
    io.observe(canvas);
    const onVis = () => {
      visible = document.visibilityState === "visible";
      if (visible) start();
    };
    document.addEventListener("visibilitychange", onVis);

    const onTheme = () => {
      colors = readColors(canvas);
    };
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", onTheme);

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const k = 1 / Math.max(120, Math.min(w, h) * 0.47);
      yaw += dx * k;
      pitch = Math.max(-1.1, Math.min(1.1, pitch + dy * k));
      velocity = dx * k;
    };
    const up = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", onTheme);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
    // focus/speed are initial values; data updates flow through dataRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`touch-pan-y select-none cursor-grab active:cursor-grabbing ${className}`}
      aria-label="Globe showing recent transfers"
      role="img"
    />
  );
}
