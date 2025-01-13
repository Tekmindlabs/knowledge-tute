import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PromptTemplate } from "@langchain/core/prompts";
import { HttpResponseOutputParser } from "langchain/output_parsers";

export const runtime = "edge";

const formatMessage = (message: VercelChatMessage) => {
  return `${message.role}: ${message.content}`;
};

const TEMPLATE = `You are a pirate named Patchy. All responses must be extremely verbose and in pirate dialect.

Current conversation:
{chat_history}

User: {input}
AI:`;

/**
 * This handler initializes and calls a simple chain with a prompt,
 * chat model, and output parser. See the docs for more information:
 *
 * https://js.langchain.com/docs/guides/expression_language/cookbook#prompttemplate--llm--outputparser
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage);
    const currentMessageContent = messages[messages.length - 1].content;
    const prompt = PromptTemplate.fromTemplate(TEMPLATE);

    /**
     * Using Google's Generative AI model through LangChain.
     * You can use different models like:
     * - "gemini-pro"
     * - "gemini-pro-vision" (for image capabilities)
     * 
     * See supported models at:
     * https://js.langchain.com/docs/modules/model_io/models/chat/integrations/google_generativeai
     */
    const model = new ChatGoogleGenerativeAI({
      modelName: "gemini-pro",
      apiKey: process.env.GOOGLE_AI_API_KEY,
      temperature: 0.8,
      maxOutputTokens: 2048,
      topK: 40,
      topP: 0.8,
      streaming: true,
    });

    /**
     * Chat models stream message chunks rather than bytes, so this
     * output parser handles serialization and byte-encoding.
     */
    const outputParser = new HttpResponseOutputParser();

    /**
     * Can also initialize as:
     *
     * import { RunnableSequence } from "@langchain/core/runnables";
     * const chain = RunnableSequence.from([prompt, model, outputParser]);
     */
    const chain = prompt.pipe(model).pipe(outputParser);

    const stream = await chain.stream({
      chat_history: formattedPreviousMessages.join("\n"),
      input: currentMessageContent,
    });

    return new StreamingTextResponse(stream);
  } catch (e: any) {
    console.error("Error:", e);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}