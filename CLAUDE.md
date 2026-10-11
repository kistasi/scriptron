# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Scriptron is an Electron + React + CodeMirror 6 screenplay editor for [Fountain](https://fountain.io/syntax) files, built with electron-vite. Files stay plain Fountain text; the editor only decorates them to look like a printed screenplay page.

## Commands

Use yarn (`yarn.lock`).

```bash
yarn dev                 # run the app with hot reload
yarn test                # vitest run (all tests)
yarn vitest run src/renderer/src/lib/outline.test.ts   # one test file
yarn vitest run -t "name of the test"                  # tests matching a name
yarn vitest run -u       # update snapshots (screenplayLayout has one)
yarn typecheck           # tsc for main/preload (tsconfig.node.json) and renderer (tsconfig.web.json)
yarn lint
yarn format              # prettier: single quotes, no semicolons, 100 columns
yarn build:mac / build:win   # local installers via electron-builder
```

There is no vitest config file: tests default to the Node environment, and DOM tests opt in with a `// @vitest-environment jsdom` comment at the top (see `App.test.tsx`). Main-process tests `vi.mock('electron', …)`.

Releases are done with the `/release` project skill (`.claude/skills/release/SKILL.md`): it writes the CHANGELOG.md section, bumps package.json, tags `vX.Y.Z` and pushes, which triggers `.github/workflows/build.yml` to build macOS/Windows installers and publish the GitHub Release. CI runs `yarn typecheck` and `yarn test` before packaging.

## Architecture

Three Electron processes, with the IPC contract in one place:

- `src/shared/ipc.ts` — every channel name (with a comment giving direction and payload), the shared types (`OpenedFile`, `Session`, `Settings`, `MenuCommand`, …) and settings defaults. Adding IPC means: a channel here, a handler in `src/main/`, and a method on `api` in `src/preload/index.ts` (exposed as `window.api`).
- `src/main/` — file dialogs, saving and the unsaved-changes guard (`document.ts`), the app menu (`menu.ts`, which sends `MenuCommand`s to the renderer), recent files, session restore, settings and spellchecker setup. Persistent state is JSON in the userData folder via `store.ts` (`readStored`/`writeStored`); readers validate what they load so a damaged file can't break the app. Changes are pushed to all windows with `broadcast`.
- `src/renderer/src/` — React UI. `App.tsx` owns tabs (state logic in `lib/tabs.ts`), settings, the sidebar outline and PDF export. Each tab has its own uncontrolled `Editor` (kept mounted while hidden to keep its undo history; remount via `key` to load different text).

### The Fountain pipeline (renderer)

Pure, DOM-free logic lives in `src/renderer/src/lib/` and is unit-tested; CodeMirror extensions live one level up and build on it.

1. `lib/fountainLines.ts` classifies each source line into a `LineType` (1:1 with source lines) and finds inline emphasis ranges.
2. `classifiedDoc.ts` caches that classification per CodeMirror `Text` in a WeakMap, so every extension (formatting, spellcheck, toolbar, completion, keys) shares one classification per keystroke. Use `classifiedDoc(state.doc)` rather than calling `classifyLines` in editor code.
3. `lib/screenplayLayout.ts` holds the A4 page geometry, element indents and pagination (lines per page, (MORE)/(CONT'D) speech splitting, scene numbers). It is the single source of truth for measurements.
4. Two consumers of that layout must stay in agreement:
   - `fountainFormatting.ts` — CodeMirror decorations that render the live page view, including page-break widgets. Non-12pt text sizes scale the whole page so wrapping and page breaks match print.
   - `lib/printLayout.ts` + `PrintView.tsx` — wraps rows itself (not the browser) and renders printed pages; `App` mounts `PrintView` temporarily and main prints the window to PDF.

Editing behaviors are separate extensions wired up in `Editor.tsx`: `screenplayKeys` (Enter/Shift-Enter element flow), `completion` (character names with automatic (CONT'D), scene headings via `typedLine.ts`), `emphasis`/`lineFormats` (toolbar commands), `autoformat`, `search`, and `spellcheck` (skips scene headings, character cues and notes; actual checking is Chromium's spellchecker configured in `src/main/spellcheck.ts`).

`resources/samples/Big-Fish.fountain` is the bundled sample and is also used as a realistic fixture in layout tests.
