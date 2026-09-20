import { describe, expect, it } from "vitest";
import {
  createModelConnectionConfiguration,
  readModelConnectionConfigurationFromEnvironment,
} from "../../src/main/agent/model/ModelConfiguration.ts";

describe("ModelConfiguration behavior", () => {
  it("normalizes persisted configuration into an immutable model connection", () => {
    const configuration = createModelConnectionConfiguration({
      modelName: "  model-a  ",
      apiKey: "  secret  ",
      baseUrl: "  https://example.test/v1  ",
    });

    expect(configuration).toEqual({
      modelName: "model-a",
      apiKey: "secret",
      baseUrl: "https://example.test/v1",
    });
    expect(Object.isFrozen(configuration)).toBe(true);
  });

  it("fails early when a required connection value is missing", () => {
    expect(() =>
      createModelConnectionConfiguration({
        modelName: "model-a",
        apiKey: "",
        baseUrl: "https://example.test/v1",
      }),
    ).toThrow("Missing model configuration: apiKey");
  });

  it("keeps environment loading in the compatibility composition helper", () => {
    expect(
      readModelConnectionConfigurationFromEnvironment({
        MODEL_NAME: "legacy-model",
        MODEL_API_KEY: "legacy-key",
        MODEL_BASE_URL: "https://legacy.example/v1",
      }),
    ).toEqual({
      modelName: "legacy-model",
      apiKey: "legacy-key",
      baseUrl: "https://legacy.example/v1",
    });
  });
});
