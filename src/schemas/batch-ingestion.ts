import { z } from "zod";

import { ingestionEventSchema } from "./ingestion-events";

/** PDF: batch ≤ 500 olay */
export const batchIngestionSchema = z.object({
  events: z.array(ingestionEventSchema).min(1).max(500),
});

export type BatchIngestionBody = z.infer<typeof batchIngestionSchema>;
