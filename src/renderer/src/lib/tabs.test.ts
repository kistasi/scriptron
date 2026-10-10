import { describe, expect, it } from 'vitest'
import { closeTab, cycleTab, initialTabs, openTab, updateTab, type Tabs } from './tabs'

const names = (state: Tabs): string[] => state.tabs.map((tab) => tab.name)
const activeName = (state: Tabs): string | undefined =>
  state.tabs.find((tab) => tab.id === state.activeId)?.name

const file = (id: number, name: string): Parameters<typeof openTab>[1] => ({
  id,
  path: `/scripts/${name}`,
  name,
  text: name
})
const untitled = (id: number): Parameters<typeof openTab>[1] => ({
  id,
  path: null,
  name: null,
  text: ''
})

describe('tabs', () => {
  it('starts with one untitled tab', () => {
    expect(names(initialTabs(0))).toEqual(['Untitled'])
  })

  it('numbers new untitled tabs, reusing freed names', () => {
    let state = openTab(openTab(initialTabs(0), untitled(1)), untitled(2))
    expect(names(state)).toEqual(['Untitled', 'Untitled 2', 'Untitled 3'])

    state = closeTab(state, 1, 9)
    state = openTab(state, untitled(3))
    expect(names(state)).toEqual(['Untitled', 'Untitled 3', 'Untitled 2'])
  })

  it('opens a file in place of a blank untitled tab', () => {
    const state = openTab(initialTabs(0), file(1, 'A.fountain'))
    expect(names(state)).toEqual(['A.fountain'])
    expect(state.activeId).toBe(1)
  })

  it('keeps an untitled tab that has been typed into', () => {
    const typed = updateTab(initialTabs(0), 0, { text: 'INT. HOUSE' })
    expect(names(openTab(typed, file(1, 'A.fountain')))).toEqual(['Untitled', 'A.fountain'])
  })

  it('shows a file that is already open rather than opening it again', () => {
    let state = openTab(openTab(initialTabs(0), file(1, 'A.fountain')), file(2, 'B.fountain'))
    state = openTab(state, file(3, 'A.fountain'))
    expect(names(state)).toEqual(['A.fountain', 'B.fountain'])
    expect(state.activeId).toBe(1)
  })

  it('shows the next tab when the shown one is closed, or the previous for the last', () => {
    let state = openTab(initialTabs(0), file(0, 'A'))
    for (const [id, name] of ['B', 'C', 'D'].entries()) state = openTab(state, file(id + 1, name))
    state = { ...state, activeId: 1 }

    state = closeTab(state, 1, 9)
    expect(activeName(state)).toBe('C')

    state = closeTab(state, 3, 9)
    expect(activeName(state)).toBe('C')

    state = closeTab(state, 2, 9)
    expect(activeName(state)).toBe('A')
  })

  it('leaves a new untitled tab when the last one is closed', () => {
    const state = closeTab(openTab(initialTabs(0), file(1, 'A.fountain')), 1, 7)
    expect(state.tabs).toHaveLength(1)
    expect(activeName(state)).toBe('Untitled')
    expect(state.activeId).toBe(7)
  })

  it('cycles through the tabs, wrapping around', () => {
    const state = openTab(openTab(initialTabs(0), untitled(1)), untitled(2))
    expect(cycleTab(state, 1).activeId).toBe(0)
    expect(cycleTab(state, -1).activeId).toBe(1)
  })

  it('ignores updates to a closed tab', () => {
    const state = initialTabs(0)
    expect(updateTab(state, 5, { text: 'x' })).toBe(state)
  })
})
