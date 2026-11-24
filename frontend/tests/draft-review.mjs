import { expect } from '@playwright/test'

export async function verifyDraftReview(alice, bob) {
  await bob.goto(alice.url())
  const a = alice.frameLocator('iframe')
  const b = bob.frameLocator('iframe')
  const review = bob.locator('.importDialog')
  const apply = review.getByRole('button', { name: '確認並套用' })
  const submit = (frame) => frame.getByRole('button', { name: '套用變更' }).click()

  async function competingEdits(field, value, title) {
    await a.locator('#edit-node').click()
    await b.locator('#edit-node').click()
    await a.locator('#node-title').fill(title)
    await b.locator(field).fill(value)
    await submit(a)
    await expect(a.locator('#workspace-save-state')).toHaveText('已同步')
    await submit(b)
    await expect(bob.getByRole('alert')).toContainText('已由其他人變更')
  }

  await competingEdits('#node-note', 'Shared note', 'Team title')
  await bob.getByRole('button', { name: '比對並合併草稿' }).click()
  await expect(review.getByRole('radio')).toHaveCount(0)
  await expect(review).toContainText('1 項待套用')
  await apply.click()
  await expect(review).toHaveCount(0)
  await expect.poll(() => alice.frames()[1].evaluate(() => window.T1Playbook.data.nodes.NODE1.note))
    .toBe('Shared note')
  await expect(b.locator('.node-title').first()).toHaveText('Team title')

  await competingEdits('#node-title', 'Recovered title', 'Second team title')
  await bob.reload()
  await bob.getByRole('button', { name: '比對並合併草稿' }).click()
  await expect(apply).toBeDisabled()
  const mine = review.getByRole('radio', { name: /採用我的草稿/ })
  await mine.check()
  await expect(apply).toBeEnabled()

  await a.locator('#edit-node').click()
  await a.locator('#node-title').fill('Third team title')
  await submit(a)
  await expect(review).toContainText('Third team title')
  await expect(apply).toBeDisabled()
  await mine.check()
  await apply.click()
  await expect(a.locator('.node-title').first()).toHaveText('Recovered title')

  await bob.getByRole('button', { name: '變更紀錄' }).click()
  const activity = bob.locator('.activityDialog')
  await expect(activity).toContainText('Third team title')
  await activity.getByRole('button', { name: 'Recovered title' }).click()
  await expect(activity).toHaveCount(0)
}
