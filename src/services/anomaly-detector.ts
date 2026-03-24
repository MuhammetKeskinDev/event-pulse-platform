/**
 * @deprecated Import from `domain/anomaly/zscore-math` or `application/anomaly-detection` in new code.
 * Facade retained for worker/tests path stability.
 */
export {
  ANOMALY_EVENT_TYPE_AGGREGATE,
  computeVolumeZScoreDecision,
  sampleStdDev,
  zScoreDistance,
} from "../domain/anomaly/zscore-math";
export {
  detectAndPersistAnomaly,
  type AnomalyDetectionResult,
} from "../application/anomaly-detection/run-volume-zscore";
