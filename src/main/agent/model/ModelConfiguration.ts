export type ModelConnectionConfiguration = {
  readonly modelName: string;
  readonly apiKey: string;
  readonly baseUrl: string;
};

type ModelConfigurationSource = {
  readonly modelName?: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
};

function requireConfigurationValue(
  value: string | undefined,
  key: keyof ModelConnectionConfiguration,
): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing model configuration: ${key}`);
  return normalized;
}

export function createModelConnectionConfiguration(
  source: ModelConfigurationSource,
): ModelConnectionConfiguration {
  return Object.freeze({
    modelName: requireConfigurationValue(source.modelName, "modelName"),
    apiKey: requireConfigurationValue(source.apiKey, "apiKey"),
    baseUrl: requireConfigurationValue(source.baseUrl, "baseUrl"),
  });
}

export function readModelConnectionConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ModelConnectionConfiguration {
  return createModelConnectionConfiguration({
    modelName: environment.MODEL_NAME,
    apiKey: environment.MODEL_API_KEY,
    baseUrl: environment.MODEL_BASE_URL,
  });
}
