import { Schema } from 'effect'

export const Frontmatter = Schema.Record({
  key: Schema.String,
  value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Array(Schema.String)),
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
