// Type that allows any string values for translations
export interface Translations {
  nav: {
    chat: string;
    image: string;
    batch: string;
    video: string;
    music: string;
    training: string;
    gallery: string;
    referralProgram: string;
    achievements: string;
    refreshCredits: string;
    buyCredits: string;
    buy: string;
    disconnect: string;
    credits: string;
    currentBalance: string;
    totalEarned: string;
    moreOptions: string;
    options: string;
    minimize: string;
    maximize: string;
    subtitle: string;
  };
  common: {
    loading: string;
    pleaseWait: string;
    error: string;
    success: string;
    cancel: string;
    confirm: string;
    save: string;
    close: string;
    generate: string;
    download: string;
    share: string;
    copy: string;
    delete: string;
    edit: string;
    view: string;
  };
  loadingMessages: {
    chatAssistant: string;
    videoGenerator: string;
    musicGenerator: string;
    gallery: string;
    characterCreator: string;
  };
  auth: {
    connectWallet: string;
    walletConnected: string;
    signIn: string;
    signOut: string;
  };
  imageGen: {
    prompt: string;
    promptPlaceholder: string;
    style: string;
    aspectRatio: string;
    model: string;
    referenceImage: string;
    generateImage: string;
    generating: string;
  };
  videoGen: {
    prompt: string;
    promptPlaceholder: string;
    generateVideo: string;
    generating: string;
  };
  musicGen: {
    prompt: string;
    promptPlaceholder: string;
    generateMusic: string;
    generating: string;
  };
  settings: {
    language: string;
    english: string;
    japanese: string;
    chinese: string;
  };
  footer: {
    terms: string;
    privacy: string;
    contact: string;
  };
}

// English translations
export const en: Translations = {
  // Navigation
  nav: {
    chat: 'Chat',
    image: 'Image',
    batch: 'Batch',
    video: 'Video',
    music: 'Music',
    training: 'Training',
    gallery: 'Gallery',
    referralProgram: 'Referral Program',
    achievements: 'Achievements',
    refreshCredits: 'Refresh Credits',
    buyCredits: 'Buy Credits',
    buy: 'Buy',
    disconnect: 'Disconnect',
    credits: 'credits',
    currentBalance: 'Current Balance:',
    totalEarned: 'Total Earned:',
    moreOptions: 'More Options (Style, Aspect, Reference, Model)',
    options: 'Options (Style, Model)',
    minimize: 'Minimize',
    maximize: 'Maximize',
    subtitle: 'Image • Video • Music Generator',
  },
  
  // Common
  common: {
    loading: 'Loading...',
    pleaseWait: 'Please wait...',
    error: 'Error',
    success: 'Success',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    close: 'Close',
    generate: 'Generate',
    download: 'Download',
    share: 'Share',
    copy: 'Copy',
    delete: 'Delete',
    edit: 'Edit',
    view: 'View',
  },
  
  // Loading messages
  loadingMessages: {
    chatAssistant: 'Loading Chat Assistant...',
    videoGenerator: 'Loading Video Generator...',
    musicGenerator: 'Loading Music Generator...',
    gallery: 'Loading Gallery...',
    characterCreator: 'Loading 3D Character Creator...',
  },
  
  // Auth
  auth: {
    connectWallet: 'Connect Wallet',
    walletConnected: 'Wallet Connected',
    signIn: 'Sign In',
    signOut: 'Sign Out',
  },
  
  // Image Generation
  imageGen: {
    prompt: 'Prompt',
    promptPlaceholder: 'Describe the image you want to create...',
    style: 'Style',
    aspectRatio: 'Aspect Ratio',
    model: 'Model',
    referenceImage: 'Reference Image',
    generateImage: 'Generate Image',
    generating: 'Generating...',
  },
  
  // Video Generation
  videoGen: {
    prompt: 'Prompt',
    promptPlaceholder: 'Describe the video you want to create...',
    generateVideo: 'Generate Video',
    generating: 'Generating...',
  },
  
  // Music Generation
  musicGen: {
    prompt: 'Prompt',
    promptPlaceholder: 'Describe the music you want to create...',
    generateMusic: 'Generate Music',
    generating: 'Generating...',
  },
  
  // Settings
  settings: {
    language: 'Language',
    english: 'English',
    japanese: '日本語',
    chinese: '中文',
  },
  
  // Footer
  footer: {
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    contact: 'Contact',
  },
};
