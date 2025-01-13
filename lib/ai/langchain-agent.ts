import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { Tool } from "langchain/tools";
import { BaseLanguageModelInterface } from "langchain/base_language";
import { Message } from "@/types/chat";
import { AgentState, EmotionalState } from "./agents";

interface Memory {
  id: string;
  content: string;
  emotionalState: EmotionalState;
  timestamp: string;
  userId: string;
  metadata?: {
    learningStyle?: string;
    difficulty?: string;
    interests?: string[];
  };
}

// Google AI Model Wrapper for LangChain compatibility
class GoogleAIModelWrapper implements BaseLanguageModelInterface {
  constructor(private model: any) {}
  
  async invoke(input: string, options?: any) {
    const result = await this.model.generateContent(input);
    return result.response.text();
  }

  async generate(prompts: string[], options?: any) {
    const results = await Promise.all(
      prompts.map(prompt => this.model.generateContent(prompt))
    );
    return {
      generations: results.map(result => ({
        text: result.response.text(),
        generationInfo: {}
      }))
    };
  }

  // Implement other required interface methods
  async call(prompt: string, options?: any) {
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }

  async predictMessages(messages: any[], options?: any) {
    return this.call(messages.map(m => m.content).join('\n'), options);
  }
}

// Custom Knowledge Base Search Tool
class KnowledgeBaseSearchTool extends Tool {
  name = "search_knowledge_base";
  description = "Search through learning materials";
  memoryService: any;

  constructor(memoryService: any) {
    super();
    this.memoryService = memoryService;
  }

  async _call(query: string): Promise<string> {
    return await this.memoryService.searchMemories(query);
  }
}

export class LangChainGoogleAgent {
  private model: GoogleGenerativeAI;
  private memoryService: any;
  private wrappedModel: GoogleAIModelWrapper;

  constructor(apiKey: string, memoryService: any) {
    this.model = new GoogleGenerativeAI(apiKey);
    this.memoryService = memoryService;
    this.wrappedModel = new GoogleAIModelWrapper(
      this.model.getGenerativeModel({ model: "gemini-pro" })
    );
  }

  private createEmotionalAnalysisChain() {
    const emotionalPrompt = ChatPromptTemplate.fromMessages([
      ["system", `Analyze the emotional context and learning mindset of the student.
        Provide:
        1. Emotional state (positive/negative/neutral)
        2. Confidence level (high/medium/low)
        3. Brief analysis of emotional context`],
      new MessagesPlaceholder("messages")
    ]);

    return RunnableSequence.from([
      emotionalPrompt,
      this.wrappedModel,
      new StringOutputParser()
    ]);
  }

  private async createTutorAgent() {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are an intelligent tutoring assistant that helps users learn.
        Consider:
        - User's emotional state and confidence
        - Previous interactions and learning patterns
        - Available knowledge base content`],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad")
    ]);

    const searchTool = new KnowledgeBaseSearchTool(this.memoryService);

    return createReactAgent({
      llm: this.wrappedModel,
      tools: [searchTool],
      prompt
    });
  }

  async process(state: AgentState & { userId: string; context?: any }) {
    try {
      // 1. Analyze emotional state
      const emotionalChain = this.createEmotionalAnalysisChain();
      const emotionalAnalysis = await emotionalChain.invoke({
        messages: state.messages
      });

      // 2. Create and run tutor agent
      const agent = await this.createTutorAgent();
      const executor = AgentExecutor.fromAgentAndTools({
        agent: await agent,
        tools: [new KnowledgeBaseSearchTool(this.memoryService)],
        verbose: true
      });

      // 3. Get relevant memories
      const relevantMemories = await this.memoryService.searchMemories(
        state.messages[state.messages.length - 1].content,
        state.userId,
        5
      );

      // 4. Execute agent with context
      const result = await executor.invoke({
        input: state.messages[state.messages.length - 1].content,
        chat_history: state.messages.slice(0, -1),
        emotional_state: emotionalAnalysis,
        memories: relevantMemories
      });

      // 5. Store interaction in memory
      await this.memoryService.addMemory({
        content: result.output,
        emotionalState: emotionalAnalysis,
        userId: state.userId,
        metadata: {
          context: state.context,
          timestamp: new Date().toISOString()
        }
      });

      return {
        success: true,
        response: result.output,
        emotionalState: emotionalAnalysis,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error("LangChain Google Agent error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      };
    }
  }
}