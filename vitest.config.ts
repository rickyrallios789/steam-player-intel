import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Vitest only exercises pure logic in src/shared (no Electron / native deps),
// so the whole intelligence core can be tested in plain Node / CI.
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared') }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/shared/**/*.ts'] }
  }
})
