// Japanese translations
import type { Translations } from './en';

export const ja: Translations = {
  // Navigation
  nav: {
    chat: 'チャット',
    image: '画像',
    batch: 'バッチ',
    video: '動画',
    music: '音楽',
    training: 'トレーニング',
    gallery: 'ギャラリー',
    referralProgram: '紹介プログラム',
    achievements: '実績',
    refreshCredits: 'クレジット更新',
    buyCredits: 'クレジット購入',
    buy: '購入',
    disconnect: '切断',
    credits: 'クレジット',
    currentBalance: '現在の残高:',
    totalEarned: '合計獲得:',
    moreOptions: '詳細オプション（スタイル、アスペクト、参照、モデル）',
    options: 'オプション（スタイル、モデル）',
    minimize: '最小化',
    maximize: '最大化',
    subtitle: '画像・動画・音楽ジェネレーター',
  },
  
  // Common
  common: {
    loading: '読み込み中...',
    pleaseWait: 'お待ちください...',
    error: 'エラー',
    success: '成功',
    cancel: 'キャンセル',
    confirm: '確認',
    save: '保存',
    close: '閉じる',
    generate: '生成',
    download: 'ダウンロード',
    share: '共有',
    copy: 'コピー',
    delete: '削除',
    edit: '編集',
    view: '表示',
  },
  
  // Loading messages
  loadingMessages: {
    chatAssistant: 'チャットアシスタントを読み込み中...',
    videoGenerator: '動画ジェネレーターを読み込み中...',
    musicGenerator: '音楽ジェネレーターを読み込み中...',
    gallery: 'ギャラリーを読み込み中...',
    characterCreator: '3Dキャラクタークリエイターを読み込み中...',
  },
  
  // Auth
  auth: {
    connectWallet: 'ウォレット接続',
    walletConnected: 'ウォレット接続済み',
    signIn: 'サインイン',
    signOut: 'サインアウト',
  },
  
  // Image Generation
  imageGen: {
    prompt: 'プロンプト',
    promptPlaceholder: '作成したい画像を説明してください...',
    style: 'スタイル',
    aspectRatio: 'アスペクト比',
    model: 'モデル',
    referenceImage: '参照画像',
    generateImage: '画像を生成',
    generating: '生成中...',
  },
  
  // Video Generation
  videoGen: {
    prompt: 'プロンプト',
    promptPlaceholder: '作成したい動画を説明してください...',
    generateVideo: '動画を生成',
    generating: '生成中...',
  },
  
  // Music Generation
  musicGen: {
    prompt: 'プロンプト',
    promptPlaceholder: '作成したい音楽を説明してください...',
    generateMusic: '音楽を生成',
    generating: '生成中...',
  },
  
  // Settings
  settings: {
    language: '言語',
    english: 'English',
    japanese: '日本語',
    chinese: '中文',
  },
  
  // Footer
  footer: {
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    contact: 'お問い合わせ',
  },
} as const;
