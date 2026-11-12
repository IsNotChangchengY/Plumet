import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const watch = process.argv.includes('--watch')

const pages = {
  configFile: false,
  root: resolve(root, 'src'),
  publicDir: resolve(root, 'public'),
  plugins: [react()],
  build: {
    outDir: dist,
    emptyOutDir: true,
    target: 'chrome114',
    rollupOptions: {
      input: {
        sidepanel: resolve(root, 'src/sidepanel/index.html'),
        options: resolve(root, 'src/options/index.html'),
        learning: resolve(root, 'src/learning/index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react-vendor'
          }
          return undefined
        },
      },
    },
    watch: watch ? {} : null,
  },
}

const background = {
  configFile: false,
  root,
  build: {
    outDir: dist,
    emptyOutDir: false,
    target: 'chrome114',
    minify: true,
    watch: watch ? {} : null,
    lib: {
      entry: resolve(root, 'src/background/index.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
}

const content = {
  configFile: false,
  root,
  build: {
    outDir: dist,
    emptyOutDir: false,
    target: 'chrome114',
    minify: true,
    watch: watch ? {} : null,
    lib: {
      entry: resolve(root, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'YuyiContent',
      fileName: () => 'content.js',
    },
  },
}

const configs = [pages, background, content]

for (const config of configs) {
  const running = build(config)
  if (!watch) {
    await running
  } else {
    running.catch((error) => {
      console.error(error)
      process.exit(1)
    })
  }
}

if (watch) {
  console.log('[yuyi] watching for changes...')
}
