// Fountain screenplay parser.
// Ported from fountain-js 0.1.10 (https://github.com/archisgore/Fountain.js, master).
// Local changes: inline text is HTML-escaped before markup is added; parseToJson's
// dialogue handling is rewritten (upstream duplicated dialogue blocks).
// http://www.opensource.org/licenses/mit-license.php
// Copyright (c) 2012 Matt Daly

// Text fields contain HTML-escaped script text plus inline markup
// (<span class="bold|italic|underline">, <br />, <!-- notes -->).

export interface SceneHeading {
  type: 'heading'
  heading: string
  scene_number?: string
}

export interface Transition {
  type: 'transition'
  text: string
}

export interface DialogueLine {
  type: 'line' | 'parenthetical'
  text: string
}

export interface Character {
  type: 'character'
  name: string
  lines: DialogueLine[]
}

export interface Dialogue {
  type: 'dialogue-single' | 'dialogue-dual'
  characters: Character[]
}

export interface Section {
  type: 'section'
  name: string
}

export interface Synopsis {
  type: 'synopsis'
  text: string
}

export interface Action {
  type: 'action'
  text: string
}

export type SceneElement = SceneHeading | Transition | Dialogue | Section | Synopsis | Action

export interface TitlePage {
  title?: string[]
  credit?: string[]
  authors?: string[]
  source?: string[]
  notes?: string[]
  draftdate?: string[]
  date?: string[]
  contact?: string[]
  copyright?: string[]
}

export interface FountainJson {
  title?: string
  title_page: TitlePage
  script: {
    // A leading scene without a heading holds anything before the first scene heading.
    scenes?: SceneElement[][]
  }
  tokens?: Token[]
}

export interface FountainHtml {
  title?: string
  html: { title_page: string; script: string }
  tokens?: Token[]
}

type TitlePageTokenType =
  | 'title'
  | 'credit'
  | 'author'
  | 'authors'
  | 'source'
  | 'notes'
  | 'draft_date'
  | 'date'
  | 'contact'
  | 'copyright'

export type TokenType =
  | TitlePageTokenType
  | 'scene_heading'
  | 'centered'
  | 'transition'
  | 'dual_dialogue_begin'
  | 'dialogue_begin'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'dialogue_end'
  | 'dual_dialogue_end'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'boneyard_begin'
  | 'boneyard_end'
  | 'page_break'
  | 'line_break'
  | 'action'

export interface Token {
  type: TokenType
  text?: string
  scene_number?: string
  dual?: 'left' | 'right'
  depth?: number
}

// Several of these carry the g flag and are used with test(), so their lastIndex
// state carries over between calls. That matches upstream behaviour and is kept as-is.
const regex = {
  title_page: /^((?:title|credit|author[s]?|source|notes|draft date|date|contact|copyright):)/gim,

  scene_heading: /^((?:\*{0,3}_?)?(?:(?:int|ext|est|i\/e)[. ]).+)|^(?:\.(?!\.+))(.+)/i,
  scene_number: /( *#(.+)# *)/,

  transition: /^((?:FADE (?:TO BLACK|OUT)|CUT TO BLACK)\.|.+ TO:)|^(?:> *)(.+)/,

  // \p{Lu} instead of A-Z so accented names (e.g. MÁRK) are recognised as characters.
  dialogue: /^([\p{Lu}*_]+[0-9\p{Lu} (._\-')]*)(\^?)?(?:\n(?!\n+))([\s\S]+)/u,
  parenthetical: /^(\(.+\))$/,

  centered: /^(?:> *)(.+)(?: *<)(\n.+)*/g,

  section: /^(#+)(?: *)(.*)/,
  synopsis: /^(?:=(?!=+) *)(.*)/,

  note: /^(?:\[{2}(?!\[+))(.+)(?:\]{2}(?!\[+))$/,
  note_inline: /(?:\[{2}(?!\[+))([\s\S]+?)(?:\]{2}(?!\[+))/g,
  boneyard: /(^\/\*|^\*\/)$/g,

  page_break: /^={3,}$/,
  line_break: /^ {2}$/,

  bold_italic_underline:
    /(_{1}\*{3}(?=.+\*{3}_{1})|\*{3}_{1}(?=.+_{1}\*{3}))(.+?)(\*{3}_{1}|_{1}\*{3})/g,
  bold_underline: /(_{1}\*{2}(?=.+\*{2}_{1})|\*{2}_{1}(?=.+_{1}\*{2}))(.+?)(\*{2}_{1}|_{1}\*{2})/g,
  italic_underline:
    /(?:_{1}\*{1}(?=.+\*{1}_{1})|\*{1}_{1}(?=.+_{1}\*{1}))(.+?)(\*{1}_{1}|_{1}\*{1})/g,
  bold_italic: /(\*{3}(?=.+\*{3}))(.+?)(\*{3})/g,
  bold: /(\*{2}(?=.+\*{2}))(.+?)(\*{2})/g,
  italic: /(\*{1}(?=.+\*{1}))(.+?)(\*{1})/g,
  underline: /(_{1}(?=.+_{1}))(.+?)(_{1})/g,

  splitter: /\n{2,}/g,
  cleaner: /^\n+|\n+$/,
  standardizer: /\r\n|\r/g,
  whitespacer: /^\t+|^ {3,}/gm
}

function lexer(script: string): string {
  return script
    .replace(regex.boneyard, '\n$1\n')
    .replace(regex.standardizer, '\n')
    .replace(regex.cleaner, '')
    .replace(regex.whitespacer, '')
}

// Returns tokens in reverse document order (the source is scanned bottom-up).
function tokenize(script: string): Token[] {
  const src = lexer(script).split(regex.splitter)
  const tokens: Token[] = []
  let dual = false

  for (let i = src.length - 1; i >= 0; i--) {
    const line = src[i]
    let match: RegExpMatchArray | null

    // title page
    if (regex.title_page.test(line)) {
      const entries = line.replace(regex.title_page, '\n$1').split(regex.splitter).reverse()
      for (const entry of entries) {
        const parts = entry.replace(regex.cleaner, '').split(/:\n*/)
        tokens.push({
          type: parts[0].trim().toLowerCase().replace(' ', '_') as TitlePageTokenType,
          text: parts[1].trim()
        })
      }
      continue
    }

    // scene headings
    if ((match = line.match(regex.scene_heading))) {
      let text = match[1] || match[2]

      if (text.indexOf('  ') !== text.length - 2) {
        const meta = text.match(regex.scene_number)
        if (meta) {
          text = text.replace(regex.scene_number, '')
        }
        tokens.push({ type: 'scene_heading', text, scene_number: meta?.[2] || undefined })
      }
      continue
    }

    // centered
    if ((match = line.match(regex.centered))) {
      tokens.push({ type: 'centered', text: match[0].replace(/>|</g, '') })
      continue
    }

    // transitions
    if ((match = line.match(regex.transition))) {
      tokens.push({ type: 'transition', text: match[1] || match[2] })
      continue
    }

    // dialogue blocks - characters, parentheticals and dialogue
    if ((match = line.match(regex.dialogue))) {
      if (match[1].indexOf('  ') !== match[1].length - 2) {
        // we're iterating from the bottom up, so we need to push these backwards
        if (match[2]) {
          tokens.push({ type: 'dual_dialogue_end' })
        }

        tokens.push({ type: 'dialogue_end' })

        const parts = match[3].split(/(\(.+\))(?:\n+)/).reverse()
        for (const text of parts) {
          if (text.length > 0) {
            tokens.push({
              type: regex.parenthetical.test(text) ? 'parenthetical' : 'dialogue',
              text
            })
          }
        }

        tokens.push({ type: 'character', text: match[1].trim() })
        tokens.push({
          type: 'dialogue_begin',
          dual: match[2] ? 'right' : dual ? 'left' : undefined
        })

        if (dual) {
          tokens.push({ type: 'dual_dialogue_begin' })
        }

        dual = !!match[2]
        continue
      }
    }

    // section
    if ((match = line.match(regex.section))) {
      tokens.push({ type: 'section', text: match[2], depth: match[1].length })
      continue
    }

    // synopsis
    if ((match = line.match(regex.synopsis))) {
      tokens.push({ type: 'synopsis', text: match[1] })
      continue
    }

    // notes
    if ((match = line.match(regex.note))) {
      tokens.push({ type: 'note', text: match[1] })
      continue
    }

    // boneyard
    if ((match = line.match(regex.boneyard))) {
      tokens.push({ type: match[0][0] === '/' ? 'boneyard_begin' : 'boneyard_end' })
      continue
    }

    // page breaks
    if (regex.page_break.test(line)) {
      tokens.push({ type: 'page_break' })
      continue
    }

    // line breaks
    if (regex.line_break.test(line)) {
      tokens.push({ type: 'line_break' })
      continue
    }

    tokens.push({ type: 'action', text: line })
  }

  return tokens
}

const inlineStyles = {
  bold_italic_underline: '<span class="bold italic underline">$2</span>',
  bold_underline: '<span class="bold underline">$2</span>',
  italic_underline: '<span class="italic underline">$2</span>',
  bold_italic: '<span class="bold italic">$2</span>',
  bold: '<span class="bold">$2</span>',
  italic: '<span class="italic">$2</span>',
  underline: '<span class="underline">$2</span>'
}

// Applied in this order: the most specific combinations first.
const inlineStyleOrder: (keyof typeof inlineStyles)[] = [
  'bold_italic_underline',
  'bold_underline',
  'italic_underline',
  'bold_italic',
  'bold',
  'italic',
  'underline'
]

function inlineLexer(s: string | undefined): string | undefined {
  if (!s) {
    return
  }

  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  s = s
    .replace(regex.note_inline, '<!-- $1 -->')
    .replace(/\\\*/g, '[star]')
    .replace(/\\_/g, '[underline]')
    .replace(/\n/g, '<br />')

  for (const style of inlineStyleOrder) {
    const match = regex[style]
    if (match.test(s)) {
      s = s.replace(match, inlineStyles[style])
    }
  }

  return s
    .replace(/\[star\]/g, '*')
    .replace(/\[underline\]/g, '_')
    .trim()
}

function stripTags(html: string): string {
  return html.replace('<br />', ' ').replace(/<(?:.|\n)*?>/g, '')
}

function parseToJson(script: string, includeTokens?: boolean): FountainJson {
  const tokens = tokenize(script)
  const titlePage: TitlePage = {}
  const scenes: SceneElement[][] = []
  const output: FountainJson = { title_page: titlePage, script: {} }

  let scene: SceneElement[] = [] // the current running scene
  let dialogue: Dialogue | null = null // the current running dialogue block
  let character: Character | null = null // the current running character
  let inDual = false

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    token.text = inlineLexer(token.text)
    const text = token.text as string

    switch (token.type) {
      case 'title':
        output.title = stripTags(text)
        ;(titlePage.title ??= []).push(output.title)
        break
      case 'credit':
        ;(titlePage.credit ??= []).push(text)
        break
      case 'author':
      case 'authors':
        ;(titlePage.authors ??= []).push(text)
        break
      case 'source':
        ;(titlePage.source ??= []).push(text)
        break
      case 'notes':
        ;(titlePage.notes ??= []).push(text)
        break
      case 'draft_date':
        ;(titlePage.draftdate ??= []).push(text)
        break
      case 'date':
        ;(titlePage.date ??= []).push(text)
        break
      case 'contact':
        ;(titlePage.contact ??= []).push(text)
        break
      case 'copyright':
        ;(titlePage.copyright ??= []).push(text)
        break

      case 'scene_heading':
        if (scene.length > 0) {
          scenes.push(scene)
        }
        scene = [{ type: 'heading', scene_number: token.scene_number, heading: text }]
        break

      case 'transition':
        scene.push({ type: 'transition', text })
        break

      case 'dual_dialogue_begin':
        inDual = true
        dialogue = { type: 'dialogue-dual', characters: [] }
        break
      case 'dialogue_begin':
        if (!inDual) {
          dialogue = { type: 'dialogue-single', characters: [] }
        }
        break
      case 'character':
        character = { type: 'character', name: text, lines: [] }
        dialogue!.characters.push(character)
        break
      case 'parenthetical':
        character!.lines.push({ type: 'parenthetical', text })
        break
      case 'dialogue':
        character!.lines.push({ type: 'line', text })
        break
      case 'dialogue_end':
        if (!inDual) {
          scene.push(dialogue!)
        }
        break
      case 'dual_dialogue_end':
        scene.push(dialogue!)
        inDual = false
        break

      case 'section':
        scene.push({ type: 'section', name: text })
        break
      case 'synopsis':
        scene.push({ type: 'synopsis', text })
        break

      case 'action':
      case 'centered':
        scene.push({ type: 'action', text })
        break

      // notes, boneyard, page breaks and line breaks are not represented
    }
  }

  if (scene.length > 0) {
    scenes.push(scene)
  }
  if (scenes.length > 0) {
    output.script.scenes = scenes
  }
  output.tokens = includeTokens ? tokens.reverse() : undefined

  return output
}

function parseToHtml(script: string, includeTokens?: boolean): FountainHtml {
  const tokens = tokenize(script)
  const titlePage: string[] = []
  const html: string[] = []
  let title: string | undefined

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    token.text = inlineLexer(token.text)

    switch (token.type) {
      case 'title':
        titlePage.push('<h1>' + token.text + '</h1>')
        title = stripTags(token.text as string)
        break
      case 'credit':
        titlePage.push('<p class="credit">' + token.text + '</p>')
        break
      case 'author':
        titlePage.push('<p class="authors">' + token.text + '</p>')
        break
      case 'authors':
        titlePage.push('<p class="authors">' + token.text + '</p>')
        break
      case 'source':
        titlePage.push('<p class="source">' + token.text + '</p>')
        break
      case 'notes':
        titlePage.push('<p class="notes">' + token.text + '</p>')
        break
      case 'draft_date':
        titlePage.push('<p class="draft-date">' + token.text + '</p>')
        break
      case 'date':
        titlePage.push('<p class="date">' + token.text + '</p>')
        break
      case 'contact':
        titlePage.push('<p class="contact">' + token.text + '</p>')
        break
      case 'copyright':
        titlePage.push('<p class="copyright">' + token.text + '</p>')
        break

      case 'scene_heading':
        html.push(
          '<h3' +
            (token.scene_number ? ' id="' + token.scene_number + '">' : '>') +
            token.text +
            '</h3>'
        )
        break
      case 'transition':
        html.push('<h2>' + token.text + '</h2>')
        break

      case 'dual_dialogue_begin':
        html.push('<div class="dual-dialogue">')
        break
      case 'dialogue_begin':
        html.push('<div class="dialogue' + (token.dual ? ' ' + token.dual : '') + '">')
        break
      case 'character':
        html.push('<h4>' + token.text + '</h4>')
        break
      case 'parenthetical':
        html.push('<p class="parenthetical">' + token.text + '</p>')
        break
      case 'dialogue':
        html.push('<p>' + token.text + '</p>')
        break
      case 'dialogue_end':
        html.push('</div> ')
        break
      case 'dual_dialogue_end':
        html.push('</div> ')
        break

      case 'section':
        html.push('<p class="section" data-depth="' + token.depth + '">' + token.text + '</p>')
        break
      case 'synopsis':
        html.push('<p class="synopsis">' + token.text + '</p>')
        break

      case 'note':
        html.push('<!-- ' + token.text + '-->')
        break
      case 'boneyard_begin':
        html.push('<!-- ')
        break
      case 'boneyard_end':
        html.push(' -->')
        break

      case 'action':
        html.push('<p>' + token.text + '</p>')
        break
      case 'centered':
        html.push('<p class="centered">' + token.text + '</p>')
        break

      case 'page_break':
        html.push('<hr />')
        break
      case 'line_break':
        html.push('<br />')
        break
    }
  }

  return {
    title,
    html: { title_page: titlePage.join(''), script: html.join('') },
    tokens: includeTokens ? tokens.reverse() : undefined
  }
}

const fountain = Object.assign((script: string): FountainJson => parseToJson(script), {
  parseToJson,
  parseToHtml
})

export default fountain
