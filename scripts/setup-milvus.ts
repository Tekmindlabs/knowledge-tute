// scripts/setup-milvus.ts
import { getMilvusClient } from "@/lib/milvus/client";
import { DataType } from '@zilliz/milvus2-sdk-node';

async function setupMilvusCollection() {
  try {
    const client = await getMilvusClient();

    await client.createCollection({
      collection_name: "content_vectors",
      fields: [
        {
          name: "id",
          data_type: DataType.VARCHAR,
          is_primary_key: true,
          max_length: 36
        },
        {
          name: "content",
          data_type: DataType.VARCHAR,
          max_length: 65535
        },
        {
          name: "embedding",
          data_type: DataType.FLOAT_VECTOR,
          dim: 1024 // Jina embedding dimension
        },
        {
          name: "metadata",
          data_type: DataType.JSON
        }
      ]
    });

    await client.createIndex({
      collection_name: "content_vectors",
      field_name: "embedding",
      index_type: "IVF_FLAT",
      metric_type: "COSINE",
      params: { nlist: 1024 }
    });

    await client.loadCollection({
      collection_name: "content_vectors"
    });

    console.log("Milvus collection setup complete!");
  } catch (error) {
    console.error("Error setting up Milvus:", error);
    throw error;
  }
}

setupMilvusCollection();