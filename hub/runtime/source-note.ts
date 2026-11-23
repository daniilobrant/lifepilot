export const MAX_SOURCE_BYTES = 8_000
export type SourceNote = { name: string, text: string }

export function sourceNote(value: unknown): SourceNote | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2) {
    throw new Error('Wähle eine Datei mit lesbarem Text.')
  }
  const { name, text } = value as Record<string, unknown>
  if (typeof name !== 'string' || !/^[^/\\\u0000-\u001f\u007f]{1,116}\.(txt|md|pdf|png|jpe?g)$/iu.test(name) ||
      typeof text !== 'string' || !text.trim() || new TextEncoder().encode(text).length > MAX_SOURCE_BYTES ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(text)) {
    throw new Error('Der Text des Anhangs muss lesbar und höchstens 8 KB groß sein.')
  }
  return { name, text }
}
