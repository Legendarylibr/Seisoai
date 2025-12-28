import React, { useState, useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Download, Trash2, Eye, Calendar, Palette, Sparkles, X, Video, Play, Image as ImageIcon } from 'lucide-react';
import { getGallery } from '../services/galleryService';
import logger from '../utils/logger.js';

const ImageGallery = () => {
  const { generationHistory, clearAll } = useImageGenerator();
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  const [selectedItem, setSelectedItem] = useState(null);
  const [galleryItems, setGalleryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch gallery from database
  useEffect(() => {
    const fetchGallery = async () => {
      try {
        setLoading(true);
        const isEmailAuth = emailContext.isAuthenticated;
        const userIdentifier = isEmailAuth 
          ? emailContext.userId 
          : walletContext.address;

        if (!userIdentifier) {
          setLoading(false);
          return;
        }

        // Check if identifier is a wallet address or userId
        const isWalletAddress = userIdentifier?.startsWith('0x') || 
                               (userIdentifier && userIdentifier.length > 20 && !userIdentifier.startsWith('email_'));
        
        const normalizedIdentifier = isWalletAddress && userIdentifier?.startsWith('0x')
          ? userIdentifier.toLowerCase() 
          : userIdentifier;

        const response = await getGallery(normalizedIdentifier);
        
        if (response.success && response.gallery) {
          // Combine database gallery with in-memory history
          const dbItems = response.gallery.map(item => ({
            id: item.id,
            image: item.imageUrl || item.videoUrl, // Support both
            imageUrl: item.imageUrl,
            videoUrl: item.videoUrl,
            prompt: item.prompt,
            style: { name: item.style || 'Unknown' },
            timestamp: item.timestamp,
            isVideo: !!item.videoUrl
          }));
          
          // Merge with in-memory history (prefer database items)
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
          
          // Combine and deduplicate by id
          const allItems = [...dbItems, ...memoryItems];
          const uniqueItems = Array.from(
            new Map(allItems.map(item => [item.id, item])).values()
          );
          
          setGalleryItems(uniqueItems.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          ));
        }
      } catch (err) {
        logger.error('Failed to fetch gallery', { error: err.message });
        setError(err.message);
        // Fallback to in-memory history
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
  }, [walletContext.address, emailContext.isAuthenticated, emailContext.userId, generationHistory.length]);

  // Show all items (no filtering)
  const filteredHistory = galleryItems;

  // Helper function to strip metadata from image by converting through canvas
  const stripImageMetadata = (imageUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // Convert to blob without metadata
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert image to blob'));
            }
          }, 'image/png');
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = imageUrl;
    });
  };

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
        // For videos, fetch as-is (can't strip metadata from videos easily)
        const response = await fetch(url);
        blob = await response.blob();
      } else {
        // For images, strip metadata by converting through canvas
        blob = await stripImageMetadata(url);
      }
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Detect iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      if (isIOS) {
        // iOS Safari requires opening in new tab for download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        // Add to DOM temporarily (required for iOS)
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Trigger download with click event
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(clickEvent);
        
        // Cleanup after a delay for iOS
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
      } else {
        // Standard download for other browsers
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
      // Fallback: for images, try to strip metadata; for videos, direct download
      if (!isVideo) {
        try {
          const cleanBlob = await stripImageMetadata(url);
          const blobUrl = window.URL.createObjectURL(cleanBlob);
          const link = document.createElement('a');
          link.href = blobUrl;
          try {
            const key = 'seiso_download_index';
            const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
            const next = current + 1;
            localStorage.setItem(key, String(next));
            link.download = `seiso${next}.png`;
          } catch (_) {
            link.download = `seiso${Date.now()}.png`;
          }
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
          return;
        } catch (fallbackError) {
          logger.error('Fallback download failed:', { error: fallbackError.message });
        }
      }
      // Final fallback: direct link
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
      <div className="text-center py-16 md:py-24 fade-in">
        <div className="glass-card w-32 h-32 mx-auto mb-8 flex items-center justify-center rounded-2xl relative overflow-hidden">
          <div className="absolute inset-0 rounded-full" style={{
            background: 'conic-gradient(from 0deg, transparent, #00d4ff, transparent)',
            animation: 'spin 1.5s linear infinite'
          }}></div>
          <div className="absolute inset-2 rounded-2xl" style={{
            background: 'linear-gradient(135deg, #f0f0f8, #e8e8f0)',
            boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.8)'
          }}></div>
          <Sparkles className="w-10 h-10 relative z-10 animate-pulse" style={{ color: '#00d4ff' }} />
        </div>
        <h3 className="text-2xl md:text-3xl font-bold mb-3 tracking-wide" style={{ 
          color: '#000000', 
          textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)',
          fontFamily: "'VT323', monospace"
        }}>LOADING GALLERY...</h3>
      </div>
    );
  }

  if (filteredHistory.length === 0 && galleryItems.length === 0) {
    return (
      <div className="text-center py-16 md:py-24 fade-in">
        <div className="glass-card w-36 h-36 mx-auto mb-8 flex items-center justify-center rounded-2xl relative overflow-hidden">
          {/* Corner accents */}
          <div className="absolute top-2 left-2 w-4 h-4" style={{
            borderTop: '2px solid #00b8a9',
            borderLeft: '2px solid #00b8a9',
            opacity: 0.5
          }}></div>
          <div className="absolute bottom-2 right-2 w-4 h-4" style={{
            borderBottom: '2px solid #f59e0b',
            borderRight: '2px solid #f59e0b',
            opacity: 0.5
          }}></div>
          <svg viewBox="0 0 24 24" fill="none" className="w-16 h-16" style={{ color: '#a0a0b8' }}>
            <path
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
              fill="currentColor"
            />
          </svg>
        </div>
        <h3 className="text-2xl md:text-3xl font-bold mb-3 tracking-wide" style={{ 
          color: '#000000', 
          textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)',
          fontFamily: "'VT323', monospace"
        }}>NO IMAGES YET</h3>
        <p className="text-base mb-8" style={{ 
          color: '#1a1a2e', 
          textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)',
          fontFamily: "'IBM Plex Mono', monospace"
        }}>Start generating images to see them here</p>
        <button
          onClick={() => window.location.href = '#generate'}
          className="btn-primary flex items-center gap-2 mx-auto slide-up"
        >
          <Sparkles className="w-5 h-5" />
          Generate Your First Image
        </button>
      </div>
    );
  }

  return (
    <div className="section-spacing fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="slide-up">
          <h2 className="text-3xl md:text-4xl font-bold mb-2 tracking-wide" style={{ 
            color: '#000000', 
            textShadow: '2px 2px 0 rgba(255, 255, 255, 0.9), 0 0 10px rgba(0, 212, 255, 0.2)',
            fontFamily: "'VT323', monospace",
            letterSpacing: '0.05em'
          }}>YOUR GALLERY</h2>
          <p className="text-base" style={{ 
            color: '#1a1a2e', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.7)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            {galleryItems.length} {galleryItems.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        <button
          onClick={clearAll}
          className="btn-primary flex items-center gap-2 slide-up px-4 py-2"
          style={{ animationDelay: '100ms' }}
        >
          <Trash2 className="w-4 h-4" />
          Clear All
        </button>
      </div>


      {/* Gallery Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {filteredHistory.map((item, index) => {
          const displayUrl = item.videoUrl || item.imageUrl || item.image;
          const isVideo = item.isVideo || !!item.videoUrl;
          
          return (
            <div
              key={item.id}
              className="glass-card rounded-2xl overflow-hidden group cursor-pointer slide-up card-hover"
              onClick={() => setSelectedItem(item)}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="aspect-square relative overflow-hidden">
                {isVideo ? (
                  <video
                    src={displayUrl}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
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
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                    onError={(e) => {
                      logger.error('Gallery item failed to load:', { imageUrl: displayUrl });
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23333" width="400" height="400"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="sans-serif" font-size="14"%3EItem not available%3C/text%3E%3C/svg%3E';
                    }}
                  />
                )}
                {isVideo && (
                  <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5">
                    <Video className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-white">
                    {isVideo ? <Play className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                    <span className="text-sm font-medium">View</span>
                  </div>
                </div>
              </div>
            <div className="p-3" style={{ 
              background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.05), transparent)'
            }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{item.style?.emoji}</span>
                <h3 className="font-semibold text-xs truncate" style={{ 
                  color: '#000000', 
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)',
                  fontFamily: "'IBM Plex Mono', monospace"
                }}>{item.style?.name || 'Untitled'}</h3>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] mb-2" style={{ 
                color: '#1a1a2e', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
              }}>
                <Calendar className="w-3 h-3" />
                {formatDate(item.timestamp)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ 
                  background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(0, 184, 230, 0.1))',
                  color: '#006688',
                  border: '1px solid rgba(0, 212, 255, 0.3)'
                }}>
                  {item.style?.category || 'Uncategorized'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(displayUrl, item.style?.name, isVideo);
                  }}
                  className="p-1.5 rounded transition-all duration-300 hover:scale-110"
                  style={{
                    background: 'linear-gradient(135deg, #f0f0f0, #e0e0e0)',
                    border: '1px solid #d0d0d0'
                  }}
                >
                  <Download className="w-3.5 h-3.5" style={{ color: '#000000' }} />
                </button>
              </div>
            </div>
          </div>
        );
        })}
      </div>


      {/* Item Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl max-w-4xl max-h-[90vh] overflow-hidden slide-up">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-teal-500/10 to-blue-500/10">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-teal-500/20 rounded-lg">
                  {selectedItem.isVideo ? (
                    <Video className="w-6 h-6 text-teal-400" />
                  ) : (
                    <span className="text-3xl">{selectedItem.style?.emoji || '🎨'}</span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">{selectedItem.style?.name || selectedItem.prompt || 'Untitled'}</h3>
                  <p className="text-sm text-gray-400 mt-1">{selectedItem.style?.category || 'Uncategorized'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 rounded-lg hover:bg-white/20 transition-all duration-300 hover:scale-110"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>
            <div className="p-6">
              {selectedItem.isVideo || selectedItem.videoUrl ? (
                <video
                  src={selectedItem.videoUrl || selectedItem.image}
                  controls
                  className="w-full h-auto max-w-full max-h-[60vh] sm:max-h-[70vh] md:max-h-[80vh] object-contain mx-auto rounded-xl shadow-2xl"
                  style={{ 
                    maxWidth: '100%', 
                    height: 'auto',
                    display: 'block'
                  }}
                />
              ) : (
                <img
                  src={selectedItem.imageUrl || selectedItem.image}
                  alt="Generated content"
                  className="w-full h-auto max-w-full max-h-[60vh] sm:max-h-[70vh] md:max-h-[80vh] object-contain mx-auto rounded-xl shadow-2xl"
                  style={{ 
                    maxWidth: '100%', 
                    height: 'auto',
                    display: 'block'
                  }}
                  loading="lazy"
                  onError={(e) => {
                    logger.error('Modal item failed to load:', { imageUrl: selectedItem.imageUrl || selectedItem.image });
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect fill="%23333" width="800" height="600"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="sans-serif" font-size="16"%3EItem not available%3C/text%3E%3C/svg%3E';
                  }}
                />
              )}
              <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="text-sm text-gray-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Generated on {formatDate(selectedItem.timestamp)}
                </div>
                <button
                  onClick={() => handleDownload(
                    selectedItem.videoUrl || selectedItem.imageUrl || selectedItem.image, 
                    selectedItem.style?.name,
                    selectedItem.isVideo || !!selectedItem.videoUrl
                  )}
                  className="btn-primary flex items-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGallery;
