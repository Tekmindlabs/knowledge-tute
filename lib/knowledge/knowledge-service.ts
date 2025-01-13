// lib/services/knowledge-service.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createReactAgent, AgentExecutor } from "langchain/agents";

export class KnowledgeService {
  private agent: any;
  private vectorStore: SupabaseVectorStore;

  constructor(model: any, vectorStore: SupabaseVectorStore) {
    this.vectorStore = vectorStore;
    this.agent = this.createKnowledgeAgent(model);
  }

  private createKnowledgeAgent(model: any) {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are a knowledge management assistant that helps organize and connect information.
        Consider:
        - Document relationships
        - Content similarity
        - User context and preferences`],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"]
    ]);

    const tools = [
      {
        name: "search_documents",
        description: "Search through document collection",
        func: async (query: string) => {
          return await this.vectorStore.similaritySearch(query);
        }
      }
    ];

    return createReactAgent({
      llm: model,
      tools,
      prompt
    });
  }

  async processKnowledge(input: string, userId: string) {
    const executor = AgentExecutor.fromAgentAndTools({
      agent: this.agent,
      tools: this.agent.tools,
      verbose: true
    });

    return await executor.invoke({
      input,
      userId,
      chat_history: []
    });
  }
}