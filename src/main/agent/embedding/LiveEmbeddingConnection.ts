import { createAliyunTextEmbeddingClient } from "./aliyun/index.ts";
import type {
  AliyunTextEmbeddingClient,
  AliyunTextEmbeddingOptions,
} from "./aliyun/index.ts";

export default class LiveEmbeddingConnection {
  private client: AliyunTextEmbeddingClient | null;

  constructor(configuration: AliyunTextEmbeddingOptions | null) {
    this.client = configuration ? createAliyunTextEmbeddingClient(configuration) : null;
  }

  getTextEmbeddingClient(): AliyunTextEmbeddingClient {
    if (!this.client) throw new Error("文本向量尚未配置。");
    return this.client;
  }

  currentTextEmbeddingClient(): AliyunTextEmbeddingClient | null {
    return this.client;
  }

  prepareUpdate(configuration: AliyunTextEmbeddingOptions | null): () => void {
    const next = configuration ? createAliyunTextEmbeddingClient(configuration) : null;
    return () => {
      this.client = next;
    };
  }
}
