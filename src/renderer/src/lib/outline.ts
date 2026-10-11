// The scenes of a screenplay, for the sidebar outline.

import { classifyLines, sceneNumber } from './fountainLines'
import { sceneNumbers } from './screenplayLayout'

export interface Scene {
  // Source line of the scene heading (0-based).
  line: number
  number: string
  // The heading as printed: without the forcing ".", scene number and notes.
  heading: string
}

export function outlineScenes(lines: string[]): Scene[] {
  const types = classifyLines(lines)
  return [...sceneNumbers(lines, types)].map(([line, number]) => ({
    line,
    number,
    heading: lines[line]
      .replace(sceneNumber, '')
      .replace(/\[\[.*?\]\]/g, '')
      .trim()
      .replace(/^\./, '')
      .trim()
      .toUpperCase()
  }))
}

// Scenes whose heading or number contains the query, ignoring case.
export function filterScenes(scenes: Scene[], query: string): Scene[] {
  const needle = query.trim().toUpperCase()
  if (!needle) return scenes
  return scenes.filter(
    ({ heading, number }) => heading.includes(needle) || number.toUpperCase() === needle
  )
}

// The scene that a source line belongs to, if it comes after the first scene heading.
export function sceneAt(scenes: Scene[], line: number): Scene | undefined {
  let current: Scene | undefined
  for (const scene of scenes) {
    if (scene.line > line) break
    current = scene
  }
  return current
}

const isBlank = (line: string): boolean => line.trim() === ''

// Moves a scene, from its heading to the next heading, so that it ends up at index `to` among the
// scenes. Scenes are kept apart by a blank line, and the document keeps its trailing blank lines.
// Returns the new lines and the new line of the moved scene's heading.
export function moveScene(
  lines: string[],
  scenes: Scene[],
  from: number,
  to: number
): { lines: string[]; line: number } {
  if (from === to) return { lines, line: scenes[from].line }
  let end = lines.length
  while (end > scenes[scenes.length - 1].line + 1 && isBlank(lines[end - 1])) end--
  const blocks = scenes.map(({ line }, i) =>
    lines.slice(line, i + 1 < scenes.length ? scenes[i + 1].line : end)
  )
  const [moved] = blocks.splice(from, 1)
  blocks.splice(to, 0, moved)
  blocks.forEach((block, i) => {
    if (i < blocks.length - 1) {
      if (!isBlank(block[block.length - 1])) block.push('')
    } else {
      while (block.length > 1 && isBlank(block[block.length - 1])) block.pop()
    }
  })
  const before = lines.slice(0, scenes[0].line)
  const line = before.length + blocks.slice(0, to).reduce((sum, block) => sum + block.length, 0)
  return { lines: [...before, ...blocks.flat(), ...lines.slice(end)], line }
}
