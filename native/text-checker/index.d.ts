export interface TextIssue {
  kind: 'spelling' | 'grammar'
  // UTF-16 offsets within the checked text, like JavaScript string indexes.
  from: number
  to: number
  // For grammar: what the issue is, and suggested replacements for the range.
  message?: string
  corrections?: string[]
}

// Checks each text separately, off the main thread. The language is detected automatically.
export function check(
  texts: string[],
  options: { spelling: boolean; grammar: boolean }
): Promise<TextIssue[][]>

// Suggested spellings for a misspelled word.
export function guesses(word: string): string[]
