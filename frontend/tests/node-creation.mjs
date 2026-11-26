import { expect } from '@playwright/test'

export async function verifyNodeCreation(alice, bob, origin) {
  const catalog = await (await alice.request.get(origin + '/api/catalog')).json()
  const response = await alice.request.post(origin + '/api/workspaces/' + catalog.workspaces[0].id + '/canvases',
    { data: { name: 'Concurrent creation', graph: {
      schemaVersion: 1, documentType: 'dfx-project-flow',
      nodes: { Root: { id: 'Root', title: 'Start', group: 'Test', decision: false, content: [] } }, edges: [],
    } } })
  const { id } = await response.json()
  const url = origin + '/#canvas/' + id
  await Promise.all([alice.goto(url), bob.goto(url)])
  const frames = [alice, bob].map(page => page.frameLocator('iframe'))
  for (const [index, f] of frames.entries()) {
    await f.locator('#create-node').click()
    await expect(f.locator('#node-id')).toHaveValue('STEP1')
    await f.locator('#node-id').fill('Custom_ID')
    await f.locator('#node-type').selectOption('decision')
    await expect(f.locator('#node-id')).toHaveValue('Custom_ID')
    await f.locator('#suggest-id').click()
    await expect(f.locator('#node-id')).toHaveValue('DEC1')
    await f.locator('#node-title').fill('Decision ' + index)
    await f.locator('#add-incoming').click()
    const picker = f.locator('#added-incoming [role=combobox]')
    await picker.fill('Root')
    await picker.press('Enter')
    for (const field of ['role', 'where']) {
      await f.locator('#' + field + '-name').fill(field + index)
      await f.locator('#add-' + field).click()
      await expect(f.locator('#node-' + field)).toHaveValue(field + index)
    }
  }
  const apply = frame => frame.getByRole('button', { name: '套用變更' }).click()
  await apply(frames[0])
  await expect(frames[0].locator('#workspace-save-state')).toHaveText('已同步')
  await apply(frames[1])
  await expect(bob.locator('.importDialog')).toContainText('DEC2')
  await bob.getByRole('button', { name: '確認並套用' }).click()
  await expect.poll(async () => {
    const { graph } = await (await alice.request.get(origin + '/api/canvases/' + id)).json()
    return [graph.nodes.DEC1?.title, graph.nodes.DEC2?.title, graph.ownerRoleOptions, graph.locationOptions, graph.edges.map(e => [e.from, e.to])]
  }).toEqual(['Decision 0', 'Decision 1', ['role0', 'role1'], ['where0', 'where1'], [['Root', 'DEC1'], ['Root', 'DEC2']]])

  const [a, b] = frames
  await expect(a.locator('.node[data-node-id="DEC2"]')).toBeVisible()
  await a.locator('#canvas-edit').click()
  await a.locator('.node[data-node-id="DEC1"] .node-body').click()
  await a.locator('#canvas-duplicate').click()
  await expect(b.locator('.node[data-node-id="DEC3"] .node-title')).toHaveText('Decision 0')
  const { graph } = await (await alice.request.get(origin + '/api/canvases/' + id)).json()
  const { layoutPosition, ...copy } = graph.nodes.DEC3
  expect(copy).toEqual({ ...graph.nodes.DEC1, id: 'DEC3' })
  expect(layoutPosition).toEqual({ x: expect.any(Number), y: expect.any(Number) })
  expect(graph.edges).toHaveLength(2)
}
