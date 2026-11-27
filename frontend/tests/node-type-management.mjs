import { expect } from '@playwright/test'

// Run in the disposable PostgreSQL suite; no production workspace data is used.
export async function verifyNodeTypeManagement(alice, bob, origin) {
  const node = id => ({ id, title: id, group: 'QA', type: 'action', decision: false, content: [] })
  const graph = { schemaVersion: 1, documentType: 'dfx-project-flow',
    nodes: { A: { ...node('A'), nodeStyle: { edge: '#112233' }, tags: ['Review'] }, B: node('B') },
    edges: [{ from: 'A', to: 'B', kind: 'next', label: 'Review', conditionColor: '#556677' }],
    customCategories: [{ name: 'Review', color: '#994466' }],
    layoutGroups: [{ name: 'QA', direction: 'TD', nodeStyle: { edge: '#778899' } }],
  }
  const catalog = await (await alice.request.get(origin + '/api/catalog')).json()
  const response = await alice.request.post(origin + '/api/workspaces/' + catalog.workspaces[0].id + '/canvases',
    { data: { name: 'Node type management', graph } })
  expect(response.ok()).toBeTruthy()
  const { id } = await response.json()
  for (const page of [alice, bob]) await page.goto(origin + '/#canvas/' + id)
  const a = alice.frameLocator('iframe'), b = bob.frameLocator('iframe')
  const saved = async () => (await (await alice.request.get(origin + '/api/canvases/' + id)).json()).graph
  await a.locator('#tools-menu summary').click()
  await a.locator('#type-style-launch').click()
  await a.locator('#type-new').click()
  await a.locator('#type-name').fill('Inspection')
  await a.locator('#type-save').click()
  await a.locator('#style-edge-palette button[value="#994466"]').click()
  await a.locator('#apply-style').click()
  await expect.poll(async () => (await saved()).nodeTypeDefinitions?.[0]?.name).toBe('Inspection')
  await a.locator('#edit-node').click()
  await a.locator('#node-type').selectOption({ label: 'Inspection' })
  await a.getByRole('button', { name: '套用變更', exact: true }).click()
  await expect.poll(async () => (await saved()).nodes.A.customType).toBeTruthy()
  await expect(b.locator('#nodes [data-node-id="A"] .node-kicker')).toContainText('Inspection')
  await expect(b.locator('#nodes [data-node-id="A"]')).toHaveCSS('border-color', 'rgb(17, 34, 51)')
  await a.locator('#tools-menu summary').click()
  await a.locator('#type-style-launch').click()
  await a.locator('#type-name').fill('Quality check')
  await a.locator('#type-save').click()
  await a.locator('#apply-style').click()
  await expect(b.locator('#nodes [data-node-id="A"] .node-kicker')).toContainText('Quality check')
  await a.locator('#tools-menu summary').click()
  await a.locator('#type-style-launch').click()
  await a.locator('#type-delete').click()
  await expect(a.locator('#type-message')).toContainText('1 個節點')
  await a.locator('#type-delete').click()
  await a.locator('#apply-style').click()
  await expect.poll(async () => (await saved()).nodes.A.customType).toBeUndefined()
  await expect(b.locator('#nodes [data-node-id="A"] .node-kicker')).not.toContainText('Quality check')
  // Browsing mode must keep the native wire target for both label and line double clicks.
  await a.locator('.edge-annotation').dblclick()
  await expect(a.locator('#line-dialog')).toBeVisible()
  await a.locator('#line-close').click()
  await expect(a.locator('#canvas-edit')).toHaveAttribute('aria-pressed', 'false')
}
