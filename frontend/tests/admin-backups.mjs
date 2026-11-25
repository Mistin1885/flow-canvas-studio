import { execFileSync } from 'node:child_process'
import { expect } from '@playwright/test'

export async function verifyAdminBackups(owner, member, origin, root) {
  const catalog = await (await owner.request.get(origin + '/api/catalog')).json()
  const space = catalog.workspaces[0].id
  const result = await owner.request.post(origin + '/api/workspaces/' + space + '/canvases', {
    data: { name: 'Before restore' },
  })
  const { id } = await result.json()
  const scan = () =>
    execFileSync('docker', ['compose', '-p', process.env.FLOW_E2E_COMPOSE_PROJECT, '-f',
      'deploy/docker/docker-compose.yml', 'exec', '-T', 'web', 'python', '-m', 'backend.recovery', 'scan'], { cwd: root })
  scan()
  await owner.request.patch(origin + '/api/canvases/' + id, {
    data: { name: 'Later change', previous: 'Before restore' },
  })
  scan()
  await member.goto(origin + '/#canvas/' + id)
  await expect(member.locator('.editorBar > b')).toHaveText('Later change')
  expect((await member.request.get(origin + '/admin')).status()).toBe(403)
  expect((await member.request.get(origin + '/api/admin/backups')).status()).toBe(403)
  await owner.goto(origin + '/admin')
  const earlier = owner.getByRole('row').filter({ hasText: 'Before restore' })
  await earlier.getByRole('button', { name: '還原' }).click()
  await owner.getByRole('button', { name: '確認還原' }).click()
  await expect(owner.getByRole('status')).toContainText('Before restore')
  await expect(owner.getByRole('row').filter({ hasText: 'Later change' })).toHaveCount(0)
  await expect(member.locator('.editorBar > b')).toHaveText('Before restore')
}
