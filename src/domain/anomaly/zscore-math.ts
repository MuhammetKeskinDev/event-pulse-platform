const BASELINE_MINUTES = 15;
const SIGMA_THRESHOLD = 3;

/** Tüm event türleri birlikte; dakika başına toplam hacim Z-skoru. */
export const ANOMALY_EVENT_TYPE_AGGREGATE = "*";

export { BASELINE_MINUTES, SIGMA_THRESHOLD };

/** Örneklem standart sapması (n < 2 için 0). Birim testlerde kullanılır. */
export function sampleStdDev(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) {
    return 0;
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/** Örneklem standart sapmasına göre Z-skoru (sapma / σ). Birim testlerde kullanılır. */
export function zScoreDistance(
  evalCount: number,
  mean: number,
  stdDev: number,
): { anomaly: boolean; sigmaDistance: number } {
  if (stdDev === 0) {
    return {
      anomaly: evalCount !== mean,
      sigmaDistance:
        mean === 0 && evalCount === 0 ? 0 : Number.POSITIVE_INFINITY,
    };
  }
  const sigmaDistance = Math.abs(evalCount - mean) / stdDev;
  return {
    anomaly: sigmaDistance > SIGMA_THRESHOLD,
    sigmaDistance,
  };
}

/**
 * Dakika bazlı baseline sayıları ve değerlendirme dakikası hacmi ile Z-skor kararı.
 */
export function computeVolumeZScoreDecision(
  evalCount: number,
  baselineMinuteCounts: readonly number[],
): {
  anomaly: boolean;
  mean: number;
  stdDev: number;
  sigmaDistance: number;
} {
  const mean =
    baselineMinuteCounts.length > 0
      ? baselineMinuteCounts.reduce((a, b) => a + b, 0) /
        baselineMinuteCounts.length
      : 0;
  const stdDev = sampleStdDev(baselineMinuteCounts);
  const { anomaly, sigmaDistance } = zScoreDistance(evalCount, mean, stdDev);
  return { anomaly, mean, stdDev, sigmaDistance };
}
