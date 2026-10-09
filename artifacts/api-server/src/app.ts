import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware, csrfGuard } from "./lib/session";
import foundationRouter from "./routes/foundation";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "16kb" }));
app.use(sessionMiddleware);
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use("/api", csrfGuard);

app.use("/api", router);
app.use("/api", foundationRouter);
app.use((_req, res) => { res.status(404).json({ error: "NOT_FOUND" }); });
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Never serialize thrown DB/request objects: they can include password inputs.
  req.log.error({ errorType: err instanceof Error ? err.name : "Error" }, "Request failed");
  res.status(500).json({ error: "SERVER_ERROR" });
});

export default app;
