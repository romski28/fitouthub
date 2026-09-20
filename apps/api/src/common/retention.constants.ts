/**
 * Retention & closeout constants + feature flag.
 *
 * Retention model (Class 1 initially):
 *   - 10% of the gross quotation (client-facing total, incl. platform fee) is
 *     held back at final release.
 *   - Held for 3 months (the warranty/defect period), then released.
 *   - Opt-in per professional, snapshotted onto the payment plan at award.
 *
 * The feature flag defaults to ENABLED; set
 * `ENABLE_RETENTION_AND_CLOSEOUT=false` to disable globally.
 */

export const RETENTION_PERCENT = 10; // % of gross held back
export const RETENTION_MONTHS = 3; // warranty/defect period duration
export const RETENTION_TERMS_VERSION = 'v1';

export function isRetentionAndCloseoutEnabled(): boolean {
  return process.env.ENABLE_RETENTION_AND_CLOSEOUT !== 'false';
}
