import type { ApprovalQueueCandidate } from "@/lib/approval-ranking";
import {
  listContentOpportunityState,
  syncContentOpportunityState,
  type ContentOpportunity,
  type ContentOpportunityState,
} from "@/lib/content-opportunities";
import type { GrowthMemoryState } from "@/lib/growth-memory";

export interface ContentOpportunityRepository {
  getState(): Promise<ContentOpportunityState>;
  listOpportunities(): Promise<ContentOpportunity[]>;
  getOpportunity(opportunityId: string): Promise<ContentOpportunity | null>;
  saveState(input: {
    candidates: ApprovalQueueCandidate[];
    growthMemory: GrowthMemoryState;
    now?: string | Date;
    activeCampaignIds?: string[] | null;
    campaignsExist?: boolean;
  }): Promise<ContentOpportunityState>;
}

class LocalFileContentOpportunityRepository
  implements ContentOpportunityRepository
{
  async getState() {
    return listContentOpportunityState();
  }

  async listOpportunities() {
    return (await this.getState()).opportunities;
  }

  async getOpportunity(opportunityId: string) {
    return (
      (await this.listOpportunities()).find(
        (item) => item.opportunityId === opportunityId,
      ) ?? null
    );
  }

  async saveState(input: {
    candidates: ApprovalQueueCandidate[];
    growthMemory: GrowthMemoryState;
    now?: string | Date;
    activeCampaignIds?: string[] | null;
    campaignsExist?: boolean;
  }) {
    return syncContentOpportunityState({
      candidates: input.candidates,
      growthMemory: input.growthMemory,
      now:
        input.now instanceof Date
          ? input.now
          : input.now
            ? new Date(input.now)
            : undefined,
      activeCampaignIds: input.activeCampaignIds,
      campaignsExist: input.campaignsExist,
    });
  }
}

const defaultRepository = new LocalFileContentOpportunityRepository();

export function getContentOpportunityRepository() {
  return defaultRepository;
}
