// lib/milvus/client.ts
import { MilvusClient } from "@zilliz/milvus2-sdk-node";

class MilvusConnection {
  private static instance: MilvusClient;

  private constructor() {}

  public static async getInstance(): Promise<MilvusClient> {
    if (!MilvusConnection.instance) {
      const address = process.env.MILVUS_ADDRESS;
      const token = process.env.MILVUS_TOKEN;

      if (!address || !token) {
        throw new Error('Milvus configuration missing. Please check MILVUS_ADDRESS and MILVUS_TOKEN in environment variables.');
      }

      // Remove 'https://' from the address if present
      const cleanAddress = address.replace('https://', '');

      const config = {
        address: cleanAddress,
        token: token,
        ssl: true
      };

      MilvusConnection.instance = new MilvusClient(config);
    }

    return MilvusConnection.instance;
  }
}

export async function getMilvusClient(): Promise<MilvusClient> {
  return MilvusConnection.getInstance();
}