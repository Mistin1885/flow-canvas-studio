import { expect } from '@playwright/test'

export async function verifyGroupMove(alice, bob, origin) {
  const { workspaces } = await (await alice.request.get(origin + '/api/catalog')).json()
  const positions = { A: { x: 20, y: 40 }, B: { x: 30, y: 170 }, C: { x: 540, y: 40 } }
  const nodes = Object.fromEntries(Object.entries(positions).map(([id, layoutPosition]) =>
    [id, { id, title: id, group: 'Test', decision: false, content: [], layoutPosition }]))
  const response = await alice.request.post(origin + '/api/workspaces/' + workspaces[0].id + '/canvases', {
    data: { name: 'Move selection', graph: { schemaVersion: 1, documentType: 'dfx-project-flow', nodes, edges: [] } },
  })
  expect(response.ok()).toBeTruthy()
  const { id } = await response.json()
  const url = origin + '/#canvas/' + id
  await Promise.all([alice.goto(url), bob.goto(url)])
  const a = alice.frameLocator('iframe'), b = bob.frameLocator('iframe')
  const card = (frame, id) => frame.locator(`.node[data-node-id="${id}"]`)
  await expect(card(b, 'B')).toBeVisible()
  await a.locator('#canvas-edit').click()
  await a.locator('#canvas-box').click()
  const first = await card(a, 'A').boundingBox(), second = await card(a, 'B').boundingBox()
  const drag = async (x, y, endX, endY) => {
    await alice.mouse.move(x, y)
    await alice.mouse.down()
    await alice.mouse.move(endX, endY, { steps: 8 })
    await alice.mouse.up()
  }
  await drag(Math.min(first.x, second.x) - 6, first.y - 6,
    Math.max(first.x + first.width, second.x + second.width) + 6, second.y + second.height + 6)
  await expect(a.locator('.node.edit-picked')).toHaveCount(2)
  const snapshot = async () => (await alice.request.get(origin + '/api/canvases/' + id)).json()
  const previous = (await snapshot()).canvas.rev
  await drag(first.x + 15, first.y + 18, first.x + 85, first.y + 48)
  await expect.poll(async () => (await snapshot()).canvas.rev).toBe(previous + 1)
  const moved = (await snapshot()).graph.nodes
  const dx = moved.A.layoutPosition.x - positions.A.x, dy = moved.A.layoutPosition.y - positions.A.y
  expect(dx).toBeGreaterThan(0)
  expect(moved.B.layoutPosition).toEqual({ x: positions.B.x + dx, y: positions.B.y + dy })
  expect(moved.C.layoutPosition).toEqual(positions.C)
  const peerPosition = () => card(b, 'B').evaluate(el => el.ownerDocument.defaultView.T1Playbook.data.nodes.B.layoutPosition)
  await expect.poll(peerPosition).toEqual(moved.B.layoutPosition)
  await a.locator('#history-undo').click()
  await expect.poll(async () => {
    const { graph } = await snapshot()
    return Object.fromEntries(Object.entries(graph.nodes).map(([id, n]) => [id, n.layoutPosition]))
  }).toEqual(positions)
  await expect.poll(peerPosition).toEqual(positions.B)
}
