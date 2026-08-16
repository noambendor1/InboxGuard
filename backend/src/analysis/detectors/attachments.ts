import type { AttachmentInput, Finding } from "../../types/models.js";

export const ATTACHMENTS_CATEGORY_MAX = 20;

/**
 * Metadata-only analysis. The MVP never opens, executes, unpacks, or
 * uploads attachment content - only filename, extension, MIME type, and
 * size (all already visible to the Add-on without downloading the file).
 */

const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "scr",
  "js",
  "vbs",
  "bat",
  "cmd",
  "jar",
  "com",
  "pif",
  "msi",
  "ps1",
  "hta",
  "wsf"
]);

const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz"]);

const MIME_EXTENSION_HINTS: Record<string, string[]> = {
  "application/x-msdownload": ["exe", "dll", "com"],
  "application/x-msdos-program": ["exe", "com"],
  "application/x-sh": ["sh"],
  "application/javascript": ["js"]
};

function getExtensions(filename: string): string[] {
  const parts = filename.toLowerCase().split(".");
  if (parts.length <= 1) return [];
  return parts.slice(1);
}

export function detectAttachmentSignals(attachments: AttachmentInput[]): Finding[] {
  const findings: Finding[] = [];

  attachments.forEach((attachment, index) => {
    const extensions = getExtensions(attachment.filename);
    if (extensions.length === 0) return;
    const finalExt = extensions[extensions.length - 1] ?? "";
    const hasDoubleExtension = extensions.length >= 2 && DANGEROUS_EXTENSIONS.has(finalExt);

    if (hasDoubleExtension) {
      findings.push({
        id: `attachment.double-extension.${index}`,
        category: "attachments",
        severity: "critical",
        scoreContribution: 18,
        userTitle: "An attachment uses a disguised file type",
        userExplanation: `The attachment "${attachment.filename}" is disguised to look like a document but is actually a program.`,
        technicalExplanation: `Filename has a double extension ending in a dangerous type: .${extensions.join(".")}`,
        recommendedAction: "Do not open the attachment until you verify the sender."
      });
    } else if (DANGEROUS_EXTENSIONS.has(finalExt)) {
      findings.push({
        id: `attachment.dangerous-extension.${index}`,
        category: "attachments",
        severity: "high",
        scoreContribution: 14,
        userTitle: "An attachment is a program file",
        userExplanation: `The attachment "${attachment.filename}" is an executable program, not a document.`,
        technicalExplanation: `Filename has a potentially dangerous extension: .${finalExt}`,
        recommendedAction: "Do not open the attachment until you verify the sender."
      });
    } else if (ARCHIVE_EXTENSIONS.has(finalExt)) {
      findings.push({
        id: `attachment.archive.${index}`,
        category: "attachments",
        severity: "low",
        scoreContribution: 5,
        userTitle: "An attachment is a compressed archive",
        userExplanation: `The attachment "${attachment.filename}" is a compressed file, which can be used to hide other files inside.`,
        technicalExplanation: `Filename has an archive extension: .${finalExt}`,
        recommendedAction: "Only open this archive if you were expecting it from this sender."
      });
    }

    if (attachment.mimeType) {
      const hintedExtensions = MIME_EXTENSION_HINTS[attachment.mimeType.toLowerCase()];
      if (hintedExtensions && !hintedExtensions.includes(finalExt)) {
        findings.push({
          id: `attachment.mime-mismatch.${index}`,
          category: "attachments",
          severity: "medium",
          scoreContribution: 10,
          userTitle: "An attachment's type looks inconsistent",
          userExplanation: `The attachment "${attachment.filename}" is labeled in a way that does not match its file name.`,
          technicalExplanation: `MIME type "${attachment.mimeType}" is inconsistent with extension ".${finalExt}".`,
          recommendedAction: "Do not open the attachment until you verify the sender."
        });
      }
    }
  });

  return findings;
}
