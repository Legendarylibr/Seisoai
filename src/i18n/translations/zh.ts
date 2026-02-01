// Chinese (Simplified) translations
import type { Translations } from './en';

export const zh: Translations = {
  // Navigation
  nav: {
    chat: '聊天',
    image: '图片',
    batch: '批量',
    video: '视频',
    music: '音乐',
    gallery: '图库',
    referralProgram: '推荐计划',
    achievements: '成就',
    refreshCredits: '刷新积分',
    buyCredits: '购买积分',
    buy: '购买',
    disconnect: '断开连接',
    credits: '积分',
    currentBalance: '当前余额:',
    totalEarned: '累计获得:',
    moreOptions: '更多选项（风格、比例、参考、模型）',
    options: '选项（风格、模型）',
    minimize: '最小化',
    maximize: '最大化',
    subtitle: '图片・视频・音乐生成器',
  },
  
  // Common
  common: {
    loading: '加载中...',
    pleaseWait: '请稍候...',
    error: '错误',
    success: '成功',
    cancel: '取消',
    confirm: '确认',
    save: '保存',
    close: '关闭',
    generate: '生成',
    download: '下载',
    share: '分享',
    copy: '复制',
    delete: '删除',
    edit: '编辑',
    view: '查看',
  },
  
  // Loading messages
  loadingMessages: {
    chatAssistant: '正在加载聊天助手...',
    videoGenerator: '正在加载视频生成器...',
    musicGenerator: '正在加载音乐生成器...',
    gallery: '正在加载图库...',
    characterCreator: '正在加载3D角色创建器...',
  },
  
  // Auth
  auth: {
    connectWallet: '连接钱包',
    walletConnected: '钱包已连接',
    signIn: '登录',
    signOut: '退出登录',
  },
  
  // Image Generation
  imageGen: {
    prompt: '提示词',
    promptPlaceholder: '描述你想要创建的图片...',
    style: '风格',
    aspectRatio: '宽高比',
    model: '模型',
    referenceImage: '参考图片',
    generateImage: '生成图片',
    generating: '生成中...',
  },
  
  // Video Generation
  videoGen: {
    prompt: '提示词',
    promptPlaceholder: '描述你想要创建的视频...',
    generateVideo: '生成视频',
    generating: '生成中...',
  },
  
  // Music Generation
  musicGen: {
    prompt: '提示词',
    promptPlaceholder: '描述你想要创建的音乐...',
    generateMusic: '生成音乐',
    generating: '生成中...',
  },
  
  // Settings
  settings: {
    language: '语言',
    english: 'English',
    japanese: '日本語',
    chinese: '中文',
  },
  
  // Footer
  footer: {
    terms: '服务条款',
    privacy: '隐私政策',
    contact: '联系我们',
  },
} as const;
