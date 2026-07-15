import type { ForgeLogger } from "./index";
import { summarizeForLog } from "./index";

export interface CreateDemoNarrativeOptions {
  storyId: string;
}

export interface DemoNarrative {
  step(message: string, metadata?: unknown): void;
}

export function createDemoNarrative(
  logger: ForgeLogger,
  options: CreateDemoNarrativeOptions,
): DemoNarrative {
  let stepNumber = 0;

  return {
    step(message, metadata) {
      stepNumber += 1;
      const record: Record<string, unknown> = {
        kind: "demoNarrativeStep",
        demoOnly: true,
        storyId: options.storyId,
        stepNumber,
      };
      if (metadata !== undefined) {
        record.metadata = summarizeForLog(metadata);
      }
      logger.info(record, message);
    },
  };
}
