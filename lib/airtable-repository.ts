import {
  createSignal as createSignalInAirtable,
  deriveDisplayEngagementScore as deriveDisplayEngagementScoreFromAirtable,
  getAirtableDiagnostics,
  getSafeAirtableErrorMessage,
  getSignal as getSignalFromAirtable,
  getSignalWithFallback as getSignalWithFallbackFromAirtable,
  listSignals as listSignalsFromAirtable,
  listSignalsWithFallback as listSignalsWithFallbackFromAirtable,
  saveSignalWithFallback as saveSignalWithFallbackFromAirtable,
  updateSignal as updateSignalInAirtable,
} from "@/lib/signal-repository";
import type { SignalRepositoryAdapter } from "@/lib/signal-repository";

export const airtableSignalRepository: SignalRepositoryAdapter = {
  async getSignal(recordId) {
    return getSignalFromAirtable(recordId);
  },
  async saveSignal(input) {
    return createSignalInAirtable(input);
  },
  async updateSignal(recordId, input) {
    return updateSignalInAirtable(recordId, input);
  },
  async listSignals(options) {
    return listSignalsFromAirtable(options);
  },
  async getSignalWithFallback(recordId) {
    return getSignalWithFallbackFromAirtable(recordId);
  },
  async saveSignalWithFallback(recordId, input) {
    return saveSignalWithFallbackFromAirtable(recordId, input);
  },
  async listSignalsWithFallback(options) {
    return listSignalsWithFallbackFromAirtable(options);
  },
  async getDiagnostics() {
    return getAirtableDiagnostics();
  },
  getSafeErrorMessage(error) {
    return getSafeAirtableErrorMessage(error);
  },
  deriveDisplayEngagementScore(signal) {
    return deriveDisplayEngagementScoreFromAirtable(signal);
  },
};

