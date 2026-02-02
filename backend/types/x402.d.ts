/**
 * Type declarations for @x402/express
 * x402 payment protocol for HTTP 402 Payment Required
 */
declare module '@x402/express' {
  import type { RequestHandler } from 'express';

  interface RouteConfig {
    price: string;
    description?: string;
    network?: string;
    config?: {
      description?: string;
      mimeType?: string;
      timeout?: number;
      paywallHtml?: string;
    };
  }

  interface PaymentMiddlewareOptions {
    network?: 'base' | 'base-sepolia';
    facilitator?: string;
    paywall?: {
      cdpApiKey?: string;
      appName?: string;
      appLogoUrl?: string;
      onramp?: boolean;
    };
  }

  type RouteConfigs = Record<string, RouteConfig>;

  export function paymentMiddleware(
    paymentAddress: string,
    routes: RouteConfigs,
    options?: PaymentMiddlewareOptions
  ): RequestHandler;

  export type Network = 'base' | 'base-sepolia';
}

declare module '@x402/core' {
  export interface PaymentPayload {
    scheme: string;
    network: string;
    payload: string;
  }

  export interface PaymentRequirements {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    description?: string;
    mimeType?: string;
    payTo: string;
    maxTimeoutSeconds?: number;
    asset?: string;
    extra?: Record<string, unknown>;
  }

  export interface VerificationResponse {
    valid: boolean;
    invalidReason?: string;
  }

  export interface SettlementResponse {
    success: boolean;
    transactionHash?: string;
    networkId?: string;
    payer?: string;
    error?: string;
  }
}

declare module '@x402/evm' {
  export function createPaymentPayload(
    requirements: import('@x402/core').PaymentRequirements,
    privateKey: string
  ): Promise<import('@x402/core').PaymentPayload>;

  export function verifyPayment(
    payload: import('@x402/core').PaymentPayload,
    requirements: import('@x402/core').PaymentRequirements
  ): Promise<import('@x402/core').VerificationResponse>;
}
