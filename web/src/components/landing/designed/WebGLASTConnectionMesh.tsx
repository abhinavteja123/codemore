"use client";

import React, { useEffect, useRef, useState } from "react";

export default function WebGLASTConnectionMesh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [initFailed, setInitFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", { alpha: true, depth: false, antialias: true }) ||
      (canvas.getContext("experimental-webgl", { alpha: true, depth: false, antialias: true }) as WebGLRenderingContext | null);

    if (!gl) {
      console.warn("WebGL not supported for connection mesh background.");
      setInitFailed(true);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      if (!canvas) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // 1. Shaders for LINES
    const vsLineSource = `
      attribute vec2 aPosition;
      attribute float aAlpha;
      varying float vAlpha;
      uniform vec2 uResolution;
      void main() {
        vec2 zeroToOne = aPosition / uResolution;
        vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
        vAlpha = aAlpha;
      }
    `;

    const fsLineSource = `
      precision highp float;
      varying float vAlpha;
      void main() {
        // Subtle cybertech cyan color #4ef2ca
        gl_FragColor = vec4(0.30, 0.95, 0.79, vAlpha * 0.15);
      }
    `;

    // 2. Shaders for POINTS (Ast Nodes)
    const vsPointSource = `
      attribute vec2 aPosition;
      attribute float aAlpha;
      attribute float aSize;
      varying float vAlpha;
      uniform vec2 uResolution;
      void main() {
        vec2 zeroToOne = aPosition / uResolution;
        vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
        gl_PointSize = aSize;
        vAlpha = aAlpha;
      }
    `;

    const fsPointSource = `
      precision highp float;
      varying float vAlpha;
      void main() {
        vec2 rCoord = gl_PointCoord - vec2(0.5);
        float dist = length(rCoord);
        if (dist > 0.5) discard;
        
        // Soft focus gradient halo glow
        float glow = smoothstep(0.5, 0.0, dist);
        // Soft violet purple core #836ef3
        gl_FragColor = vec4(0.51, 0.43, 0.95, glow * vAlpha * 0.65);
      }
    `;

    // Shader compilation utility
    const compileShader = (source: string, type: number): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Mesh Shader compilation crash:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vsLine = compileShader(vsLineSource, gl.VERTEX_SHADER);
    const fsLine = compileShader(fsLineSource, gl.FRAGMENT_SHADER);
    const vsPoint = compileShader(vsPointSource, gl.VERTEX_SHADER);
    const fsPoint = compileShader(fsPointSource, gl.FRAGMENT_SHADER);

    if (!vsLine || !fsLine || !vsPoint || !fsPoint) {
      setInitFailed(true);
      return;
    }

    // Link Line Program
    const lineProgram = gl.createProgram();
    if (!lineProgram) return;
    gl.attachShader(lineProgram, vsLine);
    gl.attachShader(lineProgram, fsLine);
    gl.linkProgram(lineProgram);

    // Link Point Program
    const pointProgram = gl.createProgram();
    if (!pointProgram) return;
    gl.attachShader(pointProgram, vsPoint);
    gl.attachShader(pointProgram, fsPoint);
    gl.linkProgram(pointProgram);

    if (!gl.getProgramParameter(lineProgram, gl.LINK_STATUS) || !gl.getProgramParameter(pointProgram, gl.LINK_STATUS)) {
      setInitFailed(true);
      return;
    }

    // Active Node configuration — 40 nodes keeps O(n^2) line detection at
    // ~780 distance ops per frame (down from 1,770 at 60) with no visible loss.
    const activeNodesTarget = 40;
    const nodes: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      alpha: number;
    }> = [];

    // Initialize random nodes positions
    const initializeNodes = () => {
      nodes.length = 0;
      const width = window.innerWidth;
      const height = window.innerHeight;
      for (let i = 0; i < activeNodesTarget; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          radius: Math.random() * 5.0 + 3.0,
          alpha: Math.random() * 0.4 + 0.3,
        });
      }
    };
    initializeNodes();

    // Prepare WebGL Buffer bindings
    const lineBuffer = gl.createBuffer();
    const pointBuffer = gl.createBuffer();

    let mouseX = 0;
    let mouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Enable basic blend layers
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let animationId: number;
    const loop = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      // 1. Physics update
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;

        // Bounce back boundaries
        if (n.x < 0) { n.x = 0; n.vx *= -1; }
        else if (n.x > width) { n.x = width; n.vx *= -1; }
        if (n.y < 0) { n.y = 0; n.vy *= -1; }
        else if (n.y > height) { n.y = height; n.vy *= -1; }

        // Subtle gravity attraction to cursor
        const dx = mouseX - n.x;
        const dy = mouseY - n.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 200) {
          const factor = (1.0 - distance / 200) * 0.05;
          n.vx += (dx / distance) * factor;
          n.vy += (dy / distance) * factor;
        }

        // Apply visual damping
        const absoluteSpeed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (absoluteSpeed > 0.6) {
          n.vx = (n.vx / absoluteSpeed) * 0.6;
          n.vy = (n.vy / absoluteSpeed) * 0.6;
        }
      }

      // 2. Draft connecting lines dynamic coordinates
      // Pairs of lines: 2 coordinates (x, y) + alpha value per node: 3 floats per point. 6 floats per line.
      const lineData: number[] = [];
      const threshold = 160;

      for (let i = 0; i < nodes.length; i++) {
        const na = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const nb = nodes[j];
          const dx = na.x - nb.x;
          const dy = na.y - nb.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < threshold) {
            const distanceAlpha = (1.0 - dist / threshold) * na.alpha * nb.alpha;
            // First point
            lineData.push(na.x);
            lineData.push(na.y);
            lineData.push(distanceAlpha);
            // Second point
            lineData.push(nb.x);
            lineData.push(nb.y);
            lineData.push(distanceAlpha);
          }
        }
      }

      // Convert arrays to typed Float32Array arrays directly for WebGL bindings
      const lineFloatArray = new Float32Array(lineData);

      // Point Data layout: flat Float32Array [x, y, alpha, size] => 4 floats per node
      const pointFloatArray = new Float32Array(nodes.length * 4);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        
        // Enhance node brightness slightly if close to mouse pointer
        const dx = mouseX - n.x;
        const dy = mouseY - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let bonusAlpha = 1.0;
        let bonusSize = 0.0;
        if (dist < 180) {
          bonusAlpha += (1.0 - dist / 180) * 1.5;
          bonusSize += (1.0 - dist / 180) * 4.0;
        }

        pointFloatArray[i * 4 + 0] = n.x;
        pointFloatArray[i * 4 + 1] = n.y;
        pointFloatArray[i * 4 + 2] = n.alpha * bonusAlpha;
        pointFloatArray[i * 4 + 3] = (n.radius + bonusSize) * dpr;
      }

      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // --- Draw Call 1: Dynamic lines ---
      if (lineFloatArray.length > 0) {
        gl.useProgram(lineProgram);
        
        const uResLocLine = gl.getUniformLocation(lineProgram, "uResolution");
        gl.uniform2f(uResLocLine, width, height);

        gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, lineFloatArray, gl.DYNAMIC_DRAW);

        const aPosLocLine = gl.getAttribLocation(lineProgram, "aPosition");
        gl.enableVertexAttribArray(aPosLocLine);
        gl.vertexAttribPointer(aPosLocLine, 2, gl.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0);

        const aAlphaLocLine = gl.getAttribLocation(lineProgram, "aAlpha");
        gl.enableVertexAttribArray(aAlphaLocLine);
        gl.vertexAttribPointer(aAlphaLocLine, 1, gl.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);

        gl.drawArrays(gl.LINES, 0, lineFloatArray.length / 3);
      }

      // --- Draw Call 2: AST floating points ---
      gl.useProgram(pointProgram);

      const uResLocPoint = gl.getUniformLocation(pointProgram, "uResolution");
      gl.uniform2f(uResLocPoint, width, height);

      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, pointFloatArray, gl.DYNAMIC_DRAW);

      const aPosLocPoint = gl.getAttribLocation(pointProgram, "aPosition");
      gl.enableVertexAttribArray(aPosLocPoint);
      gl.vertexAttribPointer(aPosLocPoint, 2, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);

      const aAlphaLocPoint = gl.getAttribLocation(pointProgram, "aAlpha");
      gl.enableVertexAttribArray(aAlphaLocPoint);
      gl.vertexAttribPointer(aAlphaLocPoint, 1, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);

      const aSizeLocPoint = gl.getAttribLocation(pointProgram, "aSize");
      gl.enableVertexAttribArray(aSizeLocPoint);
      gl.vertexAttribPointer(aSizeLocPoint, 1, gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);

      gl.drawArrays(gl.POINTS, 0, nodes.length);

      animationId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      gl.deleteBuffer(lineBuffer);
      gl.deleteBuffer(pointBuffer);
      gl.deleteProgram(lineProgram);
      gl.deleteProgram(pointProgram);
      gl.deleteShader(vsLine);
      gl.deleteShader(fsLine);
      gl.deleteShader(vsPoint);
      gl.deleteShader(fsPoint);
    };
  }, []);

  if (initFailed) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-[1] select-none opacity-40 mix-blend-screen"
    />
  );
}
