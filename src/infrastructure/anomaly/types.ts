export interface AnomalyDetectionResult {
  readonly anomaly: boolean;
  readonly evalMinuteStart: string;
  readonly evalCount: number;
  readonly baselineMean: number;
  readonly baselineStdDev: number;
  readonly sigmaDistance: number;
  readonly persisted: boolean;
}
