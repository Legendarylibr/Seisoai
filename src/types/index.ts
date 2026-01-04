// Common types used across the application

// Visual Styles
export interface VisualStyle {
  id: string;
  name: string;
  description: string;
  emoji: string;
  prompt: string;
  gradient: string;
  category: 'Photorealistic' | 'Artistic' | 'Professional' | 'Creative';
}

// User & Auth
export interface User {
  id: string;
  email?: string;
  walletAddress?: string;
  credits: number;
  subscriptionTier?: string;
  subscriptionStatus?: 'active' | 'canceled' | 'past_due' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  token: string | null;
}

// Image Generation
export interface GenerationOptions {
  prompt: string;
  style?: string;
  model?: string;
  width?: number;
  height?: number;
  numImages?: number;
  referenceImage?: string | null;
  referenceStrength?: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  style?: string;
  model: string;
  width: number;
  height: number;
  createdAt: string;
  userId: string;
}

// Gallery
export interface GalleryItem {
  id: string;
  imageUrl: string;
  thumbnailUrl?: string;
  prompt: string;
  style?: string;
  model: string;
  width: number;
  height: number;
  createdAt: string;
  likes?: number;
  isPublic: boolean;
}

// Payments
export interface PaymentIntent {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  credits: number;
  features: string[];
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Wallet
export interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  balance: string | null;
}

// Video Generation
export interface VideoGenerationOptions {
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  style?: string;
}

export interface GeneratedVideo {
  id: string;
  url: string;
  prompt: string;
  duration: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
}

// Music Generation
export interface MusicGenerationOptions {
  prompt: string;
  duration?: number;
  genre?: string;
}

export interface GeneratedMusic {
  id: string;
  url: string;
  prompt: string;
  duration: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
}

// Log levels
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// Event handlers
export type MouseEventHandler = (e: React.MouseEvent<HTMLElement>) => void;


