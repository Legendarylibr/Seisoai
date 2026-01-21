/**
 * PublicGallery Component
 * Display public gallery items with sharing and embedding options
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Image, Film, Box, ExternalLink, Copy, Check, ChevronLeft, ChevronRight, X, Code } from 'lucide-react';
import { BTN, PANEL, WIN95, hoverHandlers, WINDOW_TITLE_STYLE } from '../utils/buttonStyles';
import { API_URL } from '../utils/apiConfig';
import { copyToClipboard, generateShareUrls } from '../services/referralService';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import logger from '../utils/logger';

interface GalleryItem {
  id: string;
  type: 'image' | 'video' | '3d';
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  style?: string;
  createdAt: string;
}

interface PublicGalleryProps {
  featured?: boolean;
  limit?: number;
  showHeader?: boolean;
}

const PublicGallery: React.FC<PublicGalleryProps> = ({ 
  featured = false, 
  limit = 12,
  showHeader = true 
}) => {
  const { isAuthenticated } = useEmailAuth();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [embedCode, setEmbedCode] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | '3d'>('all');

  // Fetch gallery items
  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const endpoint = featured 
        ? `${API_URL}/api/gallery/featured`
        : `${API_URL}/api/gallery/public?page=${page}&limit=${limit}&type=${filter}`;
      
      const response = await fetch(endpoint);
      const data = await response.json();
      
      if (data.success) {
        setItems(data.items || []);
        if (data.pagination) {
          setTotalPages(data.pagination.pages || 1);
        }
      }
    } catch (error) {
      logger.error('Failed to fetch gallery', { error: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [featured, page, limit, filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Handle copy link
  const handleCopyLink = async (item: GalleryItem) => {
    const url = `${window.location.origin}/gallery/${item.id}`;
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(item.id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  // Get embed code
  const handleGetEmbed = async (item: GalleryItem) => {
    try {
      const response = await fetch(`${API_URL}/api/gallery/public/${item.id}/embed`);
      const data = await response.json();
      if (data.success) {
        setEmbedCode(data.embedHtml);
      }
    } catch (error) {
      logger.error('Failed to get embed code', { error: (error as Error).message });
    }
  };

  // Type icons
  const typeIcons = {
    image: <Image className="w-4 h-4" />,
    video: <Film className="w-4 h-4" />,
    '3d': <Box className="w-4 h-4" />
  };

  return (
    <div className="w-full">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <h2 
            className="text-lg font-bold"
            style={{ color: WIN95.text }}
          >
            {featured ? 'Featured Creations' : 'Community Gallery'}
          </h2>
          
          {!featured && (
            <div className="flex gap-1">
              {(['all', 'image', 'video', '3d'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => { setFilter(type); setPage(1); }}
                  className="px-2 py-1 text-xs capitalize"
                  style={filter === type ? BTN.active : BTN.base}
                  {...hoverHandlers}
                >
                  {type === 'all' ? 'All' : type === '3d' ? '3D' : type}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="text-center" style={{ color: WIN95.text }}>
            Loading gallery...
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12" style={{ color: WIN95.textDisabled }}>
          No items found. Be the first to share your creation!
        </div>
      ) : (
        <>
          {/* Gallery Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative aspect-square overflow-hidden cursor-pointer group"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}
                onClick={() => setSelectedItem(item)}
              >
                {item.type === 'video' ? (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                  />
                ) : (
                  <img
                    src={item.thumbnailUrl || item.url}
                    alt={item.prompt?.substring(0, 50) || 'AI Generated'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
                
                {/* Type badge */}
                <div 
                  className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] flex items-center gap-1"
                  style={{ 
                    background: 'rgba(0,0,0,0.7)', 
                    color: '#fff',
                    borderRadius: '2px'
                  }}
                >
                  {typeIcons[item.type]}
                </div>
                
                {/* Hover overlay */}
                <div 
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"
                  style={{ background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8))' }}
                >
                  <p className="text-[10px] text-white line-clamp-2">
                    {item.prompt?.substring(0, 80) || 'No description'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {!featured && totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs flex items-center gap-1"
                style={page === 1 ? BTN.disabled : BTN.base}
                {...(page !== 1 ? hoverHandlers : {})}
              >
                <ChevronLeft className="w-3 h-3" />
                Prev
              </button>
              
              <span className="px-3 py-1 text-xs" style={{ color: WIN95.text }}>
                Page {page} of {totalPages}
              </span>
              
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs flex items-center gap-1"
                style={page === totalPages ? BTN.disabled : BTN.base}
                {...(page !== totalPages ? hoverHandlers : {})}
              >
                Next
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Item Modal */}
      {selectedItem && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelectedItem(null)}
        >
          <div 
            className="max-w-3xl w-full max-h-[90vh] overflow-hidden"
            style={PANEL.window}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title Bar */}
            <div 
              className="flex items-center justify-between px-2 py-1"
              style={WINDOW_TITLE_STYLE}
            >
              <div className="flex items-center gap-2">
                {typeIcons[selectedItem.type]}
                <span className="text-sm font-bold truncate">
                  {selectedItem.prompt?.substring(0, 40) || 'AI Creation'}
                </span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-5 h-5 flex items-center justify-center text-xs"
                style={BTN.small}
                {...hoverHandlers}
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto" style={{ background: WIN95.bg, maxHeight: 'calc(90vh - 100px)' }}>
              {/* Media */}
              <div 
                className="w-full mb-4 overflow-hidden"
                style={{
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}
              >
                {selectedItem.type === 'video' ? (
                  <video
                    src={selectedItem.url}
                    className="w-full"
                    controls
                    autoPlay
                    loop
                  />
                ) : (
                  <img
                    src={selectedItem.url}
                    alt={selectedItem.prompt || 'AI Generated'}
                    className="w-full"
                  />
                )}
              </div>

              {/* Info */}
              <div className="mb-4">
                <h3 className="text-sm font-bold mb-1" style={{ color: WIN95.text }}>
                  Prompt
                </h3>
                <p className="text-xs" style={{ color: WIN95.text }}>
                  {selectedItem.prompt || 'No prompt available'}
                </p>
                {selectedItem.style && (
                  <p className="text-xs mt-1" style={{ color: WIN95.textDisabled }}>
                    Style: {selectedItem.style}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleCopyLink(selectedItem)}
                  className="px-3 py-1.5 text-xs flex items-center gap-1"
                  style={BTN.base}
                  {...hoverHandlers}
                >
                  {copied === selectedItem.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === selectedItem.id ? 'Copied!' : 'Copy Link'}
                </button>
                
                <button
                  onClick={() => handleGetEmbed(selectedItem)}
                  className="px-3 py-1.5 text-xs flex items-center gap-1"
                  style={BTN.base}
                  {...hoverHandlers}
                >
                  <Code className="w-3 h-3" />
                  Get Embed
                </button>
                
                <a
                  href={selectedItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs flex items-center gap-1"
                  style={BTN.base}
                >
                  <ExternalLink className="w-3 h-3" />
                  Open
                </a>
              </div>

              {/* Embed Code */}
              {embedCode && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold mb-1" style={{ color: WIN95.text }}>
                    Embed Code
                  </h4>
                  <div 
                    className="p-2 text-[10px] font-mono overflow-x-auto"
                    style={{
                      background: WIN95.inputBg,
                      color: WIN95.text,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`
                    }}
                  >
                    <pre>{embedCode}</pre>
                  </div>
                  <button
                    onClick={async () => {
                      await copyToClipboard(embedCode);
                      setCopied('embed');
                      setTimeout(() => setCopied(null), 2000);
                    }}
                    className="mt-2 px-2 py-1 text-xs"
                    style={BTN.base}
                    {...hoverHandlers}
                  >
                    {copied === 'embed' ? 'Copied!' : 'Copy Embed Code'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicGallery;
