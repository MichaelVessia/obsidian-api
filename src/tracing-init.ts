import { NodeSDK } from '@opentelemetry/sdk-node'
import { JaegerExporter } from '@opentelemetry/exporter-jaeger'

console.log('Initializing OpenTelemetry with Jaeger exporter...')

// Initialize OpenTelemetry with Jaeger exporter
const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({
    endpoint: 'http://jaeger:14268/api/traces',
  }),
})

sdk.start()
console.log('OpenTelemetry initialized successfully!')

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('OpenTelemetry shut down successfully'))
    .catch((error) => console.error('Error shutting down OpenTelemetry', error))
    .finally(() => process.exit(0))
})
