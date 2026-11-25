import { expect } from '@playwright/test'

export async function verifyStylePalette(page, origin) {
  const nodes = {}
  for (let i = 0; i < 32; i++) {
    const id = 'N' + i
    nodes[id] = { id, title: id, group: 'QA', decision: false, content: [],
      nodeStyle: { light: '#' + (0xaabb00 + i).toString(16) } }
  }
  const catalog = await (await page.request.get(origin + '/api/catalog')).json()
  const created = await page.request.post(origin + '/api/workspaces/' + catalog.workspaces[0].id + '/canvases',
    { data: { name: 'Style palette', graph: { schemaVersion: 1, documentType: 'dfx-project-flow', nodes, edges: [] } } })
  expect(created.ok()).toBeTruthy()
  const { id } = await created.json()
  await page.goto(origin + '/#canvas/' + id)
  const frame = page.frameLocator('iframe'), dialog = frame.locator('#style-dialog')
  await frame.locator('#node-style-launch').click()
  for (const scope of ['group', 'node']) {
    await dialog.locator('[data-level="' + scope + '"]').click()
    for (const key of ['light', 'dark']) {
      const select = dialog.locator('#style-' + key)
      // selectOption bypasses the popup. Exercise the opening click and the separate
      // choice (scrolling to an option below the fold) just as a pointer user does.
      await select.click()
      await expect(dialog.locator('#style-' + key + ':open')).toBeVisible()
      const last = select.getByRole('option', { name: '#AABB1F' })
      await last.scrollIntoViewIfNeeded()
      await last.click()
      await expect(select).toHaveValue('custom')
      await expect(dialog.locator('#style-' + key + ':open')).toHaveCount(0)
      await expect(dialog.getByLabel(key === 'light' ? '淺色底色 HEX' : '深色底色 HEX')).toHaveValue('#aabb1f')
    }
    const select = dialog.locator('#style-dark')
    await select.click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('#style-dark:open')).toHaveCount(0)
  }
  await dialog.locator('#apply-style').click()
  await expect.poll(async () => {
    const { graph } = await (await page.request.get(origin + '/api/canvases/' + id)).json()
    return [graph.layoutGroups?.find(g => g.name === 'QA')?.nodeStyle?.dark, graph.nodes.N0.nodeStyle.dark]
  }).toEqual(['#aabb1f', '#aabb1f'])
}
