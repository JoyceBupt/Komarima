import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { vitePreviewPlugin } from './preview/vitePreviewPlugin.ts'

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    vitePreviewPlugin({
      preset: process.env.KOMARIMA_PREVIEW_SCENARIO,
      now: () => new Date(),
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
