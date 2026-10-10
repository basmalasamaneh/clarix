import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware, csrfGuard } from "./lib/session";
import foundationRouter from "./routes/foundation";
import importsRouter from "./routes/imports";
import aiRouter from "./routes/ai";
import accountsRouter from "./routes/accounts";
import platformRouter from "./routes/platform";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0]?.replace(/\/invite\/[^/]+/g,"/invite/[redacted]"),
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
app.use(express.json({ limit: "128kb" }));
app.use(sessionMiddleware);
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use("/api", csrfGuard);

app.use("/api", router);
app.use("/api", accountsRouter);
app.use("/api", foundationRouter);
app.use("/api", importsRouter);
app.use("/api", aiRouter);
app.use("/api", platformRouter);
app.use((_req, res) => { res.status(404).json({ error: "NOT_FOUND" }); });
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Never serialize thrown DB/request objects: they can include password inputs.
  req.log.error({ errorType: err instanceof Error ? err.name : "Error" }, "Request failed");
  // Session-store errors may arrive after a response has already been written.
  // Do not throw another headers-sent error or leak its stack through Express.
  if(res.headersSent){res.end();return;}
  res.status(500).json({ error: "SERVER_ERROR" });
});

export default app;
