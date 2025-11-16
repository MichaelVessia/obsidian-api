import './tracing-init.js'
import { BunRuntime } from '@effect/platform-bun'
import { Layer } from 'effect'
import { ApiServer } from './api/server.js'

BunRuntime.runMain(Layer.launch(ApiServer))
