import { expect } from '@playwright/test'

export async function verifySharedOptions(alice, bob, origin) {
  const catalog = await (await alice.request.get(origin + '/api/catalog')).json()
  const nodes = Object.fromEntries(['A', 'B', 'C'].map(id => [id, {
    id, title: id, group: 'Review', decision: false, content: [], ...(id !== 'C' ? { ownerRole: 'Lead' } : {}),
  }]))
  const created = await alice.request.post(origin + '/api/workspaces/' + catalog.workspaces[0].id + '/canvases', {
    data: { name: 'Shared options', graph: { schemaVersion: 1, documentType: 'dfx-project-flow', nodes, edges: [] } },
  })
  expect(created.ok()).toBeTruthy()
  const url = origin + '/#canvas/' + (await created.json()).id
  await Promise.all([alice.goto(url), bob.goto(url)])
  const a = alice.frameLocator('iframe'), b = bob.frameLocator('iframe')
  const manage = a.locator('[data-manage-options="role"]')
  async function role(id) {
    return bob.frames()[1].evaluate(id => window.T1Playbook.data.nodes[id].ownerRole, id)
  }
  await a.locator('#edit-node').click()
  await manage.click()
  await expect(a.locator('#option-impact')).toContainText('2 個節點')
  await a.locator('#option-name').fill('Reviewer')
  await a.locator('#option-rename').click()
  expect(await role('B')).toBe('Lead')
  await a.locator('#node-form button[type="submit"]').click()
  await expect.poll(() => role('B')).toBe('Reviewer')
  await expect(a.locator('#workspace-save-state')).toHaveText('已同步')

  await a.locator('#edit-node').click()
  await manage.click()
  await a.locator('#option-delete').click()
  // A third node takes the role while its two original references are being deleted.
  await bob.frames()[1].evaluate(() => window.T1Playbook.go('C'))
  await b.locator('#edit-node').click()
  await b.locator('#node-role').selectOption('Reviewer')
  await b.locator('#node-form button[type="submit"]').click()
  await expect(b.locator('#workspace-save-state')).toHaveText('已同步')
  await a.locator('#node-form button[type="submit"]').click()
  await expect(alice.getByRole('dialog', { name: '比對草稿與團隊版本' })).toBeVisible()
  expect(await role('C')).toBe('Reviewer')
  expect(await role('A')).toBe('Reviewer')
  const review = alice.locator('.importDialog')
  await expect(review).toContainText('合併後仍引用「Reviewer」')
  await review.getByRole('radio', { name: /採用我的草稿/ }).check()
  await review.getByRole('button', { name: '確認並套用' }).click()
  await expect.poll(() => role('C')).toBeUndefined()
  expect(await role('A')).toBeUndefined()
}
