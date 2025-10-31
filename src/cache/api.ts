import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";

export const cacheGroup = HttpApiGroup.make("Cache")
  .add(
    HttpApiEndpoint.get("listFiles", "/cache/files").addSuccess(
      Schema.Record({ key: Schema.String, value: Schema.String }),
    ),
  )
  .add(
    HttpApiEndpoint.post("reload", "/cache/reload").addSuccess(
      Schema.Struct({
        message: Schema.String,
        filesLoaded: Schema.Number,
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("metrics", "/cache/metrics").addSuccess(
      Schema.Struct({
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
      }),
    ),
  );
