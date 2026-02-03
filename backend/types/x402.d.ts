/**
 * Type declarations for @x402/express
 * x402 payment protocol for HTTP 402 Payment Required
 */
declare module '@x402/express' {
  import type { RequestHandler } from 'express';

  // Network identifiers (CAIP-2 format)
  type Network = 'eip155:1' | 'eip155:8453' | 'eip155:84532' | 'eip155:137' | string;

  // Price can be static string or dynamic function
  type Price = string;
  type DynamicPrice = (context: { body?: Record<string, unknown>; query?: Record<string, unknown> }) => Price | Promise<Price>;

  interface PaymentOption {
    price: Price | DynamicPrice;
    network: Network;
    payTo: string;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
  }

  interface RouteConfig {
    accepts: PaymentOption | PaymentOption[];
    resource?: string;
    description?: string;
    mimeType?: string;
    customPaywallHtml?: string;
  }

  type RoutesConfig = Record<string, RouteConfig>;

  interface PaywallConfig {
    cdpApiKey?: string;
    appName?: string;
    appLogoUrl?: string;
    onramp?: boolean;
  }

  interface FacilitatorClient {
    // Facilitator client interface
  }

  interface SchemeNetworkServer {
    // Scheme server interface
  }

  interface SchemeRegistration {
    network: Network;
    server: SchemeNetworkServer;
  }

  interface x402ResourceServer {
    // Resource server interface
  }

  interface PaywallProvider {
    // Paywall provider interface
  }

  export interface SchemeRegistration {
    network: string;
    server: unknown;
  }

  // Main middleware functions
  export function paymentMiddleware(
    routes: RoutesConfig,
    server: x402ResourceServer,
    paywallConfig?: PaywallConfig,
    paywall?: PaywallProvider,
    syncFacilitatorOnStart?: boolean
  ): RequestHandler;

  export function paymentMiddlewareFromConfig(
    routes: RoutesConfig,
    facilitatorClients?: FacilitatorClient | FacilitatorClient[],
    schemes?: SchemeRegistration[],
    paywallConfig?: PaywallConfig,
    paywall?: PaywallProvider,
    syncFacilitatorOnStart?: boolean
  ): RequestHandler;
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

declare module '@x402/core/server' {
  export interface FacilitatorConfig {
    url: string;
    headers?: Record<string, string>;
  }

  export class HTTPFacilitatorClient {
    constructor(config: FacilitatorConfig);
    verify(payload: unknown, requirements: unknown): Promise<{ valid: boolean }>;
    settle(payload: unknown, requirements: unknown): Promise<{ success: boolean; transactionHash?: string }>;
  }

  export interface x402ResourceServer {
    // Resource server interface
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

declare module '@x402/evm/exact/server' {
  import type { Network } from '@x402/core';
  
  export class ExactEvmScheme {
    readonly scheme: 'exact';
    registerMoneyParser(parser: unknown): ExactEvmScheme;
    parsePrice(price: string | number, network: Network): Promise<{ amount: string; asset: string }>;
  }
}
