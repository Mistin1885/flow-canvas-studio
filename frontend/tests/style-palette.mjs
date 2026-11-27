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
  const theme = page.getByRole('button', { name: '深色模式', exact: true })
  if (await theme.getAttribute('aria-pressed') !== 'true') await theme.click()
  const frame = page.frameLocator('iframe'), dialog = frame.locator('#style-dialog')
  await frame.locator('#node-style-launch').click()
  for (const scope of ['diagram', 'group', 'node']) {
    await dialog.locator('[data-level="' + scope + '"]').click()
    for (const key of ['light', 'dark']) {
      const palette = dialog.locator('#style-' + key + '-palette')
      await palette.getByRole('button', { name: '更多已用色' }).click()
      const last = palette.locator('button[value="#aabb1f"]')
      await last.scrollIntoViewIfNeeded()
      await last.click()
      await expect(dialog.locator('#style-' + key)).toHaveValue('custom')
      await expect(last).toHaveAttribute('aria-pressed', 'true')
      await expect(last).toHaveCSS('background-color', 'rgb(170, 187, 31)')
      await expect(dialog.getByLabel(key === 'light' ? '淺色底色 HEX' : '深色底色 HEX')).toHaveValue('#aabb1f')
      // Reopening the palette must preserve the chosen color without native popup races.
      await palette.getByRole('button', { name: '更多已用色' }).click()
      await palette.getByRole('button', { name: '更多已用色' }).click()
      await expect(last).toHaveAttribute('aria-pressed', 'true')
    }
  }
  await dialog.locator('#apply-style').click()
  await expect.poll(async () => {
    const { graph } = await (await page.request.get(origin + '/api/canvases/' + id)).json()
    return [graph.layoutGroups?.find(g => g.name === 'QA')?.nodeStyle?.dark, graph.nodes.N0.nodeStyle.dark]
  }).toEqual(['#aabb1f', '#aabb1f'])
}
