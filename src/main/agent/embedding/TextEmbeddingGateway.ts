export type TextEmbeddingConfiguration = {
  readonly modelName: string;
  readonly endpointUrl: string;
  readonly apiKey: string;
  readonly dimensions?: number;
};

export interface TextEmbeddingGateway {
  embedDocuments(
    texts: readonly string[],
  ): Promise<readonly (readonly number[])[]>;
  embedQuery(text: string): Promise<readonly number[]>;
}
