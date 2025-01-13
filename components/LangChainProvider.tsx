// components/LangChainProvider.tsx
import { createContext, useContext, useState } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

const LangChainContext = createContext<any>(null);

export function LangChainProvider({ children }: { children: React.ReactNode }) {
  const [model] = useState(() => 
    new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY!)
  );
  const [vectorStore] = useState(() => 
    new SupabaseVectorStore(/* config */)
  );

  return (
    <LangChainContext.Provider value={{ model, vectorStore }}>
      {children}
    </LangChainContext.Provider>
  );
}

export const useLangChain = () => useContext(LangChainContext);