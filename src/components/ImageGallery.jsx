import React, { useState, useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Download, Trash2, Eye, Calendar, Palette, Sparkles, X, Video, Play, Image as ImageIcon, Grid } from 'lucide-react';
import { getGallery } from '../services/galleryService';
import logger from '../utils/logger.js';
import { WIN95 } from '../utils/buttonStyles';
import { stripImageMetadata } from '../utils/imageOptimizer.js';

// Win95 button component
const Win95Button = ({ children, onClick, disabled, className = '', style = {} }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-3 py-1.5 text-[11px] font-bold transition-none select-none ${className}`}
    style={{
      background: WIN95.buttonFace,
      color: disabled ? WIN95.textDisabled : WIN95.text,
      border: 'none',
      boxShadow: disabled
        ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
        : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
      cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
      ...style
    }}
  >
    {children}
  </button>
);

const ImageGallery = () => {
  const { generationHistory, clearAll } = useImageGenerator();
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  const [selectedItem, setSelectedItem] = useState(null);
  const [galleryItems, setGalleryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // PERFORMANCE: Handle item selection with preloading
  const handleSelectItem = (item) => {
    const imageUrl = item.imageUrl || item.image;
    if (imageUrl && !item.isVideo && !item.videoUrl) {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'high';
      img.src = imageUrl;
    }
    setSelectedItem(item);
  };

  // Fetch gallery from database
  useEffect(() => {
    const fetchGallery = async () => {
      try {
        setLoading(true);
        setError(null);
        const isEmailAuth = emailContext.isAuthenticated;
        const userIdentifier = isEmailAuth 
          ? emailContext.userId 
          : walletContext.address;

        // Always show generation history items even if no user identifier
        const memoryItems = generationHistory.map(item => ({
          id: item.id,
          image: item.image,
          imageUrl: item.image,
          videoUrl: null,
          prompt: item.prompt,
          style: item.style,
          timestamp: item.timestamp,
          isVideo: false
        }));

        if (!userIdentifier) {
          // No user identifier, just show memory items
          logger.debug('No user identifier, showing memory items only', { 
            memoryItemsCount: memoryItems.length 
          });
          setGalleryItems(memoryItems.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          ));
          setLoading(false);
          return;
        }

        const isWalletAddress = userIdentifier?.startsWith('0x') || 
                               (userIdentifier && userIdentifier.length > 20 && !userIdentifier.startsWith('email_'));
        
        const normalizedIdentifier = isWalletAddress && userIdentifier?.startsWith('0x')
          ? userIdentifier.toLowerCase() 
          : userIdentifier;

        try {
          const response = await getGallery(normalizedIdentifier);
          
          if (response && response.success && Array.isArray(response.gallery)) {
            const dbItems = response.gallery.map(item => ({
              id: item.id,
              image: item.imageUrl || item.videoUrl,
              imageUrl: item.imageUrl,
              videoUrl: item.videoUrl,
              prompt: item.prompt,
              style: { name: item.style || 'Unknown' },
              timestamp: item.timestamp,
              isVideo: !!item.videoUrl
            }));
            
            const allItems = [...dbItems, ...memoryItems];
            const uniqueItems = Array.from(
              new Map(allItems.map(item => [item.id, item])).values()
            );
            
            setGalleryItems(uniqueItems.sort((a, b) => 
              new Date(b.timestamp) - new Date(a.timestamp)
            ));
            logger.debug('Gallery items loaded', { 
              dbItems: dbItems.length, 
              memoryItems: memoryItems.length, 
              total: uniqueItems.length 
            });
          } else {
            // API returned but format unexpected, use memory items
            logger.warn('Gallery API response format unexpected', { response });
            setGalleryItems(memoryItems.sort((a, b) => 
              new Date(b.timestamp) - new Date(a.timestamp)
            ));
          }
        } catch (apiErr) {
          // API call failed, but still show memory items
          logger.error('Failed to fetch gallery from API', { error: apiErr.message });
          setError(apiErr.message);
          setGalleryItems(memoryItems.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          ));
        }
      } catch (err) {
        logger.error('Failed to fetch gallery', { error: err.message });
        setError(err.message);
        // Fallback to generation history
        setGalleryItems(generationHistory.map(item => ({
          id: item.id,
          image: item.image,
          imageUrl: item.image,
          videoUrl: null,
          prompt: item.prompt,
          style: item.style,
          timestamp: item.timestamp,
          isVideo: false
        })));
      } finally {
        setLoading(false);
      }
    };

    fetchGallery();
  }, [walletContext.address, emailContext.isAuthenticated, emailContext.userId, generationHistory]);

  const filteredHistory = galleryItems;


  const handleDownload = async (url, styleName, isVideo = false) => {
    if (!url) return;
    
    try {
      const getNextSeisoFilename = () => {
        try {
          const key = 'seiso_download_index';
          const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
          const next = current + 1;
          localStorage.setItem(key, String(next));
          return isVideo ? `seiso${next}.mp4` : `seiso${next}.png`;
        } catch (_) {
          return isVideo ? `seiso${Date.now()}.mp4` : `seiso${Date.now()}.png`;
        }
      };
      const filename = getNextSeisoFilename();

      let blob;
      if (isVideo) {
        // Videos: Download directly without metadata cleaning
        // Note: Browser-based video metadata cleaning is limited. Videos from AI services
        // (like fal.ai) typically have minimal metadata. For thorough metadata removal,
        // use backend FFmpeg processing (backend/utils/videoMetadata.js).
        const response = await fetch(url);
        blob = await response.blob();
      } else {
        // Images: Strip metadata before download
        blob = await stripImageMetadata(url, { format: 'png' });
      }
      
      const blobUrl = window.URL.createObjectURL(blob);
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      if (isIOS) {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(clickEvent);
        
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
      } else {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      logger.error('Download failed:', { error: error.message, url });
      const link = document.createElement('a');
      link.href = url;
      try {
        const key = 'seiso_download_index';
        const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
        const next = current + 1;
        localStorage.setItem(key, String(next));
        link.download = isVideo ? `seiso${next}.mp4` : `seiso${next}.png`;
      } catch (_) {
        link.download = isVideo ? `seiso${Date.now()}.mp4` : `seiso${Date.now()}.png`;
      }
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col" style={{ background: WIN95.bg }}>
        {/* Title bar */}
        <div 
          className="flex items-center gap-2 px-2 py-1"
          style={{ 
            background: 'linear-gradient(90deg, #000080, #1084d0)',
            color: '#ffffff',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        >
          <Grid className="w-4 h-4" />
          <span className="text-[11px] font-bold">Seiso Gallery</span>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-4">
            <div className="w-8 h-8 mx-auto mb-2 border-2 rounded-full animate-spin" style={{ borderColor: WIN95.bgDark, borderTopColor: WIN95.highlight }} />
            <span className="text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Loading Gallery...</span>
          </div>
        </div>
      </div>
    );
  }

  if (filteredHistory.length === 0 && galleryItems.length === 0) {
    return (
      <div className="h-full flex flex-col" style={{ background: WIN95.bg }}>
        {/* Title bar */}
        <div 
          className="flex items-center gap-2 px-2 py-1"
          style={{ 
            background: 'linear-gradient(90deg, #000080, #1084d0)',
            color: '#ffffff',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        >
          <Grid className="w-4 h-4" />
          <span className="text-[11px] font-bold">Seiso Gallery</span>
        </div>
        
        <div className="flex-1 flex items-center justify-center">
          <div 
            className="text-center p-6"
            style={{
              background: WIN95.bg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
            }}
          >
            <ImageIcon className="w-12 h-12 mx-auto mb-3" style={{ color: WIN95.textDisabled }} />
            <h3 className="text-[12px] font-bold mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              No Images Yet
            </h3>
            <p className="text-[10px] mb-3" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              Start generating images to see them here
            </p>
            <Win95Button onClick={() => window.location.href = '#generate'}>
              <Sparkles className="w-3 h-3 mr-1 inline" />
              Generate Your First Image
            </Win95Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: WIN95.bg }}>
      {/* Title bar */}
      <div 
        className="flex items-center justify-between px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080, #1084d0)',
          color: '#ffffff',
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <div className="flex items-center gap-2">
          <Grid className="w-4 h-4" />
          <span className="text-[11px] font-bold">Seiso Gallery - {galleryItems.length} items</span>
        </div>
      </div>
      
      {/* Toolbar */}
      <div 
        className="flex items-center gap-2 px-2 py-1"
        style={{ borderBottom: `1px solid ${WIN95.bgDark}` }}
      >
        <Win95Button onClick={clearAll}>
          <Trash2 className="w-3 h-3 mr-1 inline" />
          Clear All
        </Win95Button>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {filteredHistory.filter(item => {
            // Only show items with valid URLs
            const displayUrl = item.videoUrl || item.imageUrl || item.image;
            return displayUrl && typeof displayUrl === 'string' && displayUrl.trim() !== '';
          }).map((item, index) => {
            const displayUrl = item.videoUrl || item.imageUrl || item.image;
            const isVideo = item.isVideo || !!item.videoUrl;
            
            return (
              <div
                key={item.id || `gallery-item-${index}`}
                className="cursor-pointer group"
                onClick={() => handleSelectItem(item)}
                style={{
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                }}
              >
                <div 
                  className="aspect-square relative overflow-hidden"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                  }}
                >
                  {isVideo ? (
                    <video
                      src={displayUrl}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      onMouseEnter={(e) => e.target.play()}
                      onMouseLeave={(e) => {
                        e.target.pause();
                        e.target.currentTime = 0;
                      }}
                    />
                  ) : (
                    <img
                      src={displayUrl}
                      alt="Generated content"
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23c0c0c0" width="400" height="400"/%3E%3Ctext fill="%23808080" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="sans-serif" font-size="12"%3EUnavailable%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  )}
                  {isVideo && (
                    <div 
                      className="absolute top-1 right-1 p-1"
                      style={{ background: WIN95.bg, boxShadow: `1px 1px 0 ${WIN95.border.darker}` }}
                    >
                      <Video className="w-3 h-3" style={{ color: WIN95.text }} />
                    </div>
                  )}
                  <div 
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    style={{ background: 'rgba(0,0,128,0.7)' }}
                  >
                    <div className="flex items-center gap-1 text-white">
                      {isVideo ? <Play className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      <span className="text-[10px] font-bold">View</span>
                    </div>
                  </div>
                </div>
                <div className="p-1">
                  <div className="flex items-center justify-between">
                    <span 
                      className="text-[9px] truncate flex-1"
                      style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                    >
                      {item.style?.name || 'Untitled'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(displayUrl, item.style?.name, isVideo);
                      }}
                      className="p-0.5"
                      style={{
                        background: WIN95.buttonFace,
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <Download className="w-3 h-3" style={{ color: WIN95.text }} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Calendar className="w-2 h-2" style={{ color: WIN95.textDisabled }} />
                    <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>{formatDate(item.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Status bar */}
      <div 
        className="flex items-center px-2 py-0.5 text-[10px]"
        style={{ 
          background: WIN95.bg,
          borderTop: `1px solid ${WIN95.border.light}`,
          color: WIN95.text,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <div 
          className="flex-1 px-2 py-0.5"
          style={{
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
          }}
        >
          {galleryItems.length} items
        </div>
      </div>

      {/* Item Modal */}
      {selectedItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div 
            className="max-w-4xl max-h-[90vh] overflow-hidden"
            style={{
              background: WIN95.bg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, 4px 4px 0 ${WIN95.border.darker}`
            }}
          >
            {/* Title bar */}
            <div 
              className="flex items-center justify-between px-2 py-1"
              style={{ 
                background: 'linear-gradient(90deg, #000080, #1084d0)',
                color: '#ffffff',
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <div className="flex items-center gap-2">
                {selectedItem.isVideo ? <Video className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                <span className="text-[11px] font-bold">{selectedItem.style?.name || selectedItem.prompt || 'Untitled'}</span>
              </div>
              <Win95Button onClick={() => setSelectedItem(null)} className="px-1.5 py-0.5">
                <X className="w-3 h-3" />
              </Win95Button>
            </div>

            <div className="p-2">
              <div 
                className="overflow-hidden"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}
              >
                {selectedItem.isVideo || selectedItem.videoUrl ? (
                  <video
                    src={selectedItem.videoUrl || selectedItem.image}
                    controls
                    className="max-w-full max-h-[60vh] mx-auto block"
                  />
                ) : (
                  <img
                    src={selectedItem.imageUrl || selectedItem.image}
                    alt="Generated content"
                    className="max-w-full max-h-[60vh] mx-auto block"
                    decoding="async"
                    fetchpriority="high"
                  />
                )}
              </div>

              <div className="flex items-center justify-between mt-2 p-1" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
                <div className="flex items-center gap-1 text-[10px]" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <Calendar className="w-3 h-3" />
                  {formatDate(selectedItem.timestamp)}
                </div>
                <Win95Button
                  onClick={() => handleDownload(
                    selectedItem.videoUrl || selectedItem.imageUrl || selectedItem.image, 
                    selectedItem.style?.name,
                    selectedItem.isVideo || !!selectedItem.videoUrl
                  )}
                >
                  <Download className="w-3 h-3 mr-1 inline" />
                  Download
                </Win95Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGallery;
