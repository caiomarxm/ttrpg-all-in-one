import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  WAV_BIT_DEPTH,
  WAV_CHANNELS,
  WAV_SAMPLE_RATE,
} from "./wav.js";

export const SESSION_MANIFEST_VERSION = 1;
export const MANIFEST_FILENAME = "session_manifest.json";

export type SpeakingBurst = {
  session_offset_ms: number;
  wav_offset_bytes: number;
  pcm_bytes: number;
};

export type SpeakerManifestEntry = {
  user_id: string;
  username: string;
  wav_file: string;
  speaking_bursts: SpeakingBurst[];
};

export type SessionManifest = {
  version: number;
  session_id: string;
  session_started_at_ms: number;
  audio: {
    sample_rate: number;
    channels: number;
    bit_depth: number;
    bytes_per_second: number;
  };
  speakers: Record<string, SpeakerManifestEntry>;
};

export function pcmBytesPerSecond(): number {
  return WAV_SAMPLE_RATE * WAV_CHANNELS * (WAV_BIT_DEPTH / 8);
}

export async function writeSessionManifest(
  sessionDir: string,
  manifest: SessionManifest,
): Promise<void> {
  const filePath = path.join(sessionDir, MANIFEST_FILENAME);
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}
