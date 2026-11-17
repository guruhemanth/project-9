import { startAllServers, stopAllServers } from './server-manager';

export async function setup() {
  console.log('[E2E Global Setup] Booting API Gateway & microservices stack...');
  await startAllServers(true);
  console.log('[E2E Global Setup] All services active and ready.');
}

export async function teardown() {
  console.log('[E2E Global Teardown] Shutting down services stack...');
  await stopAllServers(true);
  console.log('[E2E Global Teardown] Clean shutdown completed.');
}
