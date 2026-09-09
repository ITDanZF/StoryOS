import { AsyncLocalStorage } from "node:async_hooks";
export type RequestContext = { readonly ownerId: number; readonly requestId: string };
export const requestContext = new AsyncLocalStorage<RequestContext>();
export function currentRequestOwner(): number | undefined {
  return requestContext.getStore()?.ownerId;
}
