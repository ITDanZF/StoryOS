export type ModelProvider = 'deepseek' | 'openai' | 'qwen';
export type ModelProviderConfig = {
    label: string;
    defaultModel: string;
    baseURL: string;
};

/**
 * 模型常量提供者
 */
export const MODEL_PROVIDER_OPTIONS: Record<
    ModelProvider,
    ModelProviderConfig
> = {
    deepseek: {
        label: 'DeepSeek',
        defaultModel: 'deepseek-v4-pro',
        baseURL: 'https://api.deepseek.com',
    },
    openai: {
        label: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        baseURL: 'https://api.openai.com/v1',
    },
    qwen: {
        label: 'Qwen',
        defaultModel: 'qwen-plus',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
};
