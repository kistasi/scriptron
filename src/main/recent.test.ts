import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, sep } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'home' ? '/Users/me' : electron.userData) },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn(), on: vi.fn() }
}))

type Recent = typeof import('./recent')

let recent: Recent
let dir: string

beforeEach(async () => {
  vi.resetModules()
  dir = await mkdtemp(join(tmpdir(), 'scriptron-test-'))
  electron.userData = dir
  recent = await import('./recent')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const recentPaths = (): string[] => recent.getRecent().map(({ path }) => path)

describe('recent documents', () => {
  it('lists the most recent first, once each, up to the maximum', () => {
    for (let i = 0; i < recent.maxRecent + 2; i++) recent.addRecent(`/s/${i}.fountain`)
    recent.addRecent('/s/5.fountain')

    expect(recentPaths()).toHaveLength(recent.maxRecent)
    expect(recentPaths().slice(0, 3)).toEqual(['/s/5.fountain', '/s/11.fountain', '/s/10.fountain'])
  })

  it('forgets one file, or all of them', () => {
    recent.addRecent('/s/a.fountain')
    recent.addRecent('/s/b.fountain')
    recent.removeRecent('/s/a.fountain')
    expect(recentPaths()).toEqual(['/s/b.fountain'])

    recent.clearRecent()
    expect(recentPaths()).toEqual([])
  })

  it('is remembered across launches', async () => {
    recent.addRecent('/s/a.fountain')
    expect(JSON.parse(await readFile(join(dir, 'recent.json'), 'utf8'))).toEqual(['/s/a.fountain'])

    vi.resetModules()
    recent = await import('./recent')
    recent.loadRecent()
    expect(recentPaths()).toEqual(['/s/a.fountain'])
  })

  it('ignores a damaged file', async () => {
    await writeFile(join(dir, 'recent.json'), '["/s/a.fountain", 3, "", "/s/a.fountain"]')
    recent.loadRecent()
    expect(recentPaths()).toEqual(['/s/a.fountain'])

    await writeFile(join(dir, 'recent.json'), '{"paths"')
    recent.loadRecent()
    expect(recentPaths()).toEqual([])
  })

  it('names each file and its folder, shortening the home folder', () => {
    // Built with the platform's separator, as real paths are.
    const home = join(sep, 'Users', 'me')
    const path = join(home, 'Scripts', 'Big Fish.fountain')
    expect(recent.describeRecent(path, home)).toEqual({
      path,
      name: 'Big Fish.fountain',
      folder: join('~', 'Scripts')
    })
    expect(recent.describeRecent(join(home, 'A.fountain'), home).folder).toBe('~')
    const other = join(sep, 'Users', 'meg')
    expect(recent.describeRecent(join(other, 'A.fountain'), home).folder).toBe(other)
  })
})
