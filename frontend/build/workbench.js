import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'vite'

// Both the server and portable downloads use this exact runtime and stylesheet.
async function compileWorkbench(root) {
  const folder = resolve(root, 'workbench')
  const template = await readFile(resolve(folder, 'index.html'), 'utf8')
  const fragments = new Map()
  for (const [, name] of template.matchAll(/<!-- include ([\w-]+) -->/g)) {
    fragments.set(name, await readFile(resolve(folder, 'markup', name + '.html'), 'utf8'))
  }
  const license = await readFile(resolve(folder, 'vendor/LICENSE.txt'), 'utf8')
  const html = template
    .replace('<!-- layout-license -->', () => '<!--\n' + license + '-->')
    .replace(/<!-- include ([\w-]+) -->/g, (_, name) => fragments.get(name))
  const { output } = await build({
    root,
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    define: { 'import.meta.workbenchRuntime': 'startWorkbench' },
    build: {
      write: false,
      minify: 'esbuild',
      lib: {
        entry: resolve(folder, 'main.js'),
        formats: ['iife'],
        name: 'Workbench',
        fileName: () => 'runtime.js',
        cssFileName: 'workbench',
      },
      rollupOptions: {
        output: {
          // The named closure lets a download embed the running version synchronously,
          // including the layout engine, without fetching or evaluating script text.
          banner: '(function startWorkbench() {',
          footer: '})();',
        },
      },
    },
  }).then(([result]) => result)
  const assets = new Map([['workbench.html', html]])
  for (const file of output) {
    assets.set('workbench/' + file.fileName, file.type === 'chunk' ? file.code : file.source)
  }
  return assets
}

export function workbenchPlugin() {
  let root
  return {
    name: 'flow-workbench',
    configResolved(config) {
      root = config.root
    },
    async generateBundle() {
      for (const [fileName, source] of await compileWorkbench(root)) {
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
    configureServer(server) {
      let compiled
      server.watcher.on('all', (_, file) => {
        if (file.startsWith(resolve(root, 'workbench') + '/')) compiled = undefined
      })
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0].slice(1)
        const types = {
          'workbench.html': 'text/html',
          'workbench/runtime.js': 'text/javascript',
          'workbench/workbench.css': 'text/css',
        }
        if (!Object.hasOwn(types, path)) return next()
        try {
          compiled ??= compileWorkbench(root)
          const assets = await compiled
          res.setHeader('Content-Type', types[path] + '; charset=utf-8')
          res.end(assets.get(path))
        } catch (error) {
          compiled = undefined
          next(error)
        }
      })
    },
  }
}
