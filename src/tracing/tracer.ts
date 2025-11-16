import * as Otlp from '@effect/opentelemetry/Otlp'
import { FetchHttpClient } from '@effect/platform'
import { Config, Effect, Layer } from 'effect'

export const TracerLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const serviceName = yield* Config.string('OTEL_SERVICE_NAME').pipe(Config.withDefault('obsidian-api'))
    const jaegerEndpoint = yield* Config.string('JAEGER_ENDPOINT').pipe(Config.withDefault('http://localhost:4318'))

    return Otlp.layer({
      baseUrl: jaegerEndpoint,
      resource: { serviceName },
    })
  }),
).pipe(Layer.provide(FetchHttpClient.layer), Layer.orDie)
