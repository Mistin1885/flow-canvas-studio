/* Start an isolated server and exercise the real workbench from two browser profiles. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'

import { verifySharedOptions } from './shared-options.mjs'
import { verifyGroupMove } from './group-move.mjs'
import { verifyCanvasLifecycle } from './canvas-lifecycle.mjs'
import { verifyAdminBackups } from './admin-backups.mjs'
import { verifyImport } from './import-review.mjs'
import { verifyLegacyEdits } from './legacy-edits.mjs'
import { verifyHighlightBadges } from './highlight-badges.mjs'
import { verifyStylePalette } from './style-palette.mjs'
import { verifyNodeCreation } from './node-creation.mjs'
import { verifyFormDrafts } from './form-drafts.mjs'
import { verifyDraftReview } from './draft-review.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const data = await mkdtemp(join(tmpdir(), 'flow-canvas-e2e-'))
const origin = process.env.FLOW_E2E_ORIGIN
if (!origin || !process.env.FLOW_E2E_COMPOSE_PROJECT) throw new Error('Run deploy/docker/verify.sh for an isolated PostgreSQL instance.')
let browser
try {
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
  await expect(a.locator('#node-presence')).toContainText('也正在編輯此節點')
  await expect(b.locator('#node-presence')).toBeVisible()
  await a.locator('#node-title').fill('第一位成員的變更')
  await b.locator('#node-title').fill('第二位成員的草稿')
  await a.getByRole('button', { name: '套用變更' }).click()
  await expect(a.locator('#workspace-save-state')).toHaveText('已同步')
  await expect(b.locator('#node-presence')).toBeHidden()
  await expect(b.locator('#node-title')).toHaveValue('第二位成員的草稿')
  await b.getByRole('button', { name: '套用變更' }).click()
  await expect(bob.getByRole('dialog', {name: '比對草稿與團隊版本'})).toBeVisible()
  const original = bob.url()
  await bob.reload()
  await bob.getByRole('dialog', {name: '比對草稿與團隊版本'}).getByRole('button', {name: '關閉'}).click()
  await bob.getByRole('button', { name: '另存草稿畫布' }).click()
  await expect(b.locator('.node-title').first()).toHaveText('第二位成員的草稿')
  assert.notEqual(original, bob.url())
  await expect(a.locator('.node-title').first()).toHaveText('第一位成員的變更')
  const downloaded = alice.waitForEvent('download')
  await a.locator('#workspace-save').click()
  const file = join(data, 'portable.html')
  await (await downloaded).saveAs(file)

  const offline = await browser.newContext({ offline: true })
  const page = await offline.newPage()
  await page.goto(pathToFileURL(file).href)
  await expect(page.locator('.node-title').first()).toHaveText('第一位成員的變更')
  await expect(page.locator('script[src], link[rel="stylesheet"]')).toHaveCount(0)
  await page.locator('#edit-node').click()
  await page.locator('#node-title').fill('離線編輯')
  await page.getByRole('button', { name: '套用變更' }).click()
  await expect(page.locator('.node-title').first()).toHaveText('離線編輯')
  await offline.close()
  await verifyDraftReview(alice, bob)
  await verifyFormDrafts(alice, bob)
  await verifyImport(alice, bob, origin)
  await verifyLegacyEdits(alice, origin)
  await verifyNodeCreation(alice, bob, origin)
  await verifyStylePalette(alice, origin)
  await verifyGroupMove(alice, bob, origin)
  await verifyHighlightBadges(alice, bob, origin)
  await verifySharedOptions(alice, bob, origin)
  await verifyCanvasLifecycle(alice, bob, origin)
  await verifyAdminBackups(alice, bob, origin, root)
  console.log('Standalone HTML reopened and edited offline.')
  console.log('Two-browser sync, draft recovery after reload, and independent fork passed.')
} finally {
  await browser?.close()
  await rm(data, { recursive: true, force: true })
}
