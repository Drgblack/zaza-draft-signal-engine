import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildOperatorTuningState,
  getDefaultOperatorTuning,
  getTuningPresetSettings,
  operatorTuningSchema,
  operatorTuningSettingsSchema,
  resolveOperatorTuningPreset,
  type OperatorTuning,
  type OperatorTuningSettings,
  type TuningPreset,
} from "@/lib/tuning-definitions";

export * from "@/lib/tuning-definitions";

const TUNING_STORE_PATH = path.join(process.cwd(), "data", "operator-tuning.json");

async function readPersistedOperatorTuning(): Promise<OperatorTuning | null> {
  try {
    const raw = await readFile(TUNING_STORE_PATH, "utf8");
    return operatorTuningSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeOperatorTuning(tuning: OperatorTuning): Promise<void> {
  await mkdir(path.dirname(TUNING_STORE_PATH), { recursive: true });
  await writeFile(TUNING_STORE_PATH, `${JSON.stringify(tuning, null, 2)}\n`, "utf8");
}

export async function getOperatorTuning(): Promise<OperatorTuning> {
  return (await readPersistedOperatorTuning()) ?? getDefaultOperatorTuning();
}

export async function setOperatorTuningPreset(preset: TuningPreset): Promise<{
  previous: OperatorTuning;
  next: OperatorTuning;
}> {
  const previous = await getOperatorTuning();
  const next = buildOperatorTuningState(preset, getTuningPresetSettings(preset));
  await writeOperatorTuning(next);

  return {
    previous,
    next,
  };
}

export async function updateOperatorTuningSettings(
  nextInput: Partial<OperatorTuningSettings>,
): Promise<{
  previous: OperatorTuning;
  next: OperatorTuning;
  changedKeys: Array<keyof OperatorTuningSettings>;
}> {
  const previous = await getOperatorTuning();
  const mergedSettings = operatorTuningSettingsSchema.parse({
    ...previous.settings,
    ...nextInput,
  });
  const next = buildOperatorTuningState(resolveOperatorTuningPreset(mergedSettings), mergedSettings);
  await writeOperatorTuning(next);

  const changedKeys = (Object.keys(mergedSettings) as Array<keyof OperatorTuningSettings>).filter(
    (key) => previous.settings[key] !== next.settings[key],
  );

  return {
    previous,
    next,
    changedKeys,
  };
}

export async function resetOperatorTuning(): Promise<{
  previous: OperatorTuning;
  next: OperatorTuning;
}> {
  const previous = await getOperatorTuning();
  const next = getDefaultOperatorTuning();
  await writeOperatorTuning(next);

  return {
    previous,
    next,
  };
}
