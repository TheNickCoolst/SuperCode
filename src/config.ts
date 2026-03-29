import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface Config {
  minimaxApiKey: string;
  minimaxBaseUrl: string;
}

export function getConfig(): Config {
  const minimaxApiKey = process.env.MINIMAX_API_KEY;
  const minimaxBaseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/anthropic';

  if (!minimaxApiKey) {
    throw new Error('FATAL: MINIMAX_API_KEY is missing from environment variables.');
  }

  return {
    minimaxApiKey,
    minimaxBaseUrl,
  };
}

export const config = getConfig();
