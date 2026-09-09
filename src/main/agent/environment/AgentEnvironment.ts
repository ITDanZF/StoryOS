import { AsyncLocalStorage } from "node:async_hooks";

export type ApplicationEnvironment = {
  readonly agentHome: string;
  readonly bundledSkillRoot: string;
  readonly workspacePath?: string;
};
const environments = new AsyncLocalStorage<ApplicationEnvironment>();
export const currentApplicationEnvironment = (): ApplicationEnvironment | undefined =>
  environments.getStore();
export function withApplicationEnvironment<T>(
  environment: ApplicationEnvironment,
  operation: () => T,
): T {
  return environments.run(environment, operation);
}
