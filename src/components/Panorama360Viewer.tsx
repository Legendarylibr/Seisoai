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
  uniform float u_yaw;    // Horizontal rotation (radians)
  uniform float u_pitch;  // Vertical rotation (radians)
  uniform float u_fov;    // Field of view
  uniform float u_aspect; // Aspect ratio
  
  #define PI 3.14159265359
  
  void main() {
    // Convert screen coords to normalized device coords
    vec2 ndc = v_texCoord * 2.0 - 1.0;
    
    // Apply aspect ratio and FOV
    float fovScale = tan(u_fov * 0.5);
    vec3 rayDir = normalize(vec3(
      ndc.x * fovScale * u_aspect,
      ndc.y * fovScale,
      -1.0
    ));
    
    // Apply pitch rotation (around X axis)
    float cosPitch = cos(u_pitch);
    float sinPitch = sin(u_pitch);
    vec3 pitched = vec3(
      rayDir.x,
      rayDir.y * cosPitch - rayDir.z * sinPitch,
      rayDir.y * sinPitch + rayDir.z * cosPitch
    );
    
    // Apply yaw rotation (around Y axis)
    float cosYaw = cos(u_yaw);
    float sinYaw = sin(u_yaw);
    vec3 rotated = vec3(
      pitched.x * cosYaw + pitched.z * sinYaw,
      pitched.y,
      -pitched.x * sinYaw + pitched.z * cosYaw
    );
    
    // Convert 3D direction to equirectangular UV
    float theta = atan(rotated.x, -rotated.z);  // -PI to PI
    float phi = asin(clamp(rotated.y, -1.0, 1.0));  // -PI/2 to PI/2
    
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
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [fov, setFov] = useState(90); // Field of view in degrees
  
  // Camera state (in radians)
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const velocityXRef = useRef(0);
  const velocityYRef = useRef(0);
  
  // Drag state
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const lastPinchDistRef = useRef(0);
  
  // Initialize WebGL
  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    
    const gl = canvas.getContext('webgl', { 
      alpha: false, 
      antialias: true,
      preserveDrawingBuffer: true 
    });
    if (!gl) {
      console.error('WebGL not supported');
      return null;
    }
    
    // Compile shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return null;
    
    gl.shaderSource(vertexShader, VERTEX_SHADER);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('Vertex shader error:', gl.getShaderInfoLog(vertexShader));
      return null;
    }
    
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
      return null;
    }
    
    // Link program
    const program = gl.createProgram();
    if (!program) return null;
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
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
    
    return gl;
  }, []);
  
  // Load texture from image
  const loadTexture = useCallback((image: HTMLImageElement) => {
    const gl = glRef.current;
    if (!gl) return;
    
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Set texture parameters for equirectangular wrap
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    
    textureRef.current = texture;
    setImageLoaded(true);
  }, []);
  
  // Render frame
  const render = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const canvas = canvasRef.current;
    
    if (!gl || !program || !canvas || !textureRef.current) return;
    
    // Update canvas size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width * dpr;
    const height = rect.height * dpr;
    
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    
    gl.useProgram(program);
    
    // Set uniforms
    const yawLoc = gl.getUniformLocation(program, 'u_yaw');
    const pitchLoc = gl.getUniformLocation(program, 'u_pitch');
    const fovLoc = gl.getUniformLocation(program, 'u_fov');
    const aspectLoc = gl.getUniformLocation(program, 'u_aspect');
    
    gl.uniform1f(yawLoc, yawRef.current);
    gl.uniform1f(pitchLoc, pitchRef.current);
    gl.uniform1f(fovLoc, (fov * Math.PI) / 180);
    gl.uniform1f(aspectLoc, canvas.width / canvas.height);
    
    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    
    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, [fov]);
  
  // Animation loop
  const animate = useCallback(() => {
    // Apply momentum/inertia
    if (!isDraggingRef.current) {
      yawRef.current += velocityXRef.current;
      pitchRef.current += velocityYRef.current;
      
      // Damping
      velocityXRef.current *= 0.95;
      velocityYRef.current *= 0.95;
      
      // Stop when velocity is very small
      if (Math.abs(velocityXRef.current) < 0.0001) velocityXRef.current = 0;
      if (Math.abs(velocityYRef.current) < 0.0001) velocityYRef.current = 0;
    }
    
    // Auto-rotate
    if (isAutoRotating && !isDraggingRef.current) {
      yawRef.current += 0.002;
    }
    
    // Clamp pitch to prevent flipping
    pitchRef.current = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitchRef.current));
    
    render();
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [render, isAutoRotating]);
  
  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    velocityXRef.current = 0;
    velocityYRef.current = 0;
  }, []);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    
    // Sensitivity based on FOV
    const sensitivity = (fov / 90) * 0.003;
    
    velocityXRef.current = -dx * sensitivity;
    velocityYRef.current = dy * sensitivity;
    
    yawRef.current += velocityXRef.current;
    pitchRef.current += velocityYRef.current;
    
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, [fov]);
  
  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);
  
  // Touch handlers with pinch-to-zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // Prevent page scroll
    
    if (e.touches.length === 2) {
      // Pinch start - calculate initial distance
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      isDraggingRef.current = false;
    } else if (e.touches.length === 1) {
      isDraggingRef.current = true;
      const touch = e.touches[0];
      lastMouseRef.current = { x: touch.clientX, y: touch.clientY };
      velocityXRef.current = 0;
      velocityYRef.current = 0;
    }
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // Prevent page scroll
    
    if (e.touches.length === 2) {
      // Pinch-to-zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (lastPinchDistRef.current > 0) {
        const delta = (lastPinchDistRef.current - dist) * 0.2;
        setFov(prev => Math.max(30, Math.min(120, prev + delta)));
      }
      lastPinchDistRef.current = dist;
      return;
    }
    
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const dx = touch.clientX - lastMouseRef.current.x;
    const dy = touch.clientY - lastMouseRef.current.y;
    
    const sensitivity = (fov / 90) * 0.005;
    
    velocityXRef.current = -dx * sensitivity;
    velocityYRef.current = dy * sensitivity;
    
    yawRef.current += velocityXRef.current;
    pitchRef.current += velocityYRef.current;
    
    lastMouseRef.current = { x: touch.clientX, y: touch.clientY };
  }, [fov]);
  
  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
    lastPinchDistRef.current = 0;
  }, []);
  
  // Wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 5 : -5;
    setFov(prev => Math.max(30, Math.min(120, prev + delta)));
  }, []);
  
  // Reset view
  const resetView = useCallback(() => {
    yawRef.current = 0;
    pitchRef.current = 0;
    velocityXRef.current = 0;
    velocityYRef.current = 0;
    setFov(90);
  }, []);
  
  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);
  
  // Initialize on mount
  useEffect(() => {
    const gl = initWebGL();
    if (!gl) return;
    
    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => loadTexture(img);
    img.onerror = () => console.error('Failed to load panorama image');
    img.src = src;
    
    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      if (glRef.current) {
        const ext = glRef.current.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    };
  }, [src, initWebGL, loadTexture, animate]);
  
  // Restart animation when autoRotate changes
  useEffect(() => {
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [animate, isAutoRotating]);

  const viewerContent = (
    <div 
      ref={containerRef}
      className={`relative ${isFullscreen ? 'fixed inset-0 z-[9999]' : 'w-full h-full'}`}
      style={{ background: '#000', minHeight: isFullscreen ? '100vh' : '300px' }}
    >
      {/* Toolbar */}
      <div 
        className="absolute top-0 left-0 right-0 z-10 flex items-center gap-1 p-1.5"
        style={{ 
          background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)'
        }}
      >
        <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>
          <Move className="w-3.5 h-3.5 text-white" />
          <span className="text-[10px] text-white font-medium">360° Panorama</span>
        </div>
        
        <span className="text-[9px] text-white/60 ml-2 hidden sm:inline">
          Drag to look around • Scroll to zoom
        </span>
        
        <div className="flex-1" />

        {/* FOV indicator */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-white/60 mr-1">FOV:</span>
          <span className="text-[10px] text-white/80 w-8 text-center">{Math.round(fov)}°</span>
        </div>

        {/* Auto-rotate toggle */}
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
        className="w-full h-full"
        style={{
          cursor: isDraggingRef.current ? 'grabbing' : 'grab',
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
        style={{ 
          background: 'linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)'
        }}
      >
        <div className="flex items-center gap-2 text-[10px] text-white/70">
          <Move className="w-3 h-3" />
          <span className="hidden sm:inline">Drag to explore • Scroll to zoom • {isAutoRotating ? 'Auto-rotating' : 'Click ▶ to auto-rotate'}</span>
          <span className="sm:hidden">Drag to look around • Pinch to zoom</span>
        </div>
      </div>
    </div>
  );

  return viewerContent;
});

export default Panorama360Viewer;
