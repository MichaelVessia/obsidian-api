import type { SearchResult } from './api.js'
import type { VaultFile } from './domain.js'

// Pure function to calculate context boundaries
const getContextBounds = (
  matchIndex: number,
  queryLength: number,
  lineLength: number,
): { start: number; end: number } => ({
  start: Math.max(0, matchIndex - 100),
  end: Math.min(lineLength, matchIndex + queryLength + 100),
})

// Pure function to process a single line
const processLine = (
  filePath: string,
  lowerQuery: string,
  queryLength: number,
  lineNumber: number,
  line: string,
): SearchResult | null => {
  if (!line) return null

  const lowerLine = line.toLowerCase()

  if (!lowerLine.includes(lowerQuery)) return null

  const matchIndex = lowerLine.indexOf(lowerQuery)
  const { start, end } = getContextBounds(matchIndex, queryLength, line.length)

  return {
    filePath,
    lineNumber,
    context: line.slice(start, end),
  }
}

export const searchInContent = (vaultFile: VaultFile, query: string): Array<SearchResult> => {
  // Reject only if query is multiple whitespace characters (e.g. '   ')
  if (query.length > 1 && query.trim() === '') {
    return []
  }

  const lines = vaultFile.content.split('\n')
  const lowerQuery = query.toLowerCase()

  return lines
    .map((line, index) => processLine(vaultFile.path, lowerQuery, query.length, index + 1, line))
    .filter((result): result is SearchResult => result !== null)
}
