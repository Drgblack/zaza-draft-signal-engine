import {
  getLatestLearningSnapshotSync,
  listLearningRecords,
  listLearningSnapshotsSync,
  type LearningRecord,
  type LearningSnapshot,
} from "@/lib/learning-loop";

export interface LearningRepository {
  listRecords(): Promise<LearningRecord[]>;
  getLatestSnapshot(): Promise<LearningSnapshot | null>;
  listSnapshots(): Promise<LearningSnapshot[]>;
}

class LocalFileLearningRepository implements LearningRepository {
  async listRecords() {
    return listLearningRecords();
  }

  async getLatestSnapshot() {
    return getLatestLearningSnapshotSync();
  }

  async listSnapshots() {
    return listLearningSnapshotsSync();
  }
}

const defaultRepository = new LocalFileLearningRepository();

export function getLearningRepository() {
  return defaultRepository;
}
