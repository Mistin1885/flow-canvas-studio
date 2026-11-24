import assert from 'node:assert/strict'
import { expect } from '@playwright/test'

export async function verifyLegacyEdits(page, origin) {
  const node = id => ({ id, title: id, group: 'QA', decision: false, content: [] })
  const legacy = {
    schemaVersion: 1, documentType: 'dfx-project-flow',
    nodes: { A: { ...node('A'), tags: ['QA', 'Review'] }, Z: node('Z'), B: node('B') },
    edges: ['Z', 'B'].map(to => ({ from: 'A', to, kind: 'next', label: '' })),
    customCategories: [{ name: 'Review', color: '#616161' }],
  }
  const catalog = await (await page.request.get(origin + '/api/catalog')).json()
  const created = await page.request.post(origin + '/api/workspaces/' + catalog.workspaces[0].id + '/canvases',
    { data: { name: 'Legacy editing' } })
  expect(created.ok()).toBeTruthy()
  const { id } = await created.json()
  const endpoint = origin + '/api/canvases/' + id
  const snapshot = async () => (await page.request.get(endpoint)).json()
  await page.goto(origin + '/#canvas/' + id)
  const frame = page.frameLocator('iframe')
  const review = page.getByRole('dialog', { name: '從 JSON 更新畫布' })
  async function upload(graph = legacy) {
    await expect(frame.locator('#workspace-save-state')).toHaveText('已同步')
    const { graph: saved } = await snapshot()
    await expect.poll(() => page.frames()[1].evaluate(() => window.T1Playbook.data)).toEqual(saved)
    await frame.locator('#tools-menu summary').click()
    await frame.locator('#debug-import').click()
    await review.getByLabel('選擇流程 JSON').setInputFiles({
      name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)),
    })
  }
  await upload()
  await review.getByRole('button', { name: /套用.*項變更/ }).click()
  await expect(review).toHaveCount(0)
  const initial = await snapshot()
  assert.deepEqual(initial.graph, legacy)
  await page.reload()
  await expect(page.getByRole('button', { name: '變更紀錄' })).toBeEnabled()
  const submit = frame.getByRole('button', { name: '套用變更' })
  const edit = async () => {
    await frame.locator('#edit-node').click()
    await expect(frame.locator('#node-id')).toHaveValue('A')
  }
  await edit()
  await submit.click()
  await expect(frame.locator('#history-undo')).toBeDisabled()
  assert.deepEqual(await snapshot(), initial)
  await edit()
  await frame.locator('#node-role').fill('Reviewer')
  await submit.click()
  await expect.poll(async () => (await snapshot()).canvas.rev).toBe(initial.canvas.rev + 1)
  const edited = await snapshot()
  const expected = structuredClone(legacy)
  expected.nodes.A.ownerRole = 'Reviewer'
  assert.deepEqual(edited.graph, expected)
  await edit()
  await frame.locator('#node-role').fill('Temporary')
  await frame.locator('#node-role').fill('Reviewer')
  await submit.click()
  assert.deepEqual(await snapshot(), edited)
  await upload()
  await expect(review.getByText('這份 JSON 沒有待套用的差異。')).toBeVisible()
  await review.getByRole('checkbox', { name: /移除 JSON 未提供/ }).check()
  await expect(review.locator('.importDiff summary')).toContainText('ownerRole')
  await review.getByRole('button', { name: '取消' }).click()
  await edit()
  await frame.locator('#node-role').fill('')
  await submit.click()
  await expect.poll(async () => (await snapshot()).canvas.rev).toBe(edited.canvas.rev + 1)
  assert.deepEqual((await snapshot()).graph, legacy)

  const modeled = structuredClone(legacy)
  modeled.fieldDefinitions = [{ id: 'hours', name: 'Hours', type: 'number' }]
  Object.assign(modeled.nodes.A, { gatewayRule: 'join-all', fieldValues: { hours: 4 } })
  await upload(modeled)
  await review.getByRole('button', { name: '套用 2 項變更' }).click()
  await expect(review).toHaveCount(0)
  const renamed = structuredClone(legacy)
  renamed.nodes.A.title = 'Review changes'
  await upload(renamed)
  await expect(review.locator('.importDiff summary')).toHaveCount(1)
  await expect(review.locator('.importDiff summary')).toContainText('title')
  await review.getByRole('button', { name: '套用 1 項變更' }).click()
  await expect(review).toHaveCount(0)
  modeled.nodes.A.title = renamed.nodes.A.title
  assert.deepEqual((await snapshot()).graph, modeled)
  await upload(renamed)
  await review.getByRole('checkbox', { name: /移除 JSON 未提供/ }).check()
  await review.getByRole('button', { name: '套用 2 項變更' }).click()
  await expect(review).toHaveCount(0)
  assert.deepEqual((await snapshot()).graph, renamed)
}
