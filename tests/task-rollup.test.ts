// Kuro — unit test aturan rollup status task dari subtask
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rollupTaskStatus } from '../src/lib/task-rollup.ts'

test('rollupTaskStatus: tanpa subtask → null', () => {
  assert.equal(rollupTaskStatus([]), null)
})

test('rollupTaskStatus: semua todo → todo', () => {
  assert.equal(rollupTaskStatus(['todo', 'todo']), 'todo')
})

test('rollupTaskStatus: semua done/cancelled → done', () => {
  assert.equal(rollupTaskStatus(['done', 'done']), 'done')
  assert.equal(rollupTaskStatus(['done', 'cancelled']), 'done')
  assert.equal(rollupTaskStatus(['cancelled', 'cancelled']), 'done')
})

test('rollupTaskStatus: semua sisa review → review', () => {
  assert.equal(rollupTaskStatus(['review', 'review']), 'review')
  // done/cancelled diabaikan, sisanya review → review
  assert.equal(rollupTaskStatus(['done', 'review']), 'review')
})

test('rollupTaskStatus: ada in_progress → in_progress (prioritas tertinggi)', () => {
  assert.equal(rollupTaskStatus(['in_progress', 'review']), 'in_progress')
  assert.equal(rollupTaskStatus(['in_progress', 'todo', 'done']), 'in_progress')
})

test('rollupTaskStatus: campuran todo & review tanpa in_progress → todo', () => {
  assert.equal(rollupTaskStatus(['todo', 'review']), 'todo')
})
