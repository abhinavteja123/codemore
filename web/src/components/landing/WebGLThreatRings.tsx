"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** Which of the 7 threat classes is currently focused (0..6). */
  active: number;
}

/**
 * WebGL backdrop for the Threat Taxonomy section. Renders 7 concentric
 * rings, one per threat class. The active ring brightens and pulses;
 * others dim. Cheap full-screen fragment shader — no geometry, no
 * physics.
 */
export default function WebGLThreatRings({ active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * 0.5 + 0.5;
        vUv.y = 1.0 - vUv.y;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fs = `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform float uActive; // 0..6

      void main() {
        vec2 uv = vUv;
        // Aspect-correct centred coords
        vec2 p = uv - 0.5;
        p.x *= uResolution.x / uResolution.y;
        float r = length(p);
        float ang = atan(p.y, p.x);

        // 7 rings at radii r0..r6
        vec3 col = vec3(0.012, 0.012, 0.04);
        for (int i = 0; i < 7; i++) {
          float radius = 0.08 + float(i) * 0.06;
          float ring = smoothstep(0.012, 0.0, abs(r - radius));
          float isActive = step(0.5, 1.0 - abs(float(i) - uActive));
          // Active ring pulses
          float pulse = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * 1.6 - float(i) * 0.4));
          float intensity = mix(0.22, 1.0, isActive) * pulse;
          // Hue per class — gentle gradient cyan → purple → pink
          float t = float(i) / 6.0;
          vec3 cClass = mix(
            vec3(0.31, 0.95, 0.79),       // cyan/turquoise (gold)
            mix(vec3(0.51, 0.43, 0.95),   // indigo
                vec3(0.92, 0.49, 0.70),   // pink
                t),
            t
          );
          col += ring * intensity * cClass;
        }

        // Subtle radial vignette
        float vignette = smoothstep(1.05, 0.45, r);
        col *= vignette;

        // Slow drift starfield-style noise
        float n = fract(sin(dot(uv * 1024.0, vec2(12.9898, 78.233))) * 43758.5453);
        col += vec3(n * 0.012);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vsh = compile(gl.VERTEX_SHADER, vs);
    const fsh = compile(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "uTime");
    const uRes = gl.getUniformLocation(prog, "uResolution");
    const uAct = gl.getUniformLocation(prog, "uActive");

    let smoothedActive = activeRef.current;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      // Ease active value over time for buttery transitions between rings
      smoothedActive += (activeRef.current - smoothedActive) * 0.08;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uAct, smoothedActive);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = reducedMotion ? 0 : requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };
    const stopLoop = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    let io: IntersectionObserver | null = null;
    if (reducedMotion) {
      startLoop(); // one static frame — tick tail won't reschedule
    } else {
      io = new IntersectionObserver(
        ([entry]) => (entry.isIntersecting ? startLoop() : stopLoop()),
        { threshold: 0, rootMargin: "100px" }
      );
      io.observe(canvas);
      startLoop();
    }

    return () => {
      stopLoop();
      if (io) io.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="webgl-threat-rings" aria-hidden />;
}
