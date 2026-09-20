import OpenAICompatibleEmbeddingGateway from "./OpenAICompatibleEmbeddingGateway.ts";
import type {
  TextEmbeddingConfiguration,
  TextEmbeddingGateway,
} from "./TextEmbeddingGateway.ts";

export default class LiveEmbeddingConnection {
  private gateway: TextEmbeddingGateway | null;

  constructor(configuration: TextEmbeddingConfiguration | null) {
    this.gateway = configuration
      ? new OpenAICompatibleEmbeddingGateway(configuration)
      : null;
  }

  getSnapshot(): TextEmbeddingGateway | null {
    return this.gateway;
  }

  prepareUpdate(configuration: TextEmbeddingConfiguration | null): () => void {
    const next = configuration
      ? new OpenAICompatibleEmbeddingGateway(configuration)
      : null;
    return () => {
      this.gateway = next;
    };
  }
}
