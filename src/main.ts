import { HttpRouter, HttpServer, HttpServerResponse } from "@effect/platform"
import { listen } from "./listen.js"

const router = HttpRouter.empty.pipe(
  HttpRouter.get("/", HttpServerResponse.text("Hello World")),
  HttpRouter.get("/test", HttpServerResponse.text("Hello Test"))
)
const app = router.pipe(HttpServer.serve(), HttpServer.withLogAddress)
const port = 3000
listen(app, port)
