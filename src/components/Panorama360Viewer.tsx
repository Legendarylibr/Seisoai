/**
 * Panorama360Viewer - Interactive 360-degree panorama viewer
 * Uses CSS transforms for universal compatibility (no WebGL/CORS issues)
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

const Panorama360Viewer = memo<Panorama360ViewerProps>(function Panorama360Viewer({ 
  src, 
  alt = '360° Panorama',
  onDownload,
  onClose 
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const animationFrameRef = useRef<number>(0);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [zoom, setZoom] = useState(1);
  
  // Pan state - represents position in the panorama (0-100%)
  const stateRef = useRef({
    panX: 50, // Start centered (0-100)
    panY: 50, // Start centered (0-100)
    velocityX: 0,
    velocityY: 0,
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    lastPinchDist: 0,
    isAutoRotating: false
  });
  
  const [, forceRender] = useState(0);
  
  // Sync auto-rotate state
  useEffect(() => {
    stateRef.current.isAutoRotating = isAutoRotating;
  }, [isAutoRotating]);
  
  // Animation loop for momentum and auto-rotate
  useEffect(() => {
    let running = true;
    
    const animate = () => {
      if (!running) return;
      
      const state = stateRef.current;
      
      // Apply momentum when not dragging
      if (!state.isDragging) {
        state.panX += state.velocityX;
        state.panY += state.velocityY;
        
        // Damping
        state.velocityX *= 0.92;
        state.velocityY *= 0.92;
        
        if (Math.abs(state.velocityX) < 0.01) state.velocityX = 0;
        if (Math.abs(state.velocityY) < 0.01) state.velocityY = 0;
      }
      
      // Auto-rotate
      if (state.isAutoRotating && !state.isDragging) {
        state.panX += 0.1;
      }
      
      // Wrap horizontal (infinite scroll)
      if (state.panX > 100) state.panX -= 100;
      if (state.panX < 0) state.panX += 100;
      
      // Clamp vertical
      state.panY = Math.max(10, Math.min(90, state.panY));
      
      // Update image position
      if (imageRef.current) {
        // The image is 300% wide, so we map 0-100 to the full range
        const xOffset = -(state.panX / 100) * 200; // -200% to 0%
        const yOffset = -(state.panY - 50) * 0.5; // Small vertical offset
        imageRef.current.style.transform = `translate(${xOffset}%, ${yOffset}%) scale(${zoom})`;
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      running = false;
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [zoom]);
  
  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    stateRef.current.isDragging = true;
    stateRef.current.lastMouse = { x: e.clientX, y: e.clientY };
    stateRef.current.velocityX = 0;
    stateRef.current.velocityY = 0;
    forceRender(n => n + 1);
  }, []);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const state = stateRef.current;
    if (!state.isDragging) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;
    
    // Sensitivity - adjust based on container width
    const sensitivity = 100 / container.clientWidth;
    
    state.velocityX = -dx * sensitivity * 1.5;
    state.velocityY = dy * sensitivity * 0.8;
    state.panX += state.velocityX;
    state.panY += state.velocityY;
    state.lastMouse = { x: e.clientX, y: e.clientY };
  }, []);
  
  const handleMouseUp = useCallback(() => {
    stateRef.current.isDragging = false;
    forceRender(n => n + 1);
  }, []);
  
  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const state = stateRef.current;
    
    if (e.touches.length === 2) {
      // Pinch start
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
    forceRender(n => n + 1);
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const state = stateRef.current;
    
    if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (state.lastPinchDist > 0) {
        const scale = dist / state.lastPinchDist;
        setZoom(prev => Math.max(0.5, Math.min(3, prev * scale)));
      }
      state.lastPinchDist = dist;
      return;
    }
    
    if (!state.isDragging || e.touches.length !== 1) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    const touch = e.touches[0];
    const dx = touch.clientX - state.lastMouse.x;
    const dy = touch.clientY - state.lastMouse.y;
    
    const sensitivity = 100 / container.clientWidth;
    
    state.velocityX = -dx * sensitivity * 2;
    state.velocityY = dy * sensitivity;
    state.panX += state.velocityX;
    state.panY += state.velocityY;
    state.lastMouse = { x: touch.clientX, y: touch.clientY };
  }, []);
  
  const handleTouchEnd = useCallback(() => {
    stateRef.current.isDragging = false;
    stateRef.current.lastPinchDist = 0;
    forceRender(n => n + 1);
  }, []);
  
  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
  }, []);
  
  // Reset view
  const resetView = useCallback(() => {
    stateRef.current.panX = 50;
    stateRef.current.panY = 50;
    stateRef.current.velocityX = 0;
    stateRef.current.velocityY = 0;
    setZoom(1);
  }, []);
  
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
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
        className="absolute top-0 left-0 right-0 z-10 flex items-center gap-1 p-1.5"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)' }}
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
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
          <span className="text-[9px] text-white/60 mr-1">Zoom:</span>
          <span className="text-[10px] text-white/80 w-10 text-center">{Math.round(zoom * 100)}%</span>
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

      {/* Panorama Image - uses 3x width for seamless wrap */}
      <div 
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ pointerEvents: 'none' }}
      >
        {/* Tripled image for seamless horizontal wrap */}
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
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease'
          }}
        />
      </div>
      
      {/* Loading overlay */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center z-5" style={{ background: WIN95.bg }}>
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: '#000080', borderTopColor: 'transparent', borderWidth: '3px' }} />
            <span className="text-[11px] font-medium" style={{ color: WIN95.text }}>Loading 360° panorama...</span>
          </div>
        </div>
      )}

      {/* Bottom hint */}
      <div 
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-2 pointer-events-none z-10"
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
