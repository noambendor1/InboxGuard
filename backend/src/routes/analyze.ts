import { Router } from "express";
import { analyzeEmail } from "../analysis/analyzeEmail.js";
import { analyzeRequestSchema } from "../validation/analyzeRequest.js";
import type { AppConfig } from "../config.js";

export function createAnalyzeRouter(config: AppConfig): Router {
  const router = Router();

  router.post("/analyze", (req, res, next) => {
    const requestId = req.context?.requestId ?? "unknown";
    const parseResult = analyzeRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: "invalid_request",
        message: "The request body did not match the expected format.",
        requestId
      });
      return;
    }

    const body = parseResult.data;

    analyzeEmail(
      {
        userId: body.userId,
        sender: body.sender,
        headers: body.headers,
        subject: body.subject,
        bodyText: body.bodyText,
        links: body.links,
        attachments: body.attachments,
        isTrustedSender: body.isTrustedSender
      },
      { safeBrowsingApiKey: config.safeBrowsingApiKey }
    )
      .then((result) => {
        const durationMs = req.context ? Date.now() - req.context.startedAt : undefined;
        console.log(
          JSON.stringify({
            requestId,
            event: "analyze_complete",
            durationMs,
            riskLevel: result.riskLevel,
            findingCount: result.findings.length,
            urlsAnalyzed: result.meta.urlsAnalyzed,
            safeBrowsingAvailable: result.meta.safeBrowsingAvailable
          })
        );
        res.status(200).json(result);
      })
      .catch(next);
  });

  return router;
}
