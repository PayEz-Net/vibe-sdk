/**
 * Vibe Next.js Plugin Types
 */

import type { NextConfig } from 'next';

export interface VibePluginOptions {
  /** Vibe API URL. Default: process.env.VIBE_API_URL */
  apiUrl?: string;

  /** Client ID for build-time auth. Default: process.env.VIBE_CLIENT_ID */
  clientId?: string;

  /** Client secret for build-time auth. Default: process.env.VIBE_CLIENT_SECRET */
  clientSecret?: string;

  /** Output directory for generated types. Default: node_modules/.vibe/types */
  outputDir?: string;

  /** Collections to generate types for. Default: all collections */
  collections?: string[];

  /** Enable type generation in dev mode. Default: true */
  devSync?: boolean;

  /** Polling interval in ms for dev mode schema sync. Default: 10000 */
  pollInterval?: number;

  /** Enable debug logging. Default: false */
  debug?: boolean;
}

export interface SchemaField {
  name: string;
  type: string;
  nullable?: boolean;
  description?: string;
  'x-vibe-pk'?: boolean;
  'x-vibe-auto-increment'?: boolean;
  'x-vibe-tokenize'?: boolean;
}

export interface CollectionSchema {
  name: string;
  fields: SchemaField[];
  description?: string;
}

export interface TypeGenerationResult {
  success: boolean;
  collections: string[];
  outputPath: string;
  error?: string;
}

export type WithVibeConfig = (nextConfig?: NextConfig) => NextConfig;
