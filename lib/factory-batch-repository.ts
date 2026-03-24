import {
  getBatchRenderJob,
  listAutoApproveConfigs,
  listBatchRenderJobs,
  listContentMixTargets,
  upsertBatchRenderJob,
  type AutoApproveConfig,
  type BatchRenderJob,
  type ContentMixTarget,
} from "@/lib/factory-batch-control";

export interface FactoryBatchRepository {
  listBatches(): Promise<BatchRenderJob[]>;
  getBatch(batchId: string): Promise<BatchRenderJob | null>;
  saveBatch(batch: BatchRenderJob): Promise<BatchRenderJob>;
  listMixTargets(): Promise<ContentMixTarget[]>;
  listAutoApproveConfigs(): Promise<AutoApproveConfig[]>;
}

class LocalFileFactoryBatchRepository implements FactoryBatchRepository {
  async listBatches() {
    return listBatchRenderJobs();
  }

  async getBatch(batchId: string) {
    return getBatchRenderJob(batchId);
  }

  async saveBatch(batch: BatchRenderJob) {
    return upsertBatchRenderJob(batch);
  }

  async listMixTargets() {
    return listContentMixTargets();
  }

  async listAutoApproveConfigs() {
    return listAutoApproveConfigs();
  }
}

const defaultRepository = new LocalFileFactoryBatchRepository();

export function getFactoryBatchRepository() {
  return defaultRepository;
}
