import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage();
export function currentContext() {
  const context = requestContext.getStore();
  if (!context) throw new Error('Event request context unavailable');
  return context;
}
