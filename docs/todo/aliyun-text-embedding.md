# 阿里云 Text Embedding 接入

> 2026-09-22 · 实施说明  
> 这一步只建立阿里云 `text-embedding-v4` 的配置和调用接口。小说分块、向量库和检索不在这里。当前不调用 `embed` 或 `embedBatch`。

案例来源是 `E:\workspace\langchainjs-learn\langchain-vector\text-embedding`。该客户端使用百炼 OpenAI 兼容接口，与 LanceDB 无关。StoryOS 按同样的契约在主进程实现，不引用那个学习仓库。

## 1. 要完成的两件事

1. 新建实例时必须填写阿里云 Embedding API Key，以及控制台给出的整段 Base URL。现在新建实例里的 “启用 Text Embedding（可跳过）” 改为必填，不再提供跳过。
2. 主进程提供封装好的调用接口：单条 `embed` 和批量 `embedBatch`。后续小说向量化只调用这个接口，不自己拼 URL、Key 或批次。

对话模型仍是现有的 DeepSeek 配置，和 Embedding Key 分开保存。

## 2. 调用接口

放在 `src/main/agent/embedding/`。通用引擎只负责把文本变成向量，不出现书籍、章节或向量库。

```ts
createAliyunTextEmbeddingClient(options: AliyunTextEmbeddingOptions): AliyunTextEmbeddingClient

interface AliyunTextEmbeddingClient {
  readonly model: "text-embedding-v4";
  readonly dimensions: AliyunEmbeddingDimensions;
  embed(text: string): Promise<readonly number[]>;
  embedBatch(texts: readonly string[]): Promise<AliyunEmbeddingResponse>;
}
```

`embed` 返回一条向量。`embedBatch` 按输入顺序返回全部向量，并带上模型、维度、token 用量和各批请求 ID。

固定行为与案例一致：

| 项 | 值 |
|---|---|
| 模型 | 只接受 `text-embedding-v4` |
| 默认维度 | `1024` |
| 允许维度 | `64`、`128`、`256`、`512`、`768`、`1024`、`1536`、`2048` |
| 单批上限 | `10` 条，超出由客户端拆批后再按原顺序拼回 |
| 地址 | 请求 `{baseUrl}/embeddings`。`baseUrl` 是控制台整段地址，例如 `https://{workspace}.{region}.maas.aliyuncs.com/compatible-mode/v1` |
| 请求体 | `model`、`input`、`dimensions`、`encoding_format: "float"` |
| 超时与重试 | 默认 30 秒、最多重试 2 次；只重试超时、网络错误、`408`、`429` 和 `5xx` |

空文本、非法维度、缺少 Key、缺少或无效的 Base URL，都在发出请求前失败。错误使用独立错误类型，带稳定错误码。错误信息里不放入 API Key，也不放入原始输入文本。

`batchSize`、`timeoutMs`、`maxRetries` 和测试用 `fetch` 留在客户端选项里，不出现在实例表单上。

## 3. 实例初始化要填写的内容

新建实例表单在对话模型之下增加必填的 “文本向量” 区域：

| 字段 | 规则 |
|---|---|
| API Key | 必填，密码框。原样粘贴控制台给出的整段 Key，写入该实例 `config.json`，界面回显只显示是否已配置 |
| Base URL | 必填。原样粘贴控制台给出的整段 OpenAI 兼容地址，必须是 http 或 https，客户端自动补 `/embeddings` |
| 维度 | 默认 `1024`，只能选择上一节的允许值 |

控制台一次给出 Key 和完整地址，地址主机里已经包含工作空间和区域，界面不再单独收集 Workspace ID。模型名称不再手填，保存为 `text-embedding-v4`。修改实例和设置页使用同一组字段。已保存的 Key 留空表示保留原值；更换 Base URL 后必须重新填写 Key。

配置仍写在实例目录的 `config.json`，不写进单本书或写作项目。当前 `schemaVersion: 2` 允许 `embedding.enabled: false` 和任意正整数维度。接入后，一份可进入工作区的实例配置必须包含启用的阿里云 Embedding：模型、Key、地址来源、合法维度。已有 “跳过 Embedding” 的实例在打开时要求补齐，补齐前不创建客户端。不写入空 Key，也不用对话模型的 Key 代替。

## 4. 主进程怎么把接口交出去

`LiveEmbeddingConnection` 按当前实例配置持有一个 `AliyunTextEmbeddingClient`。配置保存成功后替换这个客户端，新的向量请求使用新 Key 和维度。

对外就这一层：

```ts
getTextEmbeddingClient(): AliyunTextEmbeddingClient
```

未配置或配置无效时抛出明确错误，返回值不会是空客户端。后续小说向量化通过它调用 `embed` 或 `embedBatch`。

这一步只把客户端准备好，不调用 `embed` 或 `embedBatch`，也不从界面发起连通性测试。渲染进程不直接持有 Key，也不新增让界面批量取向量的 IPC。`getTextEmbeddingClient()` 供后续小说向量化使用。

现在的 `OpenAICompatibleEmbeddingGateway` 只被这次测试使用，而且不校验阿里云维度、不拆批、不区分错误码。阿里云客户端接上后，Embedding 调用都走新接口；通用网关不再作为 Embedding 入口。

## 5. 这一步的边界

完成后，新建实例能够保存可用的阿里云 Embedding 配置，主进程能够对一段或一批文本返回维度一致的向量。

尚未做的是把章节正文分块、把向量写入向量库，以及片段检索和相似度检索。那些继续以 `docs/todo/novel-vectorization.md` 为准，并调用这里的 `getTextEmbeddingClient()`。
