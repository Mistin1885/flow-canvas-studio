import { expect } from '@playwright/test'

export async function verifyFormDrafts(alice, bob) {
  const { origin } = new URL(alice.url())
  const catalog = await (await alice.request.get(origin + '/api/catalog')).json()
  const nodes = Object.fromEntries(['Alpha', 'Beta', 'Gamma'].map(id => [
    id, { id, title: id, group: 'QA', decision: false, content: [] },
  ]))
  const graph = {
    schemaVersion: 1, documentType: 'dfx-project-flow', title: 'Form recovery', nodes,
    navigation: [], subflows: [], edges: [{ from: 'Alpha', to: 'Beta', label: '', kind: 'next', dashed: false }],
  }
  const response = await alice.request.post(origin + '/api/workspaces/' + catalog.workspaces[0].id + '/canvases', {
    data: { name: 'Form recovery', graph },
  })
  expect(response.ok()).toBeTruthy()
  const route = new URL('/#canvas/' + (await response.json()).id, alice.url()).href
  await Promise.all([alice.goto(route), bob.goto(route)])
  const a = alice.frameLocator('iframe'), b = bob.frameLocator('iframe')
  async function edit(page, frame, id) {
    await expect(frame.locator('#workspace-save-state')).toHaveText('已同步')
    await page.frames()[1].evaluate(id => window.T1Playbook.go(id), id)
    await frame.locator('#edit-node').click()
    await expect(frame.locator('#node-id')).toHaveValue(id)
  }

  await edit(alice, a, 'Alpha')
  await a.locator('#node-title').fill('Local title')
  await a.locator('#add-code-block').click()
  await a.locator('.block-value').fill('Unpublished content')
  await a.locator('.edge-condition').fill('valid')
  await a.locator('#add-incoming').click()
  const picker = a.locator('#added-incoming [role=combobox]')
  await picker.fill('Gamma')
  await picker.press('Enter')
  await a.locator('.incoming-condition').fill('ready')
  await a.locator('#editor-close').click()

  await edit(bob, b, 'Alpha')
  await b.locator('#node-title').fill('Team title')
  await b.getByRole('button', { name: '套用變更' }).click()
  await expect(b.locator('#workspace-save-state')).toHaveText('已同步')
  await alice.reload()
  await edit(alice, a, 'Alpha')
  await expect(a.locator('#draft-prompt')).toBeVisible()
  await expect(a.locator('.editor-footer')).toHaveAttribute('inert', '')
  await a.locator('#draft-resume').click()
  await expect(a.locator('#node-title')).toHaveValue('Local title')
  await expect(a.locator('.block-value')).toHaveValue('Unpublished content')
  await expect(a.locator('.edge-condition')).toHaveValue('valid')
  await expect(picker).toHaveAttribute('placeholder', /Gamma/)
  await expect(a.locator('.incoming-condition')).toHaveValue('ready')
  await a.getByRole('button', { name: '套用變更' }).click()
  await alice.getByRole('button', { name: '比對並合併草稿' }).click()
  const review = alice.locator('.importDialog')
  await review.getByRole('radio', { name: /採用我的草稿/ }).check()
  await review.getByRole('button', { name: '確認並套用' }).click()
  await expect(review).toHaveCount(0)
  await expect.poll(() => bob.frames()[1].evaluate(() => {
    const { nodes, edges } = window.T1Playbook.data
    return [nodes.Alpha.title, nodes.Alpha.content[0]?.value, ...edges.map(e => e.label).sort()]
  })).toEqual(['Local title', 'Unpublished content', 'ready', 'valid'])
  await expect(a.locator('#recover-form')).toBeHidden()

  await edit(alice, a, 'Beta')
  await a.locator('#node-note').fill('Discard me')
  await a.locator('#editor-close').click()
  await edit(alice, a, 'Beta')
  await a.locator('#draft-discard').click()
  await expect(a.locator('#node-note')).toHaveValue('')
  await a.locator('#editor-close').click()
  await expect(a.locator('#recover-form')).toBeHidden()
}
