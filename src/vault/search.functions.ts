import type { SearchResult } from './api.js'
import type { VaultFile } from './domain.js'

export const searchInContent = (vaultFile: VaultFile, query: string): Array<SearchResult> => {
  const lines = vaultFile.content.split('\n')
  const results: Array<SearchResult> = []
  const lowerQuery = query.toLowerCase()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    const lowerLine = line.toLowerCase()

    if (lowerLine.includes(lowerQuery)) {
      const matchIndex = lowerLine.indexOf(lowerQuery)
      const start = Math.max(0, matchIndex - 100)
      const end = Math.min(line.length, matchIndex + query.length + 100)
      const context = line.slice(start, end)

      results.push({
        filePath: vaultFile.path,
        lineNumber: i + 1,
        context,
      })
    }
  }

  return results
}
