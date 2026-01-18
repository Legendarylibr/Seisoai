/**
 * Panorama360Viewer - True 360-degree spherical panorama viewer
 * Uses WebGL with image proxy to bypass CORS, with CSS fallback
 */
import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Move, Maximize2, Minimize2, RotateCcw, Download, Play, Pause } from 'lucide-react';
import { WIN95 } from '../utils/buttonStyles';

interface Panorama360ViewerProps {
  src: string;
  alt?: string;
  onDownload?: () => void;
  onClose?: () => void;
}

// Vertex shader
const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Fragment shader - equirectangular to sphere projection
const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform float u_yaw;
  uniform float u_pitch;
  uniform float u_fov;
  uniform float u_aspect;
  
  #define PI 3.14159265359
  
  void main() {
    vec2 ndc = v_texCoord * 2.0 - 1.0;
    float fovScale = tan(u_fov * 0.5);
    vec3 rayDir = normalize(vec3(ndc.x * fovScale * u_aspect, ndc.y * fovScale, -1.0));
    
    float cp = cos(u_pitch), sp = sin(u_pitch);
    vec3 pitched = vec3(rayDir.x, rayDir.y * cp - rayDir.z * sp, rayDir.y * sp + rayDir.z * cp);
    
    float cy = cos(u_yaw), sy = sin(u_yaw);
    vec3 rotated = vec3(pitched.x * cy + pitched.z * sy, pitched.y, -pitched.x * sy + pitched.z * cy);
    
    float theta = atan(rotated.x, -rotated.z);
    float phi = asin(clamp(rotated.y, -1.0, 1.0));
    
    gl_FragColor = texture2D(u_texture, vec2((theta / PI + 1.0) * 0.5, phi / PI + 0.5));
  }
`;

// Get proxied URL for CORS bypass
function getProxiedUrl(url: string): string {
  // If it's already a data URL or local, don't proxy
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) {
    return url;
  }
  const apiUrl = import.meta.env.VITE_API_URL || '';
  return `${apiUrl}/api/image-proxy?url=${encodeURIComponent(url)}`;
}

const Panorama360Viewer = memo<Panorama360ViewerProps>(function Panorama360Viewer({ 
  src, 
  alt = '360° Panorama',
  onDownload,
  onClose 
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [fov, setFov] = useState(90);
  const [useWebGL, setUseWebGL] = useState(true);
  const [, forceRender] = useState(0);
  
  // State refs for animation
  const stateRef = useRef({
    yaw: 0,
    pitch: 0,
    velocityX: 0,
    velocityY: 0,
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    lastPinchDist: 0,
    fov: 90,
    isAutoRotating: false,
    // WebGL refs
    gl: null as WebGLRenderingContext | null,
    program: null as WebGLProgram | null,
    texture: null as WebGLTexture | null,
    running: false
  });
  
  // Sync state to refs
  useEffect(() => { stateRef.current.fov = fov; }, [fov]);
  useEffect(() => { stateRef.current.isAutoRotating = isAutoRotating; }, [isAutoRotating]);
  
  // Initialize WebGL
  useEffect(() => {
    if (!useWebGL) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set initial size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!gl) {
      console.warn('WebGL not available, using CSS fallback');
      setUseWebGL(false);
      return;
    }
    
    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) { setUseWebGL(false); return; }
    
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('Vertex shader error:', gl.getShaderInfoLog(vs));
      setUseWebGL(false);
      return;
    }
    
    gl.shaderSource(fs, FRAGMENT_SHADER);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('Fragment shader error:', gl.getShaderInfoLog(fs));
      setUseWebGL(false);
      return;
    }
    
    const program = gl.createProgram();
    if (!program) { setUseWebGL(false); return; }
    
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      setUseWebGL(false);
      return;
    }
    
    // Create quad
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    
    stateRef.current.gl = gl;
    stateRef.current.program = program;
    
    // Load texture via proxy
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        stateRef.current.texture = texture;
        setImageLoaded(true);
      } catch (e) {
        console.error('Failed to create texture (CORS?):', e);
        setUseWebGL(false);
      }
    };
    img.onerror = () => {
      console.warn('Failed to load proxied image, using CSS fallback');
      setUseWebGL(false);
    };
    // Use proxied URL for CORS bypass
    img.src = getProxiedUrl(src);
    
    // Animation loop
    stateRef.current.running = true;
    let animFrame = 0;
    
    const animate = () => {
      if (!stateRef.current.running) return;
      
      const s = stateRef.current;
      const { gl, program, texture } = s;
      
      // Physics
      if (!s.isDragging) {
        s.yaw += s.velocityX;
        s.pitch += s.velocityY;
        s.velocityX *= 0.95;
        s.velocityY *= 0.95;
        if (Math.abs(s.velocityX) < 0.0001) s.velocityX = 0;
        if (Math.abs(s.velocityY) < 0.0001) s.velocityY = 0;
      }
      
      if (s.isAutoRotating && !s.isDragging) {
        s.yaw += 0.003;
      }
      
      s.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, s.pitch));
      
      // Render
      if (gl && program && texture && canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(rect.width * dpr);
        const h = Math.floor(rect.height * dpr);
        
        if (w > 0 && h > 0) {
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          gl.viewport(0, 0, w, h);
          gl.useProgram(program);
          
          gl.uniform1f(gl.getUniformLocation(program, 'u_yaw'), s.yaw);
          gl.uniform1f(gl.getUniformLocation(program, 'u_pitch'), s.pitch);
          gl.uniform1f(gl.getUniformLocation(program, 'u_fov'), (s.fov * Math.PI) / 180);
          gl.uniform1f(gl.getUniformLocation(program, 'u_aspect'), w / h);
          
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
          
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }
      
      animFrame = requestAnimationFrame(animate);
    };
    
    animFrame = requestAnimationFrame(animate);
    
    return () => {
      stateRef.current.running = false;
      cancelAnimationFrame(animFrame);
    };
  }, [src, useWebGL]);
  
  // CSS fallback animation
  useEffect(() => {
    if (useWebGL) return;
    
    let animFrame = 0;
    let running = true;
    
    const animate = () => {
      if (!running) return;
      
      const s = stateRef.current;
      
      if (!s.isDragging) {
        s.yaw += s.velocityX;
        s.pitch += s.velocityY;
        s.velocityX *= 0.92;
        s.velocityY *= 0.92;
        if (Math.abs(s.velocityX) < 0.01) s.velocityX = 0;
        if (Math.abs(s.velocityY) < 0.01) s.velocityY = 0;
      }
      
      if (s.isAutoRotating && !s.isDragging) {
        s.yaw += 0.003;
      }
      
      // Keep yaw in bounds for CSS
      if (s.yaw > Math.PI * 2) s.yaw -= Math.PI * 2;
      if (s.yaw < 0) s.yaw += Math.PI * 2;
      s.pitch = Math.max(-1, Math.min(1, s.pitch));
      
      // Update CSS transform
      if (imageRef.current) {
        const xPct = (s.yaw / (Math.PI * 2)) * 200;
        const yPct = s.pitch * 20;
        const scale = 90 / stateRef.current.fov;
        imageRef.current.style.transform = `translate(${-100 - xPct}%, ${yPct}%) scale(${scale})`;
      }
      
      animFrame = requestAnimationFrame(animate);
    };
    
    animFrame = requestAnimationFrame(animate);
    
    return () => {
      running = false;
      cancelAnimationFrame(animFrame);
    };
  }, [useWebGL]);
  
  // Input handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    stateRef.current.isDragging = true;
    stateRef.current.lastMouse = { x: e.clientX, y: e.clientY };
    stateRef.current.velocityX = 0;
    stateRef.current.velocityY = 0;
    forceRender(n => n + 1);
  }, []);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const s = stateRef.current;
    if (!s.isDragging) return;
    
    const dx = e.clientX - s.lastMouse.x;
    const dy = e.clientY - s.lastMouse.y;
    const sens = useWebGL ? (s.fov / 90) * 0.004 : 0.01;
    
    s.velocityX = -dx * sens;
    s.velocityY = useWebGL ? dy * sens : -dy * sens * 0.3;
    s.yaw += s.velocityX;
    s.pitch += s.velocityY;
    s.lastMouse = { x: e.clientX, y: e.clientY };
  }, [useWebGL]);
  
  const handleMouseUp = useCallback(() => {
    stateRef.current.isDragging = false;
    forceRender(n => n + 1);
  }, []);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const s = stateRef.current;
    
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      s.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      s.isDragging = false;
    } else if (e.touches.length === 1) {
      s.isDragging = true;
      s.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      s.velocityX = 0;
      s.velocityY = 0;
    }
    forceRender(n => n + 1);
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const s = stateRef.current;
    
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (s.lastPinchDist > 0) {
        const delta = (s.lastPinchDist - dist) * 0.3;
        setFov(prev => Math.max(30, Math.min(120, prev + delta)));
      }
      s.lastPinchDist = dist;
      return;
    }
    
    if (!s.isDragging || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const dx = touch.clientX - s.lastMouse.x;
    const dy = touch.clientY - s.lastMouse.y;
    const sens = useWebGL ? (s.fov / 90) * 0.006 : 0.015;
    
    s.velocityX = -dx * sens;
    s.velocityY = useWebGL ? dy * sens : -dy * sens * 0.3;
    s.yaw += s.velocityX;
    s.pitch += s.velocityY;
    s.lastMouse = { x: touch.clientX, y: touch.clientY };
  }, [useWebGL]);
  
  const handleTouchEnd = useCallback(() => {
    stateRef.current.isDragging = false;
    stateRef.current.lastPinchDist = 0;
    forceRender(n => n + 1);
  }, []);
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setFov(prev => Math.max(30, Math.min(120, prev + (e.deltaY > 0 ? 5 : -5))));
  }, []);
  
  const resetView = useCallback(() => {
    stateRef.current.yaw = 0;
    stateRef.current.pitch = 0;
    stateRef.current.velocityX = 0;
    stateRef.current.velocityY = 0;
    setFov(90);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden ${isFullscreen ? 'fixed inset-0 z-[9999]' : ''}`}
      style={{ 
        background: '#000', 
        width: isFullscreen ? '100vw' : '100%',
        height: isFullscreen ? '100vh' : '100%',
        minHeight: '400px',
        cursor: stateRef.current.isDragging ? 'grabbing' : 'grab',
        touchAction: 'none'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Toolbar */}
      <div 
        className="absolute top-0 left-0 right-0 z-20 flex items-center gap-1 p-1.5"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)' }}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <Move className="w-3.5 h-3.5 text-white" />
          <span className="text-[10px] text-white font-medium">360° {useWebGL ? '3D' : 'Pan'}</span>
        </div>
        
        <span className="text-[9px] text-white/60 ml-2 hidden sm:inline">
          Drag to look around
        </span>
        
        <div className="flex-1" />

        <span className="text-[9px] text-white/60 mr-1">FOV: {Math.round(fov)}°</span>

        <button
          onClick={() => setIsAutoRotating(!isAutoRotating)}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            isAutoRotating ? 'bg-white/30 text-white' : 'text-white/80 hover:text-white hover:bg-white/20'
          }`}
          title="Auto-rotate"
        >
          {isAutoRotating ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <button onClick={resetView} className="w-7 h-7 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20" title="Reset">
          <RotateCcw className="w-4 h-4" />
        </button>

        {onDownload && (
          <button onClick={onDownload} className="w-7 h-7 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20" title="Download">
            <Download className="w-4 h-4" />
          </button>
        )}

        <button onClick={() => setIsFullscreen(!isFullscreen)} className="w-7 h-7 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20">
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {isFullscreen && onClose && (
          <button onClick={() => { setIsFullscreen(false); onClose(); }} className="w-7 h-7 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20 ml-1">
            <span className="text-lg">×</span>
          </button>
        )}
      </div>

      {/* WebGL Canvas */}
      {useWebGL && (
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        />
      )}
      
      {/* CSS Fallback */}
      {!useWebGL && (
        <div ref={fallbackRef} className="absolute inset-0 overflow-hidden flex items-center justify-center">
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            draggable={false}
            onLoad={() => setImageLoaded(true)}
            className="select-none"
            style={{
              height: '120%',
              width: 'auto',
              minWidth: '300%',
              objectFit: 'cover',
              transform: 'translate(-100%, 0)',
              opacity: imageLoaded ? 1 : 0
            }}
          />
        </div>
      )}
      
      {/* Loading */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: WIN95.bg }}>
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: '#000080', borderTopColor: 'transparent', borderWidth: '3px' }} />
            <span className="text-[11px]" style={{ color: WIN95.text }}>Loading 360° panorama...</span>
          </div>
        </div>
      )}

      {/* Bottom hint */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-2 pointer-events-none z-10" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)' }}>
        <div className="flex items-center gap-2 text-[10px] text-white/70">
          <Move className="w-3 h-3" />
          <span>{useWebGL ? 'True 3D sphere view' : 'Panorama pan view'} • Scroll to zoom</span>
        </div>
      </div>
    </div>
  );
});

export default Panorama360Viewer;
