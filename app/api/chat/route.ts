import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth/config";
import { StreamingTextResponse, LangChainStream } from 'ai';
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Message } from '@/types/chat';
import { MemoryService } from '@/lib/memory/memory-service';
import { EmbeddingModel } from '@/lib/knowledge/embeddings';
import { 
  ChatPromptTemplate, 
  MessagesPlaceholder,
  SystemMessagePromptTemplate 
} from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createReactAgent, AgentExecutor } from "langchain/agents";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { GoogleVertexAIEmbeddings } from "@langchain/google-vertexai";

// Keep existing type definitions...

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

export async function POST(req: NextRequest) {
  const runId = crypto.randomUUID();
  let currentStep = STEPS.INIT;
  
  const requestId = req.headers.get('x-request-id') || runId;
  const cachedResponse = requestCache.get(requestId);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    // Authentication check (keep existing code)...
    currentStep = STEPS.AUTH;
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }), 
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Message validation and user data retrieval (keep existing code)...
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

    // Initialize LangChain components
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const { stream, handlers } = LangChainStream({
      experimental_streamData: true
    });

    // Create emotional analysis chain
    const emotionalAnalysisChain = RunnableSequence.from([
      ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate(
          "Analyze the emotional context and learning mindset of the student."
        ),
        new MessagesPlaceholder("messages")
      ]),
      model,
      new StringOutputParser()
    ]);

    // Initialize vector store
    const embeddings = new GoogleVertexAIEmbeddings();
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabaseClient,
      tableName: "documents",
      queryName: "match_documents"
    });

    // Create retriever tool
    const retriever = vectorStore.asRetriever();
    const retrievalTool = {
      name: "search_knowledge_base",
      description: "Search through learning materials",
      func: async (query: string) => {
        const docs = await retriever.getRelevantDocuments(query);
        return docs.map(doc => doc.pageContent).join("\n\n");
      }
    };

    // Create ReAct agent
    const agent = await createReactAgent({
      llm: model,
      tools: [retrievalTool],
      prompt: ChatPromptTemplate.fromMessages([
        ["system", SYSTEM_TEMPLATE],
        new MessagesPlaceholder("chat_history"),
        ["human", "{input}"]
      ])
    });

    const executor = AgentExecutor.fromAgentAndTools({
      agent,
      tools: [retrievalTool],
      verbose: true
    });

    // Process messages and analyze emotional state
    currentStep = STEPS.PROCESS;
    const emotionalState = await emotionalAnalysisChain.invoke({
      messages: messages
    });

    // Generate embeddings for the latest message
    currentStep = STEPS.EMBED;
    const lastMessage = messages[messages.length - 1];
    const embedding = await embeddings.embedQuery(lastMessage.content);

    // Execute agent with context
    currentStep = STEPS.AGENT;
    const agentResponse = await executor.invoke({
      input: lastMessage.content,
      chat_history: messages.slice(0, -1),
      emotional_state: emotionalState
    });

    // Personalize response
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

    const finalResponse = personalizedResponse.response.text().trim();

    // Store chat in database (keep existing code)...
    
    // Stream response
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