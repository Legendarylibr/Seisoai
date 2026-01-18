/**
 * Panorama360Viewer - True 360-degree spherical panorama viewer
 * Uses WebGL to render equirectangular images on a sphere with proper camera rotation
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

// Vertex shader - renders a full-screen quad
const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Fragment shader - projects equirectangular image onto sphere
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
    vec3 rayDir = normalize(vec3(
      ndc.x * fovScale * u_aspect,
      ndc.y * fovScale,
      -1.0
    ));
    
    float cosPitch = cos(u_pitch);
    float sinPitch = sin(u_pitch);
    vec3 pitched = vec3(
      rayDir.x,
      rayDir.y * cosPitch - rayDir.z * sinPitch,
      rayDir.y * sinPitch + rayDir.z * cosPitch
    );
    
    float cosYaw = cos(u_yaw);
    float sinYaw = sin(u_yaw);
    vec3 rotated = vec3(
      pitched.x * cosYaw + pitched.z * sinYaw,
      pitched.y,
      -pitched.x * sinYaw + pitched.z * cosYaw
    );
    
    float theta = atan(rotated.x, -rotated.z);
    float phi = asin(clamp(rotated.y, -1.0, 1.0));
    
    vec2 uv = vec2(
      (theta / PI + 1.0) * 0.5,
      (phi / PI + 0.5)
    );
    
    gl_FragColor = texture2D(u_texture, uv);
  }
`;

const Panorama360Viewer = memo<Panorama360ViewerProps>(function Panorama360Viewer({ 
  src, 
  alt = '360° Panorama',
  onDownload,
  onClose 
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameRef = useRef<number>(0);
  const isRunningRef = useRef(false);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [fov, setFov] = useState(90);
  const [, forceUpdate] = useState(0);
  
  // All animation state in refs to avoid recreating callbacks
  const stateRef = useRef({
    yaw: 0,
    pitch: 0,
    velocityX: 0,
    velocityY: 0,
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    lastPinchDist: 0,
    fov: 90,
    isAutoRotating: false
  });
  
  // Keep refs in sync with state
  useEffect(() => {
    stateRef.current.fov = fov;
  }, [fov]);
  
  useEffect(() => {
    stateRef.current.isAutoRotating = isAutoRotating;
  }, [isAutoRotating]);

  // Initialize WebGL - only once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const gl = canvas.getContext('webgl', { 
      alpha: false, 
      antialias: true,
      preserveDrawingBuffer: true 
    });
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    
    // Compile shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;
    
    gl.shaderSource(vertexShader, VERTEX_SHADER);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('Vertex shader error:', gl.getShaderInfoLog(vertexShader));
      return;
    }
    
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
      return;
    }
    
    const program = gl.createProgram();
    if (!program) return;
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    
    // Create fullscreen quad
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    
    programRef.current = program;
    glRef.current = gl;
    
    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!gl) return;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      textureRef.current = texture;
      setImageLoaded(true);
    };
    img.onerror = () => console.error('Failed to load panorama image');
    img.src = src;
    
    // Animation loop
    const animate = () => {
      if (!isRunningRef.current) return;
      
      const state = stateRef.current;
      const gl = glRef.current;
      const program = programRef.current;
      const canvas = canvasRef.current;
      
      // Apply momentum when not dragging
      if (!state.isDragging) {
        state.yaw += state.velocityX;
        state.pitch += state.velocityY;
        state.velocityX *= 0.95;
        state.velocityY *= 0.95;
        if (Math.abs(state.velocityX) < 0.0001) state.velocityX = 0;
        if (Math.abs(state.velocityY) < 0.0001) state.velocityY = 0;
      }
      
      // Auto-rotate
      if (state.isAutoRotating && !state.isDragging) {
        state.yaw += 0.003;
      }
      
      // Clamp pitch
      state.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.pitch));
      
      // Render
      if (gl && program && canvas && textureRef.current) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(rect.width * dpr);
        const height = Math.floor(rect.height * dpr);
        
        if (width > 0 && height > 0) {
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          gl.viewport(0, 0, width, height);
          gl.useProgram(program);
          
          gl.uniform1f(gl.getUniformLocation(program, 'u_yaw'), state.yaw);
          gl.uniform1f(gl.getUniformLocation(program, 'u_pitch'), state.pitch);
          gl.uniform1f(gl.getUniformLocation(program, 'u_fov'), (state.fov * Math.PI) / 180);
          gl.uniform1f(gl.getUniformLocation(program, 'u_aspect'), width / height);
          
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
          gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
          
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    isRunningRef.current = true;
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      isRunningRef.current = false;
      cancelAnimationFrame(animationFrameRef.current);
      if (glRef.current) {
        const ext = glRef.current.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    };
  }, [src]);
  
  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    stateRef.current.isDragging = true;
    stateRef.current.lastMouse = { x: e.clientX, y: e.clientY };
    stateRef.current.velocityX = 0;
    stateRef.current.velocityY = 0;
    forceUpdate(n => n + 1);
  }, []);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const state = stateRef.current;
    if (!state.isDragging) return;
    
    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;
    
    const sensitivity = (state.fov / 90) * 0.004;
    
    state.velocityX = -dx * sensitivity;
    state.velocityY = dy * sensitivity;
    state.yaw += state.velocityX;
    state.pitch += state.velocityY;
    state.lastMouse = { x: e.clientX, y: e.clientY };
  }, []);
  
  const handleMouseUp = useCallback(() => {
    stateRef.current.isDragging = false;
    forceUpdate(n => n + 1);
  }, []);
  
  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const state = stateRef.current;
    
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      state.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      state.isDragging = false;
    } else if (e.touches.length === 1) {
      state.isDragging = true;
      state.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      state.velocityX = 0;
      state.velocityY = 0;
    }
    forceUpdate(n => n + 1);
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const state = stateRef.current;
    
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (state.lastPinchDist > 0) {
        const delta = (state.lastPinchDist - dist) * 0.3;
        const newFov = Math.max(30, Math.min(120, state.fov + delta));
        state.fov = newFov;
        setFov(newFov);
      }
      state.lastPinchDist = dist;
      return;
    }
    
    if (!state.isDragging || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const dx = touch.clientX - state.lastMouse.x;
    const dy = touch.clientY - state.lastMouse.y;
    
    const sensitivity = (state.fov / 90) * 0.006;
    
    state.velocityX = -dx * sensitivity;
    state.velocityY = dy * sensitivity;
    state.yaw += state.velocityX;
    state.pitch += state.velocityY;
    state.lastMouse = { x: touch.clientX, y: touch.clientY };
  }, []);
  
  const handleTouchEnd = useCallback(() => {
    stateRef.current.isDragging = false;
    stateRef.current.lastPinchDist = 0;
    forceUpdate(n => n + 1);
  }, []);
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 5 : -5;
    const newFov = Math.max(30, Math.min(120, stateRef.current.fov + delta));
    stateRef.current.fov = newFov;
    setFov(newFov);
  }, []);
  
  const resetView = useCallback(() => {
    stateRef.current.yaw = 0;
    stateRef.current.pitch = 0;
    stateRef.current.velocityX = 0;
    stateRef.current.velocityY = 0;
    stateRef.current.fov = 90;
    setFov(90);
  }, []);
  
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`relative ${isFullscreen ? 'fixed inset-0 z-[9999]' : 'w-full h-full'}`}
      style={{ background: '#000', minHeight: isFullscreen ? '100vh' : '400px' }}
    >
      {/* Toolbar */}
      <div 
        className="absolute top-0 left-0 right-0 z-10 flex items-center gap-1 p-1.5"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)' }}
      >
        <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <Move className="w-3.5 h-3.5 text-white" />
          <span className="text-[10px] text-white font-medium">360° Panorama</span>
        </div>
        
        <span className="text-[9px] text-white/60 ml-2 hidden sm:inline">
          Drag to look around • Scroll to zoom
        </span>
        
        <div className="flex-1" />

        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-white/60 mr-1">FOV:</span>
          <span className="text-[10px] text-white/80 w-8 text-center">{Math.round(fov)}°</span>
        </div>

        <button
          onClick={() => setIsAutoRotating(!isAutoRotating)}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            isAutoRotating ? 'bg-white/30 text-white' : 'text-white/80 hover:text-white hover:bg-white/20'
          }`}
          title={isAutoRotating ? 'Stop auto-rotate' : 'Auto-rotate'}
        >
          {isAutoRotating ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <button
          onClick={resetView}
          className="w-7 h-7 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
          title="Reset view"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {onDownload && (
          <button
            onClick={onDownload}
            className="w-7 h-7 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={toggleFullscreen}
          className="w-7 h-7 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {isFullscreen && onClose && (
          <button
            onClick={() => { setIsFullscreen(false); onClose(); }}
            className="w-7 h-7 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors ml-1"
            title="Close"
          >
            <span className="text-lg">×</span>
          </button>
        )}
      </div>

      {/* WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
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
      />
      
      {/* Loading overlay */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: WIN95.bg }}>
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: '#000080', borderTopColor: 'transparent', borderWidth: '3px' }} />
            <span className="text-[11px] font-medium" style={{ color: WIN95.text }}>Loading 360° panorama...</span>
          </div>
        </div>
      )}

      {/* Bottom hint */}
      <div 
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-2 pointer-events-none"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)' }}
      >
        <div className="flex items-center gap-2 text-[10px] text-white/70">
          <Move className="w-3 h-3" />
          <span className="hidden sm:inline">Drag to explore • Scroll to zoom • {isAutoRotating ? 'Auto-rotating' : 'Click ▶ to auto-rotate'}</span>
          <span className="sm:hidden">Drag to look around • Pinch to zoom</span>
        </div>
      </div>
    </div>
  );
});

export default Panorama360Viewer;
