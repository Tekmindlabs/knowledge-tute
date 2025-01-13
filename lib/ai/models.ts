// /lib/ai/models.ts
export interface Model {
    id: string;
    label: string;
    description?: string;
  }
  
  export const models: Model[] = [
    {
      id: 'gemini-pro',
      label: 'Gemini Pro',
      description: 'Best for text generation and analysis tasks'
    },
    {
      id: 'gemini-pro-vision',
      label: 'Gemini Pro Vision',
      description: 'Advanced model for both text and image understanding'
    }
  ];