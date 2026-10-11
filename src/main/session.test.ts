import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => electron.userData },
  ipcMain: { handle: vi.fn(), on: vi.fn() }
}))

const { restoreSession, saveSession } = await import('./session')

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'scriptron-test-'))
  electron.userData = dir
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('session', () => {
  it('restores nothing on the first launch', async () => {
    expect(await restoreSession()).toEqual({ files: [], activePath: null })
  })

  it('reopens the remembered files, skipping ones that are gone', async () => {
    const one = join(dir, 'One.fountain')
    const two = join(dir, 'Two.fountain')
    await writeFile(one, 'one')
    await writeFile(two, 'two')
    saveSession({ paths: [two, join(dir, 'Gone.fountain'), one], activePath: one })

    expect(await restoreSession()).toEqual({
      files: [
        { path: two, name: 'Two.fountain', content: 'two' },
        { path: one, name: 'One.fountain', content: 'one' }
      ],
      activePath: one
    })
  })

  it('ignores a damaged file', async () => {
    await writeFile(join(dir, 'session.json'), '{"paths": [1, null], "activePath": 3')
    expect(await restoreSession()).toEqual({ files: [], activePath: null })

    await writeFile(join(dir, 'session.json'), '{"paths": "x", "activePath": 3}')
    expect(await restoreSession()).toEqual({ files: [], activePath: null })
  })

  it('saves only valid values', async () => {
    saveSession({ paths: ['/a', 5], activePath: 7 } as never)
    expect(JSON.parse(await readFile(join(dir, 'session.json'), 'utf8'))).toEqual({
      paths: ['/a'],
      activePath: null
    })
  })
})
