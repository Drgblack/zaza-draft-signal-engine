# Signal Envelope Migration Notes

## What changed
- Added stage-specific signal types in `types/signal.ts`:
  - `SignalInput`
  - `SignalScore`
  - `SignalInterpretation`
  - `SignalDraft`
  - `SignalReview`
  - `SignalPublish`
  - `SignalPerformance`
- Added `SignalEnvelope` as the staged wrapper around those sections.
- Kept `SignalRecord` as the flattened legacy shape for compatibility.

## Compatibility strategy
- Airtable parsing and serialization still target `SignalRecord`.
- Existing API contracts still use `SignalRecord`.
- New adapter helpers in `lib/signal-envelope.ts` provide:
  - `toSignalEnvelope(signal)`
  - `flattenSignalEnvelope(signal)`
  - `isSignalEnvelope(signal)`

## Minimal refactor applied
- Central read-heavy helpers now accept either `SignalRecord` or `SignalEnvelope`:
  - `lib/workflow.ts`
  - `lib/scoring.ts`
  - `lib/interpreter.ts`
  - `lib/generator.ts`

## Recommended next steps
- Migrate new logic to `SignalEnvelope` first, not old UI/routes.
- Keep persistence and transport flattened until storage and API boundaries are ready to change.
- Refactor route handlers and Airtable mappers only after staged models are used in more core domain services.
