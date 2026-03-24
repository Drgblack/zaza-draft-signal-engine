import { airtableSignalRepository } from "@/lib/airtable-repository";
import type { SignalCreatePayload, SignalDataSource, SignalRecord, SignalStatus, UpdateSignalInput } from "@/types/signal";

export interface SignalRepository {
  getSignal(recordId: string): Promise<SignalRecord>;
  saveSignal(input: SignalCreatePayload): Promise<SignalRecord>;
  updateSignal(recordId: string, input: UpdateSignalInput): Promise<SignalRecord>;
  listSignals(options?: {
    limit?: number;
    status?: SignalStatus;
  }): Promise<SignalRecord[]>;
}

export interface SignalLookupResult {
  source: SignalDataSource;
  signal: SignalRecord | null;
  error?: string;
}

export interface SignalCollectionResult {
  source: SignalDataSource;
  signals: SignalRecord[];
  error?: string;
  message?: string;
}

export interface SaveSignalWithFallbackResult {
  source: SignalDataSource;
  persisted: boolean;
  signal: SignalRecord | null;
  error?: string;
}

export interface SignalRepositoryDiagnostics {
  configured: boolean;
  apiReachable: boolean;
  tableReachable: boolean;
  schemaAligned: boolean;
  mappingSucceeded: boolean;
  mode: SignalDataSource;
  missingFields: string[];
  message: string;
}

export interface SignalRepositoryAdapter extends SignalRepository {
  getSignalWithFallback(recordId: string): Promise<SignalLookupResult>;
  saveSignalWithFallback(recordId: string, input: UpdateSignalInput): Promise<SaveSignalWithFallbackResult>;
  listSignalsWithFallback(options?: {
    limit?: number;
    status?: SignalStatus;
  }): Promise<SignalCollectionResult>;
  getDiagnostics(): Promise<SignalRepositoryDiagnostics>;
  getSafeErrorMessage(error: unknown): string;
  deriveDisplayEngagementScore(signal: SignalRecord): number | null;
}

let activeSignalRepository: SignalRepositoryAdapter = airtableSignalRepository;

export function getSignalRepository(): SignalRepositoryAdapter {
  return activeSignalRepository;
}

export function setSignalRepository(repository: SignalRepositoryAdapter) {
  activeSignalRepository = repository;
}

export function resetSignalRepository() {
  activeSignalRepository = airtableSignalRepository;
}

export async function getSignal(recordId: string) {
  return getSignalRepository().getSignal(recordId);
}

export async function saveSignal(input: SignalCreatePayload) {
  return getSignalRepository().saveSignal(input);
}

export async function createSignal(input: SignalCreatePayload) {
  return saveSignal(input);
}

export async function updateSignal(recordId: string, input: UpdateSignalInput) {
  return getSignalRepository().updateSignal(recordId, input);
}

export async function listSignals(options?: {
  limit?: number;
  status?: SignalStatus;
}) {
  return getSignalRepository().listSignals(options);
}

export async function getSignalWithFallback(recordId: string) {
  return getSignalRepository().getSignalWithFallback(recordId);
}

export async function saveSignalWithFallback(recordId: string, input: UpdateSignalInput) {
  return getSignalRepository().saveSignalWithFallback(recordId, input);
}

export async function listSignalsWithFallback(options?: {
  limit?: number;
  status?: SignalStatus;
}) {
  return getSignalRepository().listSignalsWithFallback(options);
}

export async function getSignalRepositoryDiagnostics() {
  return getSignalRepository().getDiagnostics();
}

export async function getAirtableDiagnostics() {
  return getSignalRepositoryDiagnostics();
}

export function getSafeSignalRepositoryErrorMessage(error: unknown) {
  return getSignalRepository().getSafeErrorMessage(error);
}

export function getSafeAirtableErrorMessage(error: unknown) {
  return getSafeSignalRepositoryErrorMessage(error);
}

export function deriveDisplayEngagementScore(signal: SignalRecord) {
  return getSignalRepository().deriveDisplayEngagementScore(signal);
}

