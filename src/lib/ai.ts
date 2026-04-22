// AI クライアント共通設定
// Groq の無料枠を使用（OpenAI 互換 API）
// 環境変数 GROQ_API_KEY が必要
// https://console.groq.com で無料 API キーを取得可能
import OpenAI from 'openai';

export const CHAT_MODEL = 'llama-3.3-70b-versatile';   // テキスト生成（Groq 無料枠）
export const WHISPER_MODEL = 'whisper-large-v3-turbo'; // 音声書き起こし（Groq 無料枠）

export function createAIClient() {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY ?? '',
    baseURL: 'https://api.groq.com/openai/v1',
  });
}
