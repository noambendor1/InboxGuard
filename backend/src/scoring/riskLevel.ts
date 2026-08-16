import type { RiskLevel } from "../types/models.js";

/**
 * Score -> risk level thresholds. The 0-100 score is an internal weighted
 * heuristic total, not a calibrated probability of maliciousness - it exists
 * only to pick one of three user-facing levels and to rank findings.
 */
export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 60) return "HIGH_RISK";
  if (score >= 30) return "SUSPICIOUS";
  return "LOW_RISK";
}
