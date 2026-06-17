"use client";

import React, { useEffect, useRef, useState } from "react";

export default function WebGLPortalBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webglError, setWebglError] = useState<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
    if (!gl) {
      console.warn("WebGL not supported by browser");
      setWebglError(true);
      return;
    }

    // Vertex shader source
    const vsSource = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * 0.5 + 0.5;
        // Flip UV y axis to match standard coordinates
        vUv.y = 1.0 - vUv.y;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment shader source: Creates an organic, morphing energy vortex using procedural noise
    const fsSource = `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uMouse;

      // Pseudo-random noise helper
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // Simple 2D Value Noise
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      // Fractional Brownian Motion for multi-octave layered turbulence
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p * frequency);
          amplitude *= 0.5;
          frequency *= 2.0;
        }
        return value;
      }

      void main() {
        // Center space coordinates
        vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / min(uResolution.x, uResolution.y);

        // Polar coordinates calculation
        float r = length(uv);
        float angle = atan(uv.y, uv.x);

        // Distort coordinates dynamically using mouse and time
        vec2 distortion = vec2(
          fbm(uv * 3.0 + vec2(uTime * 0.15)),
          fbm(uv * 3.0 - vec2(uTime * 0.12))
        ) * 0.1;

        uv += distortion;

        // Dynamic swirl rotation
        float distToMouse = length(uv - (uMouse - 0.5));
        float angleOffset = uTime * 0.25 + 0.04 / (r + 0.1) + (1.0 - smoothstep(0.0, 0.8, distToMouse)) * 0.5;
        float cosA = cos(angleOffset);
        float sinA = sin(angleOffset);
        vec2 rotatedUv = vec2(
          uv.x * cosA - uv.y * sinA,
          uv.x * sinA + uv.y * cosA
        );

        // Procedural fractal texture mapping
        float t1 = fbm(rotatedUv * 4.0 - vec2(uTime * 0.4, 0.0));
        float t2 = fbm(rotatedUv * 8.0 + vec2(uTime * 0.2, uTime * 0.1));
        float density = mix(t1, t2, 0.4);

        // Color palette setup: Deep emerald, Electric Cyan, Glowing Lavenders
        vec3 colCore = vec3(0.03, 0.95, 0.79); // Coral/Teal
        vec3 colAura = vec3(0.51, 0.43, 0.95); // Purple-lavender
        vec3 colDark = vec3(0.02, 0.01, 0.05); // Deep Portal Void Background

        // Compute radial gradient masks & eye of the vortex (sink node)
        float portalEdge = smoothstep(0.48, 0.42, r);

        // This generates a ring instead of a filled disk. Peak intensity around 0.3, black/dark at center (< 0.15)
        float ringGlow = smoothstep(0.12, 0.32, r) * smoothstep(0.48, 0.32, r);
        float centerVoid = smoothstep(0.08, 0.22, r); // Complete mask out of the center to make text fully readable

        // Combine procedural texture noise with radial gradients
        vec3 finalCol = colDark;

        // Add purple aura backplate
        finalCol += colAura * (density * 0.4) * smoothstep(0.18, 0.48, r);

        // Add high contrast teal orbiting energy ring
        finalCol += colCore * (density * 1.8) * ringGlow;

        // Add a brilliant halo edge transition glow to the boundary of the void
        finalCol += vec3(0.8, 0.95, 1.0) * smoothstep(0.1, 0.15, r) * (1.0 - smoothstep(0.15, 0.2, r)) * 0.4;

        // Multiply by centerVoid to create the perfect black sink hole / vortex eye
        finalCol *= centerVoid;

        // Soft edge glow to avoid harsh margins
        finalCol *= portalEdge;

        // Subtle vignette at the extreme edges
        float vignette = smoothstep(0.5, 0.46, r) * 0.25;
        finalCol += colCore * vignette;

        gl_FragColor = vec4(finalCol, portalEdge * 0.95);
      }
    `;

    // Helper to compile shaders
    const compileShader = (source: string, type: number): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) {
      setWebglError(true);
      return;
    }

    // Link shader program
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("WebGL Program linking failed:", gl.getProgramInfoLog(program));
      setWebglError(true);
      return;
    }

    gl.useProgram(program);

    // Setup screen quad positions
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Retrieve uniform locations
    const uTimeLoc = gl.getUniformLocation(program, "uTime");
    const uResolutionLoc = gl.getUniformLocation(program, "uResolution");
    const uMouseLoc = gl.getUniformLocation(program, "uMouse");

    // Track state parameters
    let animationFrameId: number;
    let lastTime = 0;
    let accumulatedTime = 0;
    const mouse = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };

    // Set canvas dimensions with high density ratio
    const resize = () => {
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Handle mouse tracking over hero zone
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.targetX = (e.clientX - rect.left) / rect.width;
      mouse.targetY = (e.clientY - rect.top) / rect.height;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Main WebGL drawing tick
    const render = (time: number) => {
      resize();

      const delta = (time - lastTime) * 0.001;
      lastTime = time;
      accumulatedTime += delta;

      // Smooth mouse tracking interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Pass configurations to shaders
      gl.uniform1f(uTimeLoc, accumulatedTime);
      gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
      gl.uniform2f(uMouseLoc, mouse.x, mouse.y);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  if (webglError) {
    // Elegant CSS-fallback design for browsers without WebGL capability
    return (
      <div className="absolute inset-2 border-radius-50 overflow-hidden bg-gradient-to-tr from-[#0d0a1b] to-[#04040a] rounded-full animate-pulse opacity-90" />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full mix-blend-screen pointer-events-none rounded-full"
      style={{
        // Match center offsets and maintain clean sizing bounds
        width: "100%",
        height: "100%",
      }}
    />
  );
}
