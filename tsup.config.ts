import { defineConfig } from 'tsup'

export default defineConfig([
  // ESM and CJS builds (for npm consumers)
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: false, // Requires strict type fixes in CloudSignalClient.ts
    sourcemap: true,
    clean: true,
    minify: false, // Don't minify npm builds
    treeshake: true,
    target: 'es2020',
    platform: 'browser',
    external: ['mqtt'],
    outExtension({ format }) {
      return format === 'esm' ? { js: '.js' } : { js: '.cjs' }
    },
    banner: {
      js: `/**
 * CloudSignal WebSocket Client v2.2.1
 * https://cloudsignal.io
 * MIT License
 */`,
    },
  },
  // IIFE build (for CDN/browser script tag)
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    dts: false,  // IIFE doesn't need declarations
    sourcemap: true,
    clean: false, // Don't clean (already cleaned by first build)
    minify: true,
    treeshake: true,
    target: 'es2020',
    platform: 'browser',
    globalName: 'CloudSignal',
    noExternal: [/.*/], // Bundle everything including mqtt
    outExtension() {
      return { js: '.global.js' }
    },
    banner: {
      js: `/**
 * CloudSignal WebSocket Client v2.2.1
 * https://cloudsignal.io
 * MIT License
 */`,
    },
  },
])
