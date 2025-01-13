export interface Message {
  id: string;  // Remove optional
  content: string;
  role: 'user' | 'assistant';
  createdAt: Date;  // Change to Date type
}

export interface ChatResponse {
  success: boolean;
  message?: Message;
  error?: string;
}

export interface Attachment {
  url: string;
  name: string;
  contentType: string;
}

export interface ChatRequestOptions {
  data?: Record<string, any>;
  options?: Record<string, any>;
  headers?: Record<string, string>;
}