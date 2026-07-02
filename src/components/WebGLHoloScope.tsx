import React, { useEffect, useRef, useState } from "react";

interface WebGLHoloScopeProps {
  isScanning: boolean;
  issuesCount: number;
  hasScanRun: boolean;
}

export default function WebGLHoloScope({ isScanning, issuesCount, hasScanRun }: WebGLHoloScopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [initFailed, setInitFailed] = useState(false);
  
  // Track parameters across frames
  const stateRef = useRef({
    isScanning,
    issuesCount,
    hasScanRun,
    spinSpeed: 0.25,
    warpFactor: 0.1,
    glowPulse: 1.0,
    mouse: { x: 0.5, y: 0.5, currentX: 0.5, currentY: 0.5 }
  });

  // Keep ref in sync
  useEffect(() => {
    stateRef.current.isScanning = isScanning;
    stateRef.current.issuesCount = issuesCount;
    stateRef.current.hasScanRun = hasScanRun;
  }, [isScanning, issuesCount, hasScanRun]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {return;}

    const gl =
      canvas.getContext("webgl", { alpha: true, antialias: true, depth: false }) ||
      (canvas.getContext("experimental-webgl", { alpha: true, antialias: true, depth: false }) as WebGLRenderingContext | null);

    if (!gl) {
      console.warn("WebGL not supported for HoloScope");
      setInitFailed(true);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      if (!canvas) {return;}
      const width = canvas.clientWidth || 210;
      const height = canvas.clientHeight || 210;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Vertex Shader: Projects 3D points of sphere onto screen coordinates with perspective warping
    const vsSource = `
      attribute vec3 aPosition;
      attribute float aAlphaFactor;
      
      varying float vAlpha;
      varying vec3 vPosition;
      
      uniform vec2 uResolution;
      uniform float uTime;
      uniform float uSpinSpeed;
      uniform float uWarp;
      uniform vec2 uMouse;
      
      void main() {
        // Apply 3D coordinate rotations
        float cosT = cos(uTime * uSpinSpeed);
        float sinT = sin(uTime * uSpinSpeed);
        
        // Spin around Y axis
        vec3 rotPos = aPosition;
        float rx = rotPos.x * cosT - rotPos.z * sinT;
        float rz = rotPos.x * sinT + rotPos.z * cosT;
        rotPos.x = rx;
        rotPos.z = rz;
        
        // Tilt slightly around X axis
        float cosTilt = cos(0.35);
        float sinTilt = sin(0.35);
        float ry = rotPos.y * cosTilt - rotPos.z * sinTilt;
        rotPos.z = rotPos.y * sinTilt + rotPos.z * cosTilt;
        rotPos.y = ry;
        
        // Organic sinusoidal ripples to simulate code AST syntactic waves
        float wave = sin(rotPos.y * 3.5 + uTime * 3.0) * uWarp;
        rotPos.x += wave * cos(uTime * 1.5 + rotPos.x);
        rotPos.z += wave * sin(uTime * 1.5 + rotPos.z);
        
        // Interaction displacement from mouse cursor coordinate warp
        vec3 mouseDir = vec3(uMouse - 0.5, 0.0);
        float mouseDist = length(rotPos - mouseDir);
        float pullForce = smoothstep(0.8, 0.0, mouseDist) * 0.12;
        rotPos += normalize(rotPos) * pullForce;
        
        // Simple perspective projection calculation
        float cameraZ = 3.2;
        float perspective = 1.6 / (cameraZ - rotPos.z);
        
        // Normalized scale positioning
        vec2 scaleOffset = vec2(rotPos.x, rotPos.y) * perspective;
        
        gl_Position = vec4(scaleOffset, 0.0, 1.0);
        
        // Scale particle shape depending on perspective depth
        gl_PointSize = (3.5 + (rotPos.z * 1.8)) * perspective;
        
        // Fade particles on the rear side of the 3D grid sphere
        vAlpha = (0.55 + rotPos.z * 0.45) * aAlphaFactor;
        vPosition = rotPos;
      }
    `;

    // Fragment Shader: High-contrast holographic particle aura
    const fsSource = `
      precision highp float;
      varying float vAlpha;
      varying vec3 vPosition;
      
      uniform vec3 uBaseColor;
      uniform float uPulse;
      
      void main() {
        // Circle styling with smooth edge falloff
        vec2 relativeCoord = gl_PointCoord - vec2(0.5);
        float r = length(relativeCoord);
        if (r > 0.5) discard;
        
        float glowIntensity = smoothstep(0.5, 0.05, r);
        
        // Composite color with neon halo
        vec3 coreGlow = mix(uBaseColor, vec3(1.0, 1.0, 1.0), glowIntensity * 0.65);
        gl_FragColor = vec4(coreGlow * glowIntensity, vAlpha * uPulse * glowIntensity);
      }
    `;

    // Helpers to compile shaders safely
    const compileShader = (source: string, type: number): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) {return null;}
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("HoloScope Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) {
      setInitFailed(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) {return;}
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("HoloScope link failure:", gl.getProgramInfoLog(program));
      setInitFailed(true);
      return;
    }

    gl.useProgram(program);

    // Dynamic point cloud construction (Spherical coordinates)
    const particleCount = 420;
    const vertexPositions = new Float32Array(particleCount * 3);
    const alphaFactors = new Float32Array(particleCount);

    // Map mathematical points on a Fibonacci sphere for gorgeous uniform spacing
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    for (let i = 0; i < particleCount; i++) {
      const theta = (2 * Math.PI * i) / goldenRatio;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / particleCount);
      const radius = 0.82; // Sphere scale radius

      vertexPositions[i * 3 + 0] = radius * Math.cos(theta) * Math.sin(phi);
      vertexPositions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      vertexPositions[i * 3 + 2] = radius * Math.cos(phi);

      // Randomize original transparency offsets for dynamic holographic sparkling
      alphaFactors[i] = Math.random() * 0.5 + 0.5;
    }

    // Connect buffers
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexPositions, gl.STATIC_DRAW);

    const alphaBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, alphaFactors, gl.STATIC_DRAW);

    // Attrib pointer assignments
    const aPositionLoc = gl.getAttribLocation(program, "aPosition");
    const aAlphaFactorLoc = gl.getAttribLocation(program, "aAlphaFactor");

    // Uniform index slots
    const uResolutionLoc = gl.getUniformLocation(program, "uResolution");
    const uTimeLoc = gl.getUniformLocation(program, "uTime");
    const uSpinSpeedLoc = gl.getUniformLocation(program, "uSpinSpeed");
    const uWarpLoc = gl.getUniformLocation(program, "uWarp");
    const uMouseLoc = gl.getUniformLocation(program, "uMouse");
    const uBaseColorLoc = gl.getUniformLocation(program, "uBaseColor");
    const uPulseLoc = gl.getUniformLocation(program, "uPulse");

    const trackMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;
      const x = (clientX - rect.left) / (rect.width || 120);
      const y = (clientY - rect.top) / (rect.height || 120);
      stateRef.current.mouse.targetX = Math.min(Math.max(x, 0), 1);
      stateRef.current.mouse.targetY = Math.min(Math.max(1.0 - y, 0), 1);
    };

    window.addEventListener("mousemove", trackMouse, { passive: true });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive blending for gorgeous sci-fi glow overlay

    let animationId: number;
    const startTime = performance.now();

    const loop = () => {
      if (!canvas) {return;}
      const now = performance.now();
      const time = (now - startTime) * 0.001;

      // Lerp mouse variables
      const mouse = stateRef.current.mouse;
      mouse.currentX += (mouse.targetX - mouse.currentX) * 0.1;
      mouse.currentY += (mouse.targetY - mouse.currentY) * 0.1;

      // Transition rotation and morph variables depending on scan activity state
      const targetSpeed = stateRef.current.isScanning ? 3.4 : 0.42;
      const targetWarp = stateRef.current.isScanning ? 0.38 : 0.04;
      const targetPulse = stateRef.current.isScanning ? (Math.sin(time * 30.0) * 0.4 + 0.6) : 1.0;

      stateRef.current.spinSpeed += (targetSpeed - stateRef.current.spinSpeed) * 0.08;
      stateRef.current.warpFactor += (targetWarp - stateRef.current.warpFactor) * 0.1;
      stateRef.current.glowPulse += (targetPulse - stateRef.current.glowPulse) * 0.15;

      // Select majestic responsive color palette based on security health
      // Default: Indigo / Active Teal
      // Issues detected: Crimson / Warning Gold
      // No issues discovered: Emerald green
      let rgbColors: [number, number, number] = [0.30, 0.95, 0.79]; // CodeMore Active Teal
      
      if (stateRef.current.isScanning) {
        rgbColors = [0.92, 0.60, 0.24]; // Golden scanning
      } else if (stateRef.current.hasScanRun) {
        if (stateRef.current.issuesCount > 0) {
          rgbColors = [0.95, 0.25, 0.35]; // Red warning
        } else {
          rgbColors = [0.15, 0.85, 0.55]; // Emerald secure
        }
      }

      gl.clearColor(0.0, 0.0, 0.0, 0.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);

      // Pass values
      gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(uTimeLoc, time);
      gl.uniform1f(uSpinSpeedLoc, stateRef.current.spinSpeed);
      gl.uniform1f(uWarpLoc, stateRef.current.warpFactor);
      gl.uniform2f(uMouseLoc, mouse.currentX, mouse.currentY);
      gl.uniform3f(uBaseColorLoc, rgbColors[0], rgbColors[1], rgbColors[2]);
      gl.uniform1f(uPulseLoc, stateRef.current.glowPulse);

      // Position pointers
      gl.enableVertexAttribArray(aPositionLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);

      // Alpha indicators pointers
      gl.enableVertexAttribArray(aAlphaFactorLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuffer);
      gl.vertexAttribPointer(aAlphaFactorLoc, 1, gl.FLOAT, false, 0, 0);

      // Paint holographic node grid
      gl.drawArrays(gl.POINTS, 0, particleCount);

      animationId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", trackMouse);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(alphaBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  if (initFailed) {
    return (
      <div className="w-44 h-44 rounded-full border border-gray-900 bg-gray-950/40 flex items-center justify-center text-center p-4">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
          {isScanning ? "Synthesizing AST..." : "Graph Ready"}
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-44 h-44 flex items-center justify-center select-none shrink-0 mx-auto">
      {/* Outer technical interface boundary rings */}
      <div 
        className={`absolute inset-0 rounded-full border border-dashed transition-all duration-700 ${
          isScanning 
            ? "border-amber-500/25 animate-spin-slow rotate-45 scale-105" 
            : hasScanRun && issuesCount > 0 
            ? "border-red-500/20" 
            : hasScanRun && issuesCount === 0 
            ? "border-emerald-500/20" 
            : "border-gray-900/50"
        }`} 
      />
      <div 
        className={`absolute inset-3 rounded-full border border-double transition-all duration-700 ${
          isScanning 
            ? "border-amber-400/15 animate-reverse-spin scale-95" 
            : hasScanRun && issuesCount > 0 
            ? "border-red-400/10" 
            : hasScanRun && issuesCount === 0 
            ? "border-emerald-400/10" 
            : "border-gray-950"
        }`} 
      />

      {/* Primary interactive 3D WebGL projection area */}
      <canvas
        ref={canvasRef}
        className="w-full h-full relative z-[2] cursor-crosshair drop-shadow-[0_0_20px_rgba(78,242,202,0.15)]"
      />
      
      {/* Absolute status pill inside center to support HUD clarity */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none z-[3]">
        <span className={`text-[9px] font-mono uppercase tracking-widest leading-none ${
          isScanning 
            ? "text-amber-400 animate-pulse font-bold" 
            : hasScanRun && issuesCount > 0 
            ? "text-red-400 font-bold" 
            : hasScanRun && issuesCount === 0 
            ? "text-emerald-400 font-bold" 
            : "text-gray-500"
        }`}>
          {isScanning 
            ? "INDEXING" 
            : hasScanRun 
            ? issuesCount > 0 
              ? "RISK ALERT" 
              : "VERIFIED" 
            : "STANDBY"
          }
        </span>
        {hasScanRun && !isScanning && (
          <span className="text-[10px] font-mono text-gray-400 mt-1 uppercase font-semibold">
            {issuesCount} finds
          </span>
        )}
      </div>
    </div>
  );
}
