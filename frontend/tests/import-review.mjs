import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { expect } from '@playwright/test'

export async function verifyImport(alice, bob, origin) {
  const node = (id) => ({ id, title: id, group: 'Test', decision: false, content: [] })
  const graph = {
    schemaVersion: 1,
    documentType: 'dfx-project-flow',
    nodes: { A: node('A'), B: node('B') },
    edges: [],
  }
  const jsonFile = (value) => ({
    name: 'test.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  })
  await alice.goto(origin)
  await alice.getByRole('button', { name: '從 JSON 建立', exact: true }).click()
  await alice.getByLabel('流程 JSON').setInputFiles(jsonFile(graph))
  await alice.getByRole('button', { name: '從 JSON 建立畫布' }).click()
  await alice.waitForURL('**/#canvas/*')
  await bob.goto(alice.url())
  const frame = alice.frameLocator('iframe')
  await expect(frame.locator('#workspace-save-state')).toHaveText('已同步')
  await expect(bob.frameLocator('iframe').locator('#workspace-save-state')).toHaveText('已同步')
  const path = '/api/canvases/' + alice.url().split('/').at(-1)
  const review = alice.getByRole('dialog', { name: '從 JSON 更新畫布' })
  const download = alice.waitForEvent('download')
  await frame.locator('#tools-menu summary').click()
  await frame.locator('#debug-export').click()
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'))
  assert.equal(exported.flowCanvasStudioExport.revision, 1)
  await frame.locator('#tools-menu summary').click()
  await frame.locator('#debug-import').click()
  const incoming = structuredClone(graph)
  delete incoming.nodes.A
  incoming.nodes.B.title = 'JSON title'
  incoming.nodes.C = node('C')
  await review.getByLabel('選擇流程 JSON').setInputFiles(jsonFile(incoming))
  await expect(review.getByText('新增 1 · 修改 1 · 移除 1')).toBeVisible()
  const edge = { from: 'A', to: 'B', kind: 'next', label: 'peer' }
  const change = async (base, ops) => {
    const response = await bob.request.post(origin + path + '/changes', { data: { base, ops } })
    assert.equal(response.status(), 200, await response.text())
    return (await response.json()).rev
  }
  let rev = await change(1, [
    { table: 'edges', key: JSON.stringify(['A', 'B', 'next', 'peer']), version: null, value: edge },
    { table: 'nodes', key: 'B', version: 1, value: { ...node('B'), title: 'Team title' } },
    { table: 'nodes', key: 'D', version: null, value: node('D') },
  ])
  const conflict = (key) =>
    review
      .locator('section.conflict')
      .filter({ has: alice.locator('summary').filter({ hasText: '節點 ' + key }) })
  await expect(review.getByText('2 組衝突待選擇', { exact: false })).toBeVisible()
  await conflict('A').getByRole('button', { name: '保留團隊版本' }).click()
  await conflict('B').getByRole('button', { name: '採用 JSON' }).click()
  rev = await change(rev, [
    { table: 'nodes', key: 'B', version: rev, value: { ...node('B'), title: 'Revised team title' } },
  ])
  await expect(review.getByText('1 組衝突待選擇', { exact: false })).toBeVisible()
  await expect(conflict('A').getByRole('button', { name: '保留團隊版本' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await conflict('B').getByRole('button', { name: '採用 JSON' }).click()
  await review.getByRole('button', { name: '套用 2 項變更' }).click()
  await expect(review).toHaveCount(0)
  const saved = await (await alice.request.get(origin + path)).json()
  assert.equal(saved.graph.nodes.B.title, 'JSON title')
  assert.deepEqual(Object.keys(saved.graph.nodes).sort(), ['A', 'B', 'C', 'D'])
  assert.deepEqual(saved.graph.edges, [edge])
  const prior = await (await alice.request.get(origin + path + '/imports/' + rev)).json()
  assert.equal(prior.nodes.B.title, 'Revised team title')
  assert.equal(prior.nodes.C, undefined)
  // An older same-canvas export only proposes the user's offline edits.
  exported.nodes.A.title = 'Offline A'
  exported.nodes.B.title = 'Offline B'
  await frame.locator('#tools-menu summary').click()
  await frame.locator('#debug-import').click()
  await review.getByLabel('選擇流程 JSON').setInputFiles(jsonFile(exported))
  await expect(conflict('B')).toBeVisible()
  await conflict('B').getByRole('button', { name: '保留團隊版本' }).click()
  // Force another write between the selected preview and the server transaction.
  await alice.route(
    '**' + path + '/imports',
    async (route) => {
      await change(saved.canvas.rev, [
        { table: 'nodes', key: 'A', version: 1, value: { ...node('A'), title: 'Last second edit' } },
      ])
      await route.continue()
    },
    { times: 1 },
  )
  await review.getByRole('button', { name: '套用 1 項變更' }).click()
  await expect(conflict('A')).toBeVisible()
  await expect(conflict('B').getByRole('button', { name: '保留團隊版本' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await conflict('A').getByRole('button', { name: '採用 JSON' }).click()
  await review.getByRole('button', { name: '套用 1 項變更' }).click()
  await expect(review).toHaveCount(0)
  const final = (await (await alice.request.get(origin + path)).json()).graph
  assert.equal(final.nodes.A.title, 'Offline A')
  assert.equal(final.nodes.B.title, 'JSON title')
  assert.deepEqual(Object.keys(final.nodes).sort(), ['A', 'B', 'C', 'D'])
  assert.deepEqual(final.edges, [edge])
  assert.equal(final.flowCanvasStudioExport, undefined)
  console.log('Workspace JSON creation, live import review, selective resolution and recovery passed.')
}
