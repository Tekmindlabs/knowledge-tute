// lib/ai/index.ts
import { LangChainGoogleAgent } from "./langchain-agent";
import { MemoryService } from "../memory/memory-service";

export function createAI(memoryService: MemoryService) {
  const agent = new LangChainGoogleAgent(
    process.env.GOOGLE_AI_API_KEY!,
    memoryService
  );
  return agent;
}