import { expect } from '@playwright/test'

export async function verifyHighlightBadges(alice, bob, origin) {
  const catalog = await (await alice.request.get(origin + '/api/catalog')).json()
  const root = { id: 'Root', title: 'Review', group: 'QA', decision: false, content: [] }
  const created = await alice.request.post(origin + '/api/workspaces/' + catalog.workspaces[0].id + '/canvases',
    { data: { name: 'Badge test', graph: {
      schemaVersion: 1, documentType: 'dfx-project-flow', nodes: { Root: root }, edges: [],
    } } })
  const { id } = await created.json()
  await Promise.all([alice, bob].map(page => page.goto(origin + '/#canvas/' + id)))
  const a = alice.frameLocator('iframe'), b = bob.frameLocator('iframe')
  await a.locator('#edit-node').click()
  await a.locator('#badge-new').click()
  await a.locator('#badge-name').fill('Large impact')
  await a.locator('#badge-style').selectOption('outline')
  await a.locator('#badge-style-apply').click()
  await a.getByRole('button', { name: '套用變更' }).click()
  const badge = '.highlight-badge.outline'
  const card = a.locator('.node[data-node-id="Root"]')
  await expect(b.locator('.badge-rail.top ' + badge)).toHaveText('⚠Large impact')
  await a.locator('#canvas-edit').click()
  const chip = card.locator('.badge-rail.top ' + badge)
  await chip.scrollIntoViewIfNeeded()
  const start = await chip.boundingBox(), end = await card.boundingBox()
  await alice.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await alice.mouse.down()
  await alice.mouse.move(end.x + end.width / 2, end.y + end.height + 8, { steps: 8 })
  await alice.mouse.up()
  await expect(b.locator('.badge-rail.bottom ' + badge)).toBeVisible()
  const snapshot = await (await bob.request.get(origin + '/api/canvases/' + id)).json()
  expect(snapshot.graph.nodes.Root).toEqual({ ...root, badges: { 'Large impact': 'bottom' } })
  await bob.reload()
  await expect(b.locator('.badge-rail.bottom ' + badge)).toBeVisible()
}
