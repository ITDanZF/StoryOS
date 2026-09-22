import { describe, expect, it } from "vitest";
import { createAliyunTextEmbeddingClient } from "./AliyunTextEmbeddingClient.ts";
import { AliyunTextEmbeddingError } from "./errors.ts";
import { ALIYUN_EMBEDDING_DIMENSIONS } from "./types.ts";

function vector(value: number, dimensions = 64): number[] {
  return Array.from({ length: dimensions }, () => value);
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("AliyunTextEmbeddingClient", () => {
  it("accepts the Aliyun dimension set", () => {
    expect([...ALIYUN_EMBEDDING_DIMENSIONS]).toEqual([64, 128, 256, 512, 768, 1024, 1536, 2048]);
  });

  it("sends an OpenAI-compatible request and returns one vector", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetchMock: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return jsonResponse(
        {
          data: [{ index: 0, embedding: vector(0.25) }],
          model: "text-embedding-v4",
          usage: { prompt_tokens: 3, total_tokens: 3 },
        },
        { headers: { "x-request-id": "request-1" } },
      );
    };
    const client = createAliyunTextEmbeddingClient({
      apiKey: "secret-key",
      baseUrl: "https://ws-example.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      dimensions: 64,
      fetch: fetchMock,
    });

    const result = await client.embed("退款流程");

    expect(result).toHaveLength(64);
    expect(requestedUrl).toBe(
      "https://ws-example.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/embeddings",
    );
    expect((requestedInit?.headers as Record<string, string>).authorization).toBe(
      "Bearer secret-key",
    );
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      model: "text-embedding-v4",
      input: ["退款流程"],
      dimensions: 64,
      encoding_format: "float",
    });
  });

  it("splits batches and restores provider order", async () => {
    const batchSizes: number[] = [];
    const fetchMock: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] };
      batchSizes.push(body.input.length);
      return jsonResponse({
        data: body.input
          .map((_, index) => ({ index, embedding: vector(index) }))
          .reverse(),
        usage: { prompt_tokens: body.input.length, total_tokens: body.input.length },
      });
    };
    const texts = Array.from({ length: 11 }, (_, index) => `文本${index}`);
    const response = await createAliyunTextEmbeddingClient({
      apiKey: "secret-key",
      baseUrl: "https://embedding.example.com/compatible-mode/v1/",
      dimensions: 64,
      maxRetries: 0,
      fetch: fetchMock,
    }).embedBatch(texts);

    expect(batchSizes).toEqual([10, 1]);
    expect(response.data.map((item) => item.index)).toEqual(texts.map((_, index) => index));
    expect(response.requestIds).toEqual([]);
  });

  it("rejects authentication failures without exposing the key", async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({ error: { code: "InvalidApiKey" } }, { status: 401 });
    const error = await createAliyunTextEmbeddingClient({
      apiKey: "secret-key",
      baseUrl: "https://ws-example.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
      dimensions: 64,
      maxRetries: 0,
      fetch: fetchMock,
    })
      .embed("文本")
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(AliyunTextEmbeddingError);
    expect(error).toMatchObject({ code: "AUTHENTICATION_FAILED", status: 401 });
    expect(String(error)).not.toContain("secret-key");
  });
});
