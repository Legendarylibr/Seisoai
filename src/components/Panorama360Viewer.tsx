/**
 * Panorama360Viewer - Interactive 360-degree panorama image viewer
 * Allows users to drag/swipe to pan around equirectangular panorama images
 */
import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Move, Maximize2, Minimize2, RotateCcw, Download } from 'lucide-react';
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
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Auto-scroll to center on load
  useEffect(() => {
    if (imageLoaded && containerRef.current) {
      const container = containerRef.current;
      // Center the view horizontally
      container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
      container.scrollTop = (container.scrollHeight - container.clientHeight) / 2;
    }
  }, [imageLoaded, zoom]);

  // Mouse/touch handlers for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setStartY(e.pageY - containerRef.current.offsetTop);
    setScrollLeft(containerRef.current.scrollLeft);
    setScrollTop(containerRef.current.scrollTop);
    containerRef.current.style.cursor = 'grabbing';
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grab';
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const y = e.pageY - containerRef.current.offsetTop;
    const walkX = (x - startX) * 1.5; // Scroll speed multiplier
    const walkY = (y - startY) * 1.5;
    containerRef.current.scrollLeft = scrollLeft - walkX;
    containerRef.current.scrollTop = scrollTop - walkY;
  }, [isDragging, startX, startY, scrollLeft, scrollTop]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setStartX(touch.pageX - containerRef.current.offsetLeft);
    setStartY(touch.pageY - containerRef.current.offsetTop);
    setScrollLeft(containerRef.current.scrollLeft);
    setScrollTop(containerRef.current.scrollTop);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !containerRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const x = touch.pageX - containerRef.current.offsetLeft;
    const y = touch.pageY - containerRef.current.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    containerRef.current.scrollLeft = scrollLeft - walkX;
    containerRef.current.scrollTop = scrollTop - walkY;
  }, [isDragging, startX, startY, scrollLeft, scrollTop]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Reset view to center
  const resetView = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = (containerRef.current.scrollWidth - containerRef.current.clientWidth) / 2;
      containerRef.current.scrollTop = (containerRef.current.scrollHeight - containerRef.current.clientHeight) / 2;
      setZoom(1);
    }
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(0.5, Math.min(3, prev + delta)));
    }
  }, []);

  const viewerContent = (
    <div 
      className={`relative ${isFullscreen ? 'fixed inset-0 z-[9999]' : 'w-full h-full'}`}
      style={{ background: isFullscreen ? '#000' : 'transparent' }}
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
          Drag to look around
        </span>
        
        <div className="flex-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleZoomOut}
            className="w-6 h-6 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Zoom out"
          >
            <span className="text-sm font-bold">−</span>
          </button>
          <span className="text-[10px] text-white/80 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={handleZoomIn}
            className="w-6 h-6 flex items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            title="Zoom in"
          >
            <span className="text-sm font-bold">+</span>
          </button>
        </div>

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

      {/* Panorama container */}
      <div
        ref={containerRef}
        className={`overflow-auto ${isFullscreen ? 'w-full h-full' : 'w-full h-full'}`}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          userSelect: 'none'
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <style>{`
          div::-webkit-scrollbar { display: none; }
        `}</style>
        
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: WIN95.bg }}>
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2" style={{ borderColor: WIN95.highlight, borderTopColor: 'transparent' }} />
              <span className="text-[10px]" style={{ color: WIN95.textDisabled }}>Loading panorama...</span>
            </div>
          </div>
        )}

        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setImageLoaded(true)}
          className="select-none"
          style={{
            minWidth: `${200 * zoom}%`,
            height: isFullscreen ? `${100 * zoom}vh` : `${Math.max(100, 150 * zoom)}%`,
            objectFit: 'cover',
            display: imageLoaded ? 'block' : 'none'
          }}
        />
      </div>

      {/* Bottom hint */}
      <div 
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-2 pointer-events-none"
        style={{ 
          background: 'linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)'
        }}
      >
        <div className="flex items-center gap-2 text-[10px] text-white/70">
          <Move className="w-3 h-3" />
          <span>Drag to pan • Scroll to zoom</span>
        </div>
      </div>
    </div>
  );

  return viewerContent;
});

export default Panorama360Viewer;
