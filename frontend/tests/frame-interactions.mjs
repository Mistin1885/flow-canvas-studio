import { expect } from '@playwright/test'

export async function verifyFrameInteractions(alice, bob, origin) {
  const { workspaces } = await (await alice.request.get(origin + '/api/catalog')).json()
  const node = (id, x, y, type = 'action') => ({ id, title: id, type, group: 'QA', decision: false, content: [], layoutPosition: { x, y } })
  const graph = { schemaVersion: 1, documentType: 'dfx-project-flow', edges: [], nodes: {
    A: node('A', 100, 140), B: node('B', 380, 140),
    F: { ...node('F', 60, 60, 'frame'), frameMembers: ['A', 'B'] },
  }, layoutGroups: [{ name: 'QA', direction: 'auto', nodeStyle: { frame: 'on' } }] }
  const response = await alice.request.post(origin + '/api/workspaces/' + workspaces[0].id + '/canvases', { data: { name: 'Frame interactions', graph } })
  expect(response.ok()).toBeTruthy()
  const { id } = await response.json()
  await Promise.all([alice.goto(origin + '/#canvas/' + id), bob.goto(origin + '/#canvas/' + id)])
  const a = alice.frameLocator('iframe'), b = bob.frameLocator('iframe')
  const card = (f, id) => f.locator(`.node[data-node-id="${id}"]`)
  const saved = async () => (await (await alice.request.get(origin + '/api/canvases/' + id)).json()).graph
  const drag = async (from, dx, dy) => {
    await alice.mouse.move(from.x, from.y); await alice.mouse.down()
    await alice.mouse.move(from.x + dx, from.y + dy, { steps: 8 }); await alice.mouse.up()
  }
  await expect(card(a, 'F')).toBeVisible()
  await a.locator('#canvas-edit').click()
  const rim = card(a, 'F').locator('.frame-rim[data-side="bottom"]')
  await rim.click()
  await expect(a.locator('dialog[open]')).toHaveCount(0)
  const r = await rim.boundingBox()
  await drag({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, 40, 30)
  await expect.poll(async () => (await saved()).nodes.F.layoutSize).toBeTruthy()
  const moved = (await saved()).nodes
  expect(moved.A.layoutPosition.x - 100).toBe(moved.B.layoutPosition.x - 380)
  expect(moved.A.layoutPosition.y - 140).toBe(moved.B.layoutPosition.y - 140)
  await expect(card(b, 'F')).toHaveCSS('width', moved.F.layoutSize.width + 'px')
  const grip = await card(a, 'F').locator('[data-corner="se"]').boundingBox()
  await drag({ x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, 75, 40)
  await expect.poll(async () => (await saved()).nodes.F.layoutSize.width).toBeGreaterThan(moved.F.layoutSize.width)
  const resized = (await saved()).nodes.F.layoutSize
  expect((await saved()).nodes.A.layoutPosition).toEqual(moved.A.layoutPosition)
  await a.locator('#history-undo').click()
  await expect.poll(async () => (await saved()).nodes.F.layoutSize).toEqual(moved.F.layoutSize)
  await a.locator('#history-redo').click()
  await expect.poll(async () => (await saved()).nodes.F.layoutSize).toEqual(resized)
  await rim.dblclick()
  await expect(a.locator('#node-id')).toHaveValue('F')
  await a.locator('#editor-close').click()
  await a.locator('#canvas-members').click()
  await expect(a.locator('#member-object option')).toHaveCount(1)
  await expect(a.locator('#members-heading')).toHaveText('管理框內步驟')
  await a.locator('#members-close').click()
  await a.locator('#group-toggle').click()
  await a.locator('#manage-groups').click()
  await expect(a.locator('#groups-heading')).toHaveText('管理排版群組')
  await expect(a.locator('#group-manager-target option')).toHaveText(['QA'])
  await expect(a.locator('.style-group-frame,[data-endpoint="group:QA"]')).toHaveCount(0)
  await a.locator('#groups-close').click()
  await a.locator('#group-toggle').click()
  await card(a, 'A').locator('.node-body').click()
  await expect(a.locator('#canvas-members')).toBeDisabled()
  const before = (await saved()).nodes.A.layoutPosition
  await a.locator('#canvas-create-frame').click()
  await expect.poll(async () => (await saved()).nodes.FRAME1?.frameMembers).toEqual(['A'])
  const framed = (await saved()).nodes
  expect(framed.A.layoutPosition).toEqual(before)
  expect(framed.FRAME1.layoutPosition.x).toBeCloseTo(before.x - 24)
  expect(framed.FRAME1.layoutPosition.y).toBeCloseTo(before.y - 60)
  await expect(card(b, 'FRAME1')).toBeVisible()
}
