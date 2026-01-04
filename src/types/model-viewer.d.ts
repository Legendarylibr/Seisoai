/**
 * Type declarations for @google/model-viewer web component
 */

declare namespace JSX {
  interface IntrinsicElements {
    'model-viewer': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        loading?: 'auto' | 'lazy' | 'eager';
        reveal?: 'auto' | 'manual';
        'auto-rotate'?: boolean | '';
        'auto-rotate-delay'?: number;
        'rotation-per-second'?: string;
        'camera-controls'?: boolean | '';
        'touch-action'?: 'pan-x' | 'pan-y' | 'none';
        'disable-zoom'?: boolean | '';
        'disable-pan'?: boolean | '';
        'disable-tap'?: boolean | '';
        'interpolation-decay'?: number;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        'min-field-of-view'?: string;
        'max-field-of-view'?: string;
        'field-of-view'?: string;
        'camera-orbit'?: string;
        'camera-target'?: string;
        'environment-image'?: string;
        'skybox-image'?: string;
        exposure?: number;
        'shadow-intensity'?: number;
        'shadow-softness'?: number;
        ar?: boolean | '';
        'ar-modes'?: string;
        'ar-scale'?: 'auto' | 'fixed';
        'ios-src'?: string;
        xr?: boolean | '';
        'animation-name'?: string;
        'animation-crossfade-duration'?: number;
        autoplay?: boolean | '';
      },
      HTMLElement
    >;
  }
}

declare module '@google/model-viewer' {
  export class ModelViewerElement extends HTMLElement {
    src: string;
    alt: string;
    poster: string;
    loading: 'auto' | 'lazy' | 'eager';
    reveal: 'auto' | 'manual';
    autoRotate: boolean;
    cameraControls: boolean;
    // Add more as needed
  }
}

