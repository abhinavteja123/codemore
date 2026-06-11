import React, { useEffect, useRef, useState } from "react";

interface WebGLBrandLetterProps {
  letter: string;
  index: number;
  key?: React.Key;
}

export default function WebGLBrandLetter({ letter, index }: WebGLBrandLetterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<boolean>(false);
  const hoverRef = useRef<number>(0); // Smooth lerped hover progress
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const animFrameIdRef = useRef<number | null>(null);

  // Track cursor position inside the letter bounding rect
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    mouseRef.current = { x, y: 1.0 - y }; // Flip Y for WebGL coords
  };

  const handleMouseEnter = () => setHovered(true);
  const handleMouseLeave = () => {
    setHovered(false);
    // Smoothly transition mouse back to center
    mouseRef.current = { x: 0.5, y: 0.5 };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use WebGL context (fallback to experimental)
    const gl =
      canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false }) ||
      (canvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: false }) as WebGLRenderingContext | null);

    if (!gl) {
      console.warn("WebGL not supported for brand letter");
      return;
    }

    // Set high-resolution backing store using device pixel ratio
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.floor((rect.width || 120) * dpr);
    const height = Math.floor((rect.height || 160) * dpr);
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);

    // Create custom offscreen canvas to render the crispy bold glyph
    const offscreen = document.createElement("canvas");
    offscreen.width = 256;
    offscreen.height = 256;
    const ctx = offscreen.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Render text heavy, bold font matching CSS look
      ctx.font = "900 190px 'Inter', sans-serif";
      ctx.fillText(letter, 128, 128);
    }

    // Vertex shader source
    const vsSource = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * 0.5 + 0.5;
        // Flip UV y axis to match standard canvas coordinates
        vUv.y = 1.0 - vUv.y;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment shader source: Texture displacement, holographic chromatic aberration & mouse fluid warp
    const fsSource = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform float uTime;
      uniform float uHover;
      uniform vec2 uMouse;

      // Pseudo-random coordinates generator
      float rand(vec2 co) {
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }

      void main() {
        vec2 uv = vUv;
        float hoverForced = uHover;

        // Mouse displacement calculation
        float distToMouse = length(uv - uMouse);
        float mouseImpulse = smoothstep(0.4, 0.0, distToMouse);
        vec2 pushDir = normalize(uv - uMouse + vec2(0.0001));
        
        // Dynamic cybernetic wavy ripples on hover
        float waveY = sin(uv.x * 12.0 + uTime * 5.0) * 0.015 * hoverForced;
        float waveX = cos(uv.y * 10.0 + uTime * 4.0) * 0.012 * hoverForced;
        
        // Random digital line flicker (classic sci-fi telemetry display glitch)
        float glitchTrigger = step(0.97, sin(uTime * 4.0));
        float glitchValue = step(0.98, rand(vec2(floor(uv.y * 30.0), uTime)));
        float glitchDisplace = glitchValue * glitchTrigger * 0.04 * hoverForced;

        // Apply interactive displacement to UVs
        vec2 displacedUv = uv + vec2(waveX + glitchDisplace, waveY) - pushDir * (mouseImpulse * 0.03 * hoverForced);
        
        // Chromatic aberration (Split RGB channels depending on hover intensity)
        vec2 uvRed = displacedUv + vec2(0.035 * hoverForced, 0.0);
        vec2 uvGreen = displacedUv;
        vec2 uvBlue = displacedUv - vec2(0.02 * hoverForced, 0.02 * hoverForced);

        // Clamp UV coordinates to avoid pixel wrap artifacts
        float alphaR = texture2D(uTexture, clamp(uvRed, vec2(0.001), vec2(0.999))).a;
        float alphaG = texture2D(uTexture, clamp(uvGreen, vec2(0.001), vec2(0.999))).a;
        float alphaB = texture2D(uTexture, clamp(uvBlue, vec2(0.001), vec2(0.999))).a;

        // Base text layers
        vec3 rawColor = vec3(alphaR, alphaG, alphaB);

        // Scanlines pattern
        float scanline = sin(uv.y * 140.0 + uTime * 10.0) * 0.08 * hoverForced;

        // Energetic laser matrix sweep
        float sweepPeriod = fract(uTime * 0.32) * 1.4 - 0.2;
        float sweepLine = smoothstep(0.05, 0.0, abs(uv.y - sweepPeriod)) * 0.28 * hoverForced;

        // Palette presets matching codemore dark HUD interface
        vec3 baseMetal = vec3(0.98, 0.98, 1.0) * (uv.y * 0.5 + 0.5); // Warm elegant off-white gradient
        vec3 colorCyan = vec3(0.3, 0.95, 0.79); // CodeMore active teal #4ef2ca
        vec3 colorPurple = vec3(0.51, 0.43, 0.95); // Futuristic purple #836ef3

        // Advanced color mix based on hover intensity
        vec3 activeColor = mix(colorCyan * alphaG, colorPurple * alphaB, uv.x) * 1.4;
        vec3 finalColor = mix(baseMetal * rawColor, activeColor + vec3(sweepLine * alphaG), hoverForced);

        // Apply subtle CRT-glow over scanlines
        float alpha = max(alphaR, max(alphaG, alphaB));
        alpha = alpha * (1.0 + scanline);

        gl_FragColor = vec4(finalColor * alpha, alpha * 0.95);
      }
    `;

    // Shader compilation utility
    const compileShader = (source: string, type: number): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Letter shader Compilation Problem:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    // Shader program setup
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program linking failed:", gl.getProgramInfoLog(program));
      return;
    }

    // Geometry buffers Setup (quad mapping)
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Create & bind the texture containing the Canvas 2D letter rendering
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);

    // Uniform index lookup handles
    const uTimeLoc = gl.getUniformLocation(program, "uTime");
    const uHoverLoc = gl.getUniformLocation(program, "uHover");
    const uMouseLoc = gl.getUniformLocation(program, "uMouse");

    gl.useProgram(program);

    // Enable basic blend for clean webgl overlay merging
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let startTime = performance.now();

    // High performance animation loop
    const frame = () => {
      const now = performance.now();
      const time = (now - startTime) * 0.001;

      // Lerp hover effect (smooth cubic acceleration/damping)
      const targetHover = hovered ? 1.0 : 0.0;
      hoverRef.current += (targetHover - hoverRef.current) * 0.12;

      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.uniform1f(uTimeLoc, time);
      gl.uniform1f(uHoverLoc, hoverRef.current);
      gl.uniform2f(uMouseLoc, mouseRef.current.x, mouseRef.current.y);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animFrameIdRef.current = requestAnimationFrame(frame);
    };

    frame();

    // Handle viewport resize mapping
    const handleResize = () => {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const w = Math.floor((r.width || 120) * dpr);
      const h = Math.floor((r.height || 160) * dpr);
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      window.removeEventListener("resize", handleResize);
      gl.deleteTexture(texture);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [letter, hovered]);

  return (
    <div
      className="footer__brand-letter-wrapper group relative"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      id={`webgl-letter-${index}`}
    >
      {/* Tech index marker overhead */}
      <div className="footer__brand-letter-tag select-none font-mono">
        0{index + 1}
      </div>

      {/* Frame boundary placeholder & custom interactive WebGL layer */}
      <div className="footer__brand-letter-container relative aspect-[3/4] w-[clamp(32px,7.5vw,100px)] h-auto">
        {/* Crisp WebGL render container layer */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-[0_0_15px_rgba(78,242,202,0.1)] transition-transform duration-300 group-hover:scale-110"
        />
      </div>

      {/* Technical HUD visual anchors beneath letter */}
      <div className="footer__brand-letter-sub select-none">
        <span className="line" />
        <span className="dot" />
      </div>
    </div>
  );
}
