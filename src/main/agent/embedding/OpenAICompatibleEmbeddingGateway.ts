import type {
  TextEmbeddingConfiguration,
  TextEmbeddingGateway,
} from "./TextEmbeddingGateway.ts";

export default class OpenAICompatibleEmbeddingGateway implements TextEmbeddingGateway {
  constructor(
    private readonly configuration: TextEmbeddingConfiguration,
    private readonly request: typeof fetch = fetch,
  ) {
    const endpoint = new URL(configuration.endpointUrl);
    if (!["http:", "https:"].includes(endpoint.protocol))
      throw new Error("Invalid embedding endpoint URL.");
    if (!configuration.modelName.trim() || !configuration.apiKey.trim())
      throw new Error("Missing embedding configuration.");
    if (
      configuration.dimensions !== undefined &&
      (!Number.isInteger(configuration.dimensions) ||
        configuration.dimensions <= 0)
    ) {
      throw new Error("Invalid embedding dimensions.");
    }
  }

  async embedDocuments(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    if (!texts.length || texts.some((text) => !text.trim()))
      throw new Error("Embedding input must contain non-empty text.");
    const response = await this.request(this.configuration.endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.configuration.modelName,
        input: texts,
        ...(this.configuration.dimensions !== undefined
          ? { dimensions: this.configuration.dimensions }
          : {}),
      }),
    });
    if (!response.ok)
      throw new Error(`Embedding request failed (${response.status}).`);
    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !Array.isArray((payload as { data?: unknown }).data)
    ) {
      throw new Error("Invalid embedding response.");
    }
    const data = (payload as { data: unknown[] }).data;
    if (data.length !== texts.length)
      throw new Error("Embedding response count mismatch.");
    const result: number[][] = new Array(texts.length);
    for (const item of data) {
      if (!item || typeof item !== "object")
        throw new Error("Invalid embedding response item.");
      const entry = item as { index?: unknown; embedding?: unknown };
      if (
        !Number.isInteger(entry.index) ||
        (entry.index as number) < 0 ||
        (entry.index as number) >= texts.length ||
        result[entry.index as number]
      ) {
        throw new Error("Invalid embedding response index.");
      }
      if (
        !Array.isArray(entry.embedding) ||
        !entry.embedding.length ||
        entry.embedding.some(
          (value) => typeof value !== "number" || !Number.isFinite(value),
        )
      ) {
        throw new Error("Invalid embedding vector.");
      }
      result[entry.index as number] = entry.embedding;
    }
    if (
      result.some((vector) => !vector || vector.length !== result[0].length)
    ) {
      throw new Error("Embedding response dimensions mismatch.");
    }
    return result;
  }

  async embedQuery(text: string): Promise<readonly number[]> {
    const vectors = await this.embedDocuments([text]);
    return vectors[0];
  }
}
