import { ChatOpenAI } from "@langchain/openai";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ModelConnectionConfiguration } from "./ModelConfiguration.ts";

type ConnectionSnapshot = {
  readonly configuration: ModelConnectionConfiguration;
  readonly client: ChatOpenAI;
};

/** Shared connection source; running tasks retain a snapshot until they finish. */
export default class LiveModelConnection {
  private current: ConnectionSnapshot;
  private readonly scope = new AsyncLocalStorage<ConnectionSnapshot>();

  constructor(configuration: ModelConnectionConfiguration) {
    this.current = this.createSnapshot(configuration);
  }

  getIdentity(): { providerKey: string; modelKey: string } {
    const configuration = (this.scope.getStore() ?? this.current).configuration;
    const endpoint = new URL(configuration.baseUrl);
    // Authentication and URL query parameters never enter run metadata.
    return {
      providerKey: endpoint.origin + endpoint.pathname,
      modelKey: configuration.modelName,
    };
  }

  getClient(): ChatOpenAI {
    return (this.scope.getStore() ?? this.current).client;
  }

  captureScope(): <T>(operation: () => T) => T {
    const snapshot = this.scope.getStore() ?? this.current;
    return (operation) => this.scope.run(snapshot, operation);
  }

  withSnapshot<T>(operation: () => T): T {
    return this.captureScope()(operation);
  }

  withNewTask<T>(operation: () => T): T {
    return this.scope.run(this.current, operation);
  }

  /** Prepare before persistence; the returned commit only replaces an in-memory reference. */
  prepareUpdate(configuration: ModelConnectionConfiguration): () => void {
    const previous = this.current.configuration;
    if (
      previous.modelName === configuration.modelName &&
      previous.baseUrl === configuration.baseUrl &&
      previous.apiKey === configuration.apiKey
    ) {
      return () => undefined;
    }
    const next = this.createSnapshot(configuration);
    return () => {
      this.current = next;
    };
  }

  private createSnapshot(configuration: ModelConnectionConfiguration): ConnectionSnapshot {
    return Object.freeze({
      configuration: Object.freeze({ ...configuration }),
      client: new ChatOpenAI({
        model: configuration.modelName,
        apiKey: configuration.apiKey,
        configuration: { baseURL: configuration.baseUrl },
      }),
    });
  }
}
