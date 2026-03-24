import type { Pool } from "pg";

import { detectAndPersistVolumeAnomaly } from "../../infrastructure/anomaly/pg-volume-zscore-persist";
import type { AnomalyDetectionResult } from "../../infrastructure/anomaly/types";

export async function detectAndPersistAnomaly(
  pool: Pool,
): Promise<AnomalyDetectionResult> {
  return detectAndPersistVolumeAnomaly(pool);
}

export type { AnomalyDetectionResult };
