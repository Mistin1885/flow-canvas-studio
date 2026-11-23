/* Start an isolated server and exercise the real workbench from two browser profiles. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium, expect } from '@playwright/test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const data = await mkdtemp(join(tmpdir(), 'flow-canvas-e2e-'))
const server = spawn(
  join(root, '.venv/bin/python'),
  ['-m', 'uvicorn', 'backend.main:app', '--port', '0', '--no-proxy-headers'],
  {
    cwd: root,
    env: { ...process.env, FLOW_AUTH: 'local', FLOW_DATA_DIR: data, FLOW_DATABASE_SOCKET: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  },
)
let browser
try {
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 15000)
    server.stderr.on('data', (chunk) => {
      const address = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
      if (address) {
        clearTimeout(timer)
        resolve(address)
      }
    })
    server.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error('Server exited ' + code))
    })
  })
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined })
  const alice = await browser.newPage()
  const bob = await browser.newPage()
  await alice.goto(origin)
  await alice.getByRole('button', { name: '建立第一張畫布' }).click()
  await alice.getByRole('textbox', { name: '名稱', exact: true }).fill('協作測試')
  await alice.getByRole('dialog').getByRole('button', { name: '建立畫布' }).click()
  await alice.waitForURL('**/#canvas/*')
  await bob.goto(alice.url())
  const a = alice.frameLocator('iframe'),
    b = bob.frameLocator('iframe')
  await a.locator('#create-node').click()
  await a.locator('#node-title').fill('初始節點')
  await a.getByRole('button', { name: '套用變更' }).click()
  await expect(b.locator('.node-title').first()).toHaveText('初始節點')
  await a.locator('#edit-node').click()
  await b.locator('#edit-node').click()
  await a.locator('#node-title').fill('第一位成員的變更')
  await b.locator('#node-title').fill('第二位成員的草稿')
  await a.getByRole('button', { name: '套用變更' }).click()
  await expect(a.locator('#workspace-save-state')).toHaveText('已同步')
  await expect(b.locator('#node-title')).toHaveValue('第二位成員的草稿')
  await b.getByRole('button', { name: '套用變更' }).click()
  await expect(bob.getByRole('alert')).toContainText('已由其他人變更')
  const original = bob.url()
  await bob.reload()
  await bob.getByRole('button', { name: '另存草稿畫布' }).click()
  await expect(b.locator('.node-title').first()).toHaveText('第二位成員的草稿')
  assert.notEqual(original, bob.url())
  await expect(a.locator('.node-title').first()).toHaveText('第一位成員的變更')
  console.log('Two-browser sync, draft recovery after reload, and independent fork passed.')
} finally {
  await browser?.close()
  if (server.exitCode === null && server.signalCode === null) {
    const done = once(server, 'exit')
    server.kill()
    await done
  }
  await rm(data, { recursive: true, force: true })
}
