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
