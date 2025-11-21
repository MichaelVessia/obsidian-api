import { Data, Schema } from 'effect'

// Domain-specific error types using TaggedError pattern
export class DirectoryReadError extends Data.TaggedError('DirectoryReadError')<{
  readonly dirPath: string
  readonly cause: unknown
}> {}

export class FileReadError extends Data.TaggedError('FileReadError')<{
  readonly filePath: string
  readonly cause: unknown
}> {}

export class FrontmatterParseError extends Data.TaggedError('FrontmatterParseError')<{
  readonly filePath: string
  readonly cause: unknown
}> {}

export class FileLoadError extends Data.TaggedError('FileLoadError')<{
  readonly filePath: string
  readonly cause: unknown
}> {}

export class FileWatcherError extends Data.TaggedError('FileWatcherError')<{
  readonly vaultPath: string
  readonly cause: unknown
}> {}

export class StatError extends Data.TaggedError('StatError')<{
  readonly filePath: string
  readonly cause: unknown
}> {}

export class CacheUpdateError extends Data.TaggedError('CacheUpdateError')<{
  readonly filePath: string
  readonly cause: unknown
}> {}

export class YamlParseError extends Data.TaggedError('YamlParseError')<{
  readonly valueStr: string
  readonly cause: unknown
}> {}

export const Frontmatter = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
})

export const VaultFile = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
  frontmatter: Frontmatter.pipe(Schema.optional),
  bytes: Schema.Number,
  lines: Schema.Number,
})

export const VaultMetrics = Schema.Struct({
  totalFiles: Schema.Number,
  totalBytes: Schema.Number,
  totalLines: Schema.Number,
  averageFileSize: Schema.Number,
  largestFile: Schema.Struct({
    path: Schema.String,
    bytes: Schema.Number,
  }),
  smallestFile: Schema.Struct({
    path: Schema.String,
    bytes: Schema.Number,
  }),
})

export type Frontmatter = Schema.Schema.Type<typeof Frontmatter>
export type VaultFile = Schema.Schema.Type<typeof VaultFile>
export type VaultMetrics = Schema.Schema.Type<typeof VaultMetrics>
