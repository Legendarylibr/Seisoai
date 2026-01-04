// Barrel export for all utilities
export { default as logger } from './logger';
export { API_URL, getApiUrl } from './apiConfig';
export { default as appMonitor } from './appMonitor';
export { default as blockchainCache } from './blockchainCache';
export { VISUAL_STYLES } from './styles';
export {
  WIN95,
  BTN,
  PANEL,
  TITLEBAR,
  TEXT,
  INPUT,
  applyHover,
  removeHover,
  applyActive,
  hoverHandlers,
  pressHandlers
} from './buttonStyles';
export {
  optimizeImage,
  optimizeImages,
  getDataUriSize,
  needsOptimization,
  stripImageMetadata,
  stripImageMetadataToDataUri,
  stripImagesMetadata,
  stripImagesMetadataToDataUri
} from './imageOptimizer';
export {
  stripVideoMetadata,
  VIDEO_METADATA_CLEANING_NOTE
} from './videoMetadata';
export {
  getVideoDuration,
  calculateVideoCredits
} from './videoUtils';

// Re-export types
export type {
  Win95Colors,
  ButtonStyle,
  PanelStyle,
  TitlebarStyle,
  TextStyle,
  InputStyle
} from './buttonStyles';



