import { prisma } from '../../lib/prisma';
import { getEmbedding } from './embeddings';
import { insertVector } from '../milvus/vectors';
import { createRelationship } from '../milvus/knowledge-graph';
import { searchSimilarContent } from '../milvus/vectors';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { Document, VectorResult } from './types';
import path from 'path';
import { fileURLToPath } from 'url';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { createReactAgent, AgentExecutor } from "langchain/agents";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseLanguageModelInterface } from "langchain/base_language";
import { Tool } from "langchain/tools";

// Error classes
class DocumentProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentProcessingError';
  }
}

class TextExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TextExtractionError';
  }
}

// Interfaces
interface DocumentMetadata {
  size: number;
  lastModified: number;
  fileType: string;
  embeddingDimension?: number;
  processingTimestamp: string;
  previousVersions?: Array<{
    version: number;
    updatedAt: Date;
  }>;
  analysis?: string;
  chunkCount?: number;
}

// Supported file types
const SUPPORTED_FILE_TYPES = {
  PDF: 'application/pdf',
  DOC: 'application/msword',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TXT: 'text/plain',
};

// Google AI Model Wrapper
class GoogleAIModelWrapper implements BaseLanguageModelInterface {
  constructor(private model: any) {}
  
  async invoke(input: string, options?: any) {
    const result = await this.model.generateContent(input);
    return result.response.text();
  }
}

// Initialize LangChain components
const model = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!).getGenerativeModel({ model: "gemini-pro" });
const wrappedModel = new GoogleAIModelWrapper(model);

// Create analysis tool
const analyzeTool = new Tool({
  name: "analyze_document",
  description: "Analyze document content and structure",
  async call(input: string) {
    const result = await model.generateContent(input);
    return result.response.text();
  }
});

// Create agent
const agent = await createReactAgent({
  llm: wrappedModel,
  tools: [analyzeTool],
  prompt: ChatPromptTemplate.fromMessages([
    ["system", "You are a document analysis agent that helps process and understand document content."],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"]
  ])
});

const executor = AgentExecutor.fromAgentAndTools({
  agent: await agent,
  tools: [analyzeTool],
  verbose: true
});

// Helper functions
function sanitizeMetadata(metadata: any): DocumentMetadata {
  return {
    size: Number(metadata.size) || 0,
    lastModified: Number(metadata.lastModified) || Date.now(),
    fileType: String(metadata.fileType) || '',
    processingTimestamp: new Date().toISOString(),
    previousVersions: Array.isArray(metadata.previousVersions) 
      ? metadata.previousVersions.map((v: any) => ({
          version: Number(v.version),
          updatedAt: new Date(v.updatedAt)
        }))
      : [],
    ...(metadata.embeddingDimension && { 
      embeddingDimension: Number(metadata.embeddingDimension) 
    }),
    ...(metadata.analysis && { analysis: String(metadata.analysis) }),
    ...(metadata.chunkCount && { chunkCount: Number(metadata.chunkCount) })
  };
}

async function extractText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  switch (file.type) {
    case SUPPORTED_FILE_TYPES.PDF:
      return extractPdfText(buffer);
    case SUPPORTED_FILE_TYPES.DOC:
    case SUPPORTED_FILE_TYPES.DOCX:
      return extractWordText(buffer);
    case SUPPORTED_FILE_TYPES.TXT:
      return extractTxtText(buffer);
    default:
      throw new TextExtractionError(`Unsupported file type: ${file.type}`);
  }
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text.trim();
  } catch (error) {
    throw new TextExtractionError(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function extractWordText(buffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value.trim();
  } catch (error) {
    throw new TextExtractionError(
      `Failed to extract text from Word document: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function extractTxtText(buffer: ArrayBuffer): Promise<string> {
  try {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(buffer).trim();
  } catch (error) {
    throw new TextExtractionError(
      `Failed to extract text from TXT file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function splitTextIntoChunks(text: string): Promise<string[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200
  });
  
  const docs = await splitter.createDocuments([text]);
  return docs.map(doc => doc.pageContent);
}

// Main document processing functions
export async function processDocument(file: File, userId: string): Promise<Document> {
  try {
    if (!Object.values(SUPPORTED_FILE_TYPES).includes(file.type)) {
      throw new DocumentProcessingError(`Unsupported file type: ${file.type}`);
    }

    const content = await extractText(file);
    const textChunks = await splitTextIntoChunks(content);
    
    const analysis = await executor.invoke({
      input: content.substring(0, 1000),
      chat_history: []
    });

    const embeddings = await Promise.all(
      textChunks.map(chunk => getEmbedding(chunk))
    );

    const documentMetadata = sanitizeMetadata({
      size: file.size,
      lastModified: file.lastModified,
      fileType: file.type,
      embeddingDimension: embeddings[0].length,
      processingTimestamp: new Date().toISOString(),
      previousVersions: [],
      analysis: analysis.output,
      chunkCount: textChunks.length
    });

    const document = await prisma.document.create({
      data: {
        userId,
        title: file.name,
        content: content,
        fileType: file.type,
        metadata: documentMetadata as any,
        version: 1,
        vectorId: null
      }
    });

    const vectorPromises = textChunks.map((chunk, index) => 
      insertVector({
        userId,
        contentType: 'document_chunk',
        contentId: `${document.id}_${index}`,
        embedding: Array.from(embeddings[index]),
        metadata: {
          documentId: document.id,
          chunkIndex: index,
          title: file.name
        }
      })
    );

    const vectorResults = await Promise.all(vectorPromises);

    await createDocumentRelationships(document.id, content, userId, analysis.output);

    return {
      ...document,
      metadata: documentMetadata
    } as Document;

  } catch (error) {
    console.error('Error processing document:', error);
    throw error instanceof DocumentProcessingError ? error : new DocumentProcessingError(
      `Document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function createDocumentRelationships(
  documentId: string,
  content: string,
  userId: string,
  analysis: string
): Promise<void> {
  try {
    const relationshipAnalysis = await executor.invoke({
      input: `Analyze potential relationships in this content and analysis:
              Content: ${content.substring(0, 500)}...
              Analysis: ${analysis}`,
      chat_history: []
    });

    const embeddingFloat32 = await getEmbedding(content);
    const similar = await searchSimilarContent({
      userId,
      embedding: Array.from(embeddingFloat32),
      limit: 3,
      contentTypes: ['document']
    });

    const relationshipPromises = similar.map(async (result: { content_id: string; score: number }) => {
      if (result.content_id !== documentId) {
        return createRelationship({
          userId,
          sourceId: documentId,
          targetId: result.content_id,
          relationshipType: 'similar_to',
          metadata: {
            similarity_score: result.score,
            type: 'document-similarity',
            timestamp: new Date().toISOString(),
            analysis: relationshipAnalysis.output
          }
        });
      }
    });

    await Promise.all(relationshipPromises.filter(Boolean));
  } catch (error) {
    console.error('Error creating relationships:', error);
    throw error;
  }
}