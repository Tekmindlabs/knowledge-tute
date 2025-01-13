// app/api/retrieval/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getMilvusClient } from "@/lib/milvus/client";
import { embeddings } from "@/lib/ai/config";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { text, metadata = {} } = await req.json();
    
    const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
      chunkSize: 256,
      chunkOverlap: 20,
    });

    const documents = await splitter.createDocuments([text]);
    const client = await getMilvusClient();

    for (const doc of documents) {
      const embedding = await embeddings.embedQuery(doc.pageContent);
      
      await client.insert({
        collection_name: "content_vectors",
        data: [{
          content: doc.pageContent,
          embedding: embedding,
          metadata: JSON.stringify({ ...metadata, ...doc.metadata })
        }]
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}