// Kuro — unit test definisi role & akses area admin
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROLES, ROLE_LABELS, ADMIN_ROLES, hasAdminAccess } from '../src/lib/roles.ts'

test('ROLES: memuat tiga role yang didukung', () => {
  assert.deepEqual([...ROLES], ['admin', 'project_manager', 'freelancer'])
})

test('ROLE_LABELS: punya label untuk setiap role', () => {
  for (const r of ROLES) assert.equal(typeof ROLE_LABELS[r], 'string')
  assert.equal(ROLE_LABELS.project_manager, 'Project Manager')
})

test('hasAdminAccess: admin & project_manager boleh, freelancer tidak', () => {
  assert.equal(hasAdminAccess('admin'), true)
  assert.equal(hasAdminAccess('project_manager'), true)
  assert.equal(hasAdminAccess('freelancer'), false)
})

test('ADMIN_ROLES: tepat admin & project_manager', () => {
  assert.deepEqual([...ADMIN_ROLES], ['admin', 'project_manager'])
})
