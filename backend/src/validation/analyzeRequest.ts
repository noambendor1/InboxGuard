import { z } from "zod";

/**
 * Everything in this request originates from an email the recipient did not
 * write, so it is treated as untrusted input: every field has a strict
 * maximum length/count and an explicit shape. Nothing here is ever passed to
 * eval, a shell, or an outbound fetch of an attacker-controlled URL.
 */

const authResultSchema = z.enum(["pass", "fail", "neutral", "softfail", "none", "unknown"]);

const headerSignalsSchema = z
  .object({
    spf: authResultSchema.optional(),
    dkim: authResultSchema.optional(),
    dmarc: authResultSchema.optional(),
    returnPath: z.string().max(320).optional()
  })
  .strict()
  .optional();

const senderSchema = z
  .object({
    email: z.string().max(320),
    displayName: z.string().max(320).optional(),
    replyTo: z.string().max(320).optional()
  })
  .strict();

const linkSchema = z
  .object({
    href: z.string().max(2048),
    displayText: z.string().max(500).optional()
  })
  .strict();

const attachmentSchema = z
  .object({
    filename: z.string().max(255),
    mimeType: z.string().max(255).optional(),
    sizeBytes: z.number().nonnegative().max(1_000_000_000).optional()
  })
  .strict();

export const analyzeRequestSchema = z
  .object({
    // Pseudonymous per-user identifier supplied by the Add-on (Session-derived).
    // Used only to key the isTrustedSender lookup performed by the Add-on itself;
    // the backend does not persist it.
    userId: z.string().min(1).max(320),
    sender: senderSchema,
    headers: headerSignalsSchema,
    subject: z.string().max(998).optional(),
    bodyText: z.string().max(50_000),
    links: z.array(linkSchema).max(100),
    attachments: z.array(attachmentSchema).max(50),
    isTrustedSender: z.boolean().optional().default(false)
  })
  .strict();

export type AnalyzeRequestBody = z.infer<typeof analyzeRequestSchema>;
