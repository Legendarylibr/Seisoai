/**
 * AspectRatioSelector - Win95-styled aspect ratio selection for image generation
 */
import { memo } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Win95GroupBox, Win95Button } from './ui/Win95';
import { Maximize2 } from 'lucide-react';

// Aspect ratio options matching falService.ts ASPECT_RATIO_MAP
const ASPECT_RATIO_OPTIONS = [
  { value: 'square', label: '1:1', icon: '⬜', description: 'Square' },
  { value: 'landscape_16_9', label: '16:9', icon: '🖥️', description: 'Widescreen' },
  { value: 'landscape_4_3', label: '4:3', icon: '📺', description: 'Standard' },
  { value: 'portrait_16_9', label: '9:16', icon: '📱', description: 'Vertical' },
  { value: 'portrait_4_3', label: '3:4', icon: '📷', description: 'Portrait' },
  { value: 'ultra_wide', label: '21:9', icon: '🎬', description: 'Ultrawide' }
];

interface AspectRatioSelectorProps {
  /** Optional compact mode for inline display */
  compact?: boolean;
}

const AspectRatioSelector = memo<AspectRatioSelectorProps>(function AspectRatioSelector({ 
  compact = false 
}) {
  const { imageSize, setImageSize } = useImageGenerator();

  if (compact) {
    // Compact inline selector
    return (
      <div className="flex items-center gap-1">
        <span className="text-[9px] font-bold" style={{ color: 'var(--win95-text)', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          Ratio:
        </span>
        <div className="flex gap-0.5">
          {ASPECT_RATIO_OPTIONS.slice(0, 4).map((opt) => (
            <Win95Button
              key={opt.value}
              onClick={() => setImageSize(opt.value)}
              active={imageSize === opt.value}
              className="px-1.5 py-0.5 text-[8px]"
              title={`${opt.description} (${opt.label})`}
            >
              {opt.icon}
            </Win95Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Win95GroupBox title="Aspect Ratio" icon={<Maximize2 className="w-3.5 h-3.5" />}>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
        {ASPECT_RATIO_OPTIONS.map((opt) => (
          <Win95Button
            key={opt.value}
            onClick={() => setImageSize(opt.value)}
            active={imageSize === opt.value}
            className="flex flex-col items-center py-1.5 px-1"
          >
            <span className="text-base">{opt.icon}</span>
            <span className="text-[9px] font-bold">{opt.label}</span>
            <span className="text-[7px]" style={{ color: 'var(--win95-text-disabled)' }}>
              {opt.description}
            </span>
          </Win95Button>
        ))}
      </div>
    </Win95GroupBox>
  );
});

export default AspectRatioSelector;
