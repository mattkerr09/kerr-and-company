import { defineConfig } from '@playwright/test';

/**
 * No browser projects are declared on purpose: every spec uses
 * APIRequestContext, so there is nothing to launch and no binaries to install.
 * A gate that takes minutes gets skipped, and a skipped gate is no gate.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: [['list']],
  use: { ignoreHTTPSErrors: false },
});
