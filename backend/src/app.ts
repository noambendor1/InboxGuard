import express, { type Express, type Request } from "express";
import { createHmacAuthMiddleware } from "./auth/hmacAuth.js";
import type { AppConfig } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { securityHeaders } from "./middleware/security.js";
import { healthRouter } from "./routes/health.js";
import { createAnalyzeRouter } from "./routes/analyze.js";

const MAX_BODY_SIZE = "256kb";

export function createApp(config: AppConfig): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(requestContext);

  app.use(
    express.json({
      limit: MAX_BODY_SIZE,
      verify: (req: Request, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString("utf8");
      }
    })
  );

  // /health is intentionally unauthenticated so Cloud Run / uptime checks work.
  app.use(healthRouter);

  app.use(
    createHmacAuthMiddleware({
      secret: config.sharedSecret,
      maxRequestAgeSeconds: config.maxRequestAgeSeconds
    })
  );
  app.use(createAnalyzeRouter(config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
