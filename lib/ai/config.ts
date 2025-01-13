// lib/ai/config.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { JinaEmbeddings } from '@langchain/community/embeddings/jina';
import { getMilvusClient } from '../milvus/client';

// Initialize Google AI
export const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// Initialize Jina Embeddings
export const embeddings = new JinaEmbeddings({
  apiKey: process.env.JINA_API_KEY
});

// Export Milvus client
export { getMilvusClient };