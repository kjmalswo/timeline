import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const koreanDictionary = fileURLToPath(new URL('.', import.meta.resolve('dictionary-ko')))

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@korean-dictionary': koreanDictionary } },
  worker: { format: 'es' },
  logLevel: 'warn',
})
