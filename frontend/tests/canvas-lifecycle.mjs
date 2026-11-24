import { expect } from '@playwright/test'

export async function verifyCanvasLifecycle(owner, member, origin) {
  const { workspaces } = await (await owner.request.get(origin + '/api/catalog')).json()
  const space = workspaces[0].id
  const name = 'Return navigation test'
  const node = { id: 'Start', title: 'Start here', group: 'QA', decision: false, content: [] }
  const { id } = await (await owner.request.post(origin + '/api/workspaces/' + space + '/canvases', {
    data: { name, graph: { schemaVersion: 1, documentType: 'dfx-project-flow', nodes: { Start: node }, edges: [] } },
  })).json()
  await Promise.all([owner, member].map(p => p.goto(origin + '/#canvas/' + id)))
  const a = owner.frameLocator('iframe'), b = member.frameLocator('iframe')
  await a.locator('#create-node').click()
  await a.locator('#node-type').selectOption('return')
  await expect(a.locator('#node-id')).toHaveValue('RET1')
  await a.locator('#node-title').fill('Back to start')
  await a.locator('#node-return-target').selectOption('Start')
  await a.getByRole('button', { name: '套用變更' }).click()
  const jump = b.locator('[data-node-id="RET1"] .node-body')
  await jump.click()
  await expect(b.locator('.node.selected')).toHaveAttribute('data-node-id', 'Start')
  await a.locator('#tools-menu summary').click()
  owner.once('dialog', dialog => dialog.accept())
  await a.locator('#clear-canvas').click()
  await expect(b.locator('.node')).toHaveCount(0)
  await owner.goto(origin + '/#workspace/' + space)
  await owner.getByRole('textbox', { name: '搜尋畫布' }).fill(name)
  owner.once('dialog', dialog => dialog.accept())
  await owner.getByRole('button', { name: '刪除 ' + name }).click()
  await expect(owner.getByRole('button', { name: '刪除 ' + name })).toHaveCount(0)
  await expect(member.getByRole('alert')).toContainText('畫布已刪除')
  await owner.goto(origin + '/admin')
  const point = owner.getByRole('row').filter({ hasText: name }).filter({ hasText: 'v2' })
  await expect(point).toContainText('已刪除')
  await point.getByRole('button', { name: '還原' }).click()
  await owner.getByRole('button', { name: '確認還原' }).click()
  await expect(jump).toBeVisible()
}
