// "Big Fish.fountain" → "Big Fish"
export const baseName = (name: string): string => name.replace(/\.fountain$/i, '')
