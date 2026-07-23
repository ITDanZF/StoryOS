import type { ModelGateway } from "./ModelGateway.ts";

export const INHERIT_MODEL_REFERENCE = "inherit";

export type ModelGatewayRegistration = {
  readonly reference: string;
  readonly gateway: ModelGateway;
};

function normalizeReference(reference: string): string {
  const normalized = reference.trim();
  if (!normalized) throw new Error("Model reference is required.");
  return normalized;
}

export default class ModelRouter {
  private readonly gateways = new Map<string, ModelGateway>();

  constructor(
    private readonly defaultGateway: ModelGateway,
    registrations: readonly ModelGatewayRegistration[] = [],
  ) {
    for (const registration of registrations) {
      this.register(registration.reference, registration.gateway);
    }
  }

  register(reference: string, gateway: ModelGateway): void {
    const normalized = normalizeReference(reference);
    if (normalized === INHERIT_MODEL_REFERENCE) {
      throw new Error(`Reserved model reference cannot be registered: ${normalized}`);
    }
    if (this.gateways.has(normalized)) {
      throw new Error(`Model reference is already registered: ${normalized}`);
    }
    this.gateways.set(normalized, gateway);
  }

  resolve(reference?: string): ModelGateway {
    const normalized = reference?.trim();
    if (!normalized || normalized === INHERIT_MODEL_REFERENCE) {
      return this.defaultGateway;
    }

    const gateway = this.gateways.get(normalized);
    if (!gateway) throw new Error(`Unknown model reference: ${normalized}`);
    return gateway;
  }
}
