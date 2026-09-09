export type ModelConnectionConfiguration = {
  readonly modelName: string;
  readonly apiKey: string;
  readonly baseUrl: string;
};

type ModelConfigurationSource = {
  readonly MODEL_NAME?: string;
  readonly MODEL_API_KEY?: string;
  readonly MODEL_BASE_URL?: string;
};

function requireConfigurationValue(
  value: string | undefined,
  key: keyof ModelConfigurationSource,
): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing model configuration: ${key}`);
  return normalized;
}

export function createModelConnectionConfiguration(
  source: ModelConfigurationSource,
): ModelConnectionConfiguration {
  return Object.freeze({
    modelName: requireConfigurationValue(source.MODEL_NAME, "MODEL_NAME"),
    apiKey: requireConfigurationValue(source.MODEL_API_KEY, "MODEL_API_KEY"),
    baseUrl: requireConfigurationValue(source.MODEL_BASE_URL, "MODEL_BASE_URL"),
  });
}

export function readModelConnectionConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ModelConnectionConfiguration {
  return createModelConnectionConfiguration({
    MODEL_NAME: environment.MODEL_NAME,
    MODEL_API_KEY: environment.MODEL_API_KEY,
    MODEL_BASE_URL: environment.MODEL_BASE_URL,
  });
}
