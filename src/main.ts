import { BunRuntime } from "@effect/platform-bun"
import { Layer } from "effect"
import { ApiServer } from "./api/server.js"

const MainLive = Layer.mergeAll(
  ApiServer
)

BunRuntime.runMain(Layer.launch(MainLive))
