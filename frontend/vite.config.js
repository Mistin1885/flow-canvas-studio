import { defineConfig } from 'vite'
import { workbenchPlugin } from './build/workbench.js'

export default defineConfig({ plugins: [workbenchPlugin()] })
