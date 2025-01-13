import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth/config";
import { StreamingTextResponse, LangChainStream } from 'ai';
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Message } from '@/types/chat';
import { MemoryService } from '@/lib/memory/memory-service';
import { getEmbedding } from '@/lib/knowledge/embeddings';
import { 
  ChatPromptTemplate, 
  MessagesPlaceholder,
  SystemMessagePromptTemplate 
} from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createReactAgent, AgentExecutor } from "langchain/agents";
import { Tool } from "langchain/tools";
import { BaseLanguageModelInterface } from "langchain/base_language";

// Define processing steps
enum STEPS {
  INIT = 'initialization',
  AUTH = 'authentication',
  PROCESS = 'processing',
  EMBED = 'embedding',
  AGENT = 'agent_execution',
  RESPONSE = 'response_generation',
  STREAM = 'streaming'
}

// Google AI Model Wrapper for LangChain compatibility
class GoogleAIModelWrapper implements BaseLanguageModelInterface {
  constructor(private model: any) {}
  
  async invoke(input: string, options?: any) {
    const result = await this.model.generateContent(input);
    return result.response.text();
  }

  // Implement other required interface methods
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
}

const SYSTEM_TEMPLATE = `You are an intelligent tutoring assistant that helps users learn.
Consider the following aspects when responding:
- User's emotional state and confidence level
- Learning style and preferences
- Previous interactions and context
- Available knowledge base content`;

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error("GOOGLE_AI_API_KEY is not set");
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const requestCache = new Map<string, Response>();

// Create custom retrieval tool
class KnowledgeBaseSearchTool extends Tool {
  name = "search_knowledge_base";
  description = "Search through learning materials";

  async _call(query: string): Promise<string> {
    try {
      // Search in PostgreSQL using embeddings
      const queryEmbedding = await getEmbedding(query);
      
      // Perform vector similarity search using PostgreSQL
      const similarDocuments = await prisma.$queryRaw`
        SELECT content, 1 - (embedding <-> ${queryEmbedding}::vector) as similarity
        FROM documents
        WHERE 1 - (embedding <-> ${queryEmbedding}::vector) > 0.7
        ORDER BY similarity DESC
        LIMIT 3;
      `;

      return Array.isArray(similarDocuments) 
        ? similarDocuments.map((doc: any) => doc.content).join("\n\n")
        : "No relevant documents found";
    } catch (error) {
      console.error("Error searching knowledge base:", error);
      return "Error searching knowledge base";
    }
  }
}

export async function POST(req: NextRequest) {
  const runId = crypto.randomUUID();
  let currentStep = STEPS.INIT;
  
  const requestId = req.headers.get('x-request-id') || runId;
  const cachedResponse = requestCache.get(requestId);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    currentStep = STEPS.AUTH;
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }), 
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messages }: { messages: Message[] } = await req.json();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        learningStyle: true,
        difficultyPreference: true,
        interests: true
      }
    });

    if (!user) {
      throw new Error("User not found");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const wrappedModel = new GoogleAIModelWrapper(model);
    const { stream, handlers } = LangChainStream({
      experimental_streamData: true
    });

    const emotionalAnalysisChain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(
          "Analyze the emotional context and learning mindset of the student."
        ),
        new MessagesPlaceholder("messages")
      ]),
      wrappedModel,
      new StringOutputParser()
    ]);

    const searchTool = new KnowledgeBaseSearchTool();

    const agent = await createReactAgent({
      llm: wrappedModel,
      tools: [searchTool],
      prompt: ChatPromptTemplate.fromMessages([
        ["system", SYSTEM_TEMPLATE],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"]
      ])
    });

    const executor = AgentExecutor.fromAgentAndTools({
      agent: await agent,
      tools: [searchTool],
      verbose: true
    });

    currentStep = STEPS.PROCESS;
    const emotionalState = await emotionalAnalysisChain.invoke({
      messages: messages
    });

    currentStep = STEPS.EMBED;
    const lastMessage = messages[messages.length - 1];
    const embedding = await getEmbedding(lastMessage.content);

    currentStep = STEPS.AGENT;
    const agentResponse = await executor.invoke({
      input: lastMessage.content,
      chat_history: messages.slice(0, -1),
      emotional_state: emotionalState
    });

    currentStep = STEPS.RESPONSE;
    const personalizedResponse = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `
            Adapt this response: "${agentResponse.output}"
            For a ${user.learningStyle || 'general'} learner 
            with ${user.difficultyPreference || 'moderate'} difficulty preference.
            Consider interests: ${user.interests?.join(', ') || 'general topics'}.
            Emotional state: ${emotionalState}
          `
        }]
      }]
    });

    const finalResponse = (await personalizedResponse.response).text().trim();

    currentStep = STEPS.STREAM;
    const messageData: Message = {
      id: runId,
      role: 'assistant',
      content: finalResponse,
      createdAt: new Date()
    };

    await handlers.handleLLMNewToken(finalResponse);
    await handlers.handleLLMEnd(messageData, runId);

    const streamResponse = new StreamingTextResponse(stream);
    requestCache.set(requestId, streamResponse.clone());
    return streamResponse;

  } catch (error) {
    console.error(`Failed at step: ${currentStep}`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: `Failed during ${currentStep}`,
        stack: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}