import { Effect } from 'effect'
import { trace, SpanStatusCode } from '@opentelemetry/api'

export function withOtelSpan<A, E, R>(name: string, effect: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const otelSpan = trace.getTracer('obsidian-api').startSpan(name)
    try {
      const result = yield* effect
      otelSpan.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
      throw err
    } finally {
      otelSpan.end()
    }
  })
}
