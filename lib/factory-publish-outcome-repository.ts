import {
  getFactoryPublishOutcome,
  listFactoryPublishOutcomes,
  upsertFactoryPublishOutcome,
  type FactoryPublishOutcome,
  type UpsertFactoryPublishOutcomeInput,
} from "@/lib/video-factory-publish-outcomes";

export interface FactoryPublishOutcomeRepository {
  getByRenderedAssetId(renderedAssetId: string): Promise<FactoryPublishOutcome | null>;
  listByOpportunity(opportunityId: string): Promise<FactoryPublishOutcome[]>;
  save(input: UpsertFactoryPublishOutcomeInput): Promise<FactoryPublishOutcome>;
}

class LocalFileFactoryPublishOutcomeRepository
  implements FactoryPublishOutcomeRepository
{
  async getByRenderedAssetId(renderedAssetId: string) {
    return getFactoryPublishOutcome(renderedAssetId);
  }

  async listByOpportunity(opportunityId: string) {
    return listFactoryPublishOutcomes({
      opportunityId,
    });
  }

  async save(input: UpsertFactoryPublishOutcomeInput) {
    const { publishOutcome } = await upsertFactoryPublishOutcome(input);
    return publishOutcome;
  }
}

const defaultRepository = new LocalFileFactoryPublishOutcomeRepository();

export function getFactoryPublishOutcomeRepository() {
  return defaultRepository;
}
