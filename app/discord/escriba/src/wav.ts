import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const WAV_SAMPLE_RATE = 48_000;
export const WAV_CHANNELS = 2;
export const WAV_BIT_DEPTH = 16;

export function pcmToWav(pcmBuffers: Buffer[]): Buffer {
  const pcm = Buffer.concat(pcmBuffers);
  const byteRate = WAV_SAMPLE_RATE * WAV_CHANNELS * (WAV_BIT_DEPTH / 8);
  const blockAlign = WAV_CHANNELS * (WAV_BIT_DEPTH / 8);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(WAV_CHANNELS, 22);
  header.writeUInt32LE(WAV_SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(WAV_BIT_DEPTH, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export async function writeSpeakerWav(
  filePath: string,
  pcmBuffers: Buffer[],
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, pcmToWav(pcmBuffers));
}

export function speakerWavPath(
  recordingsDir: string,
  sessionId: string,
  userId: string,
  username: string,
): string {
  const safeUsername = username.replace(/[^\w.-]+/g, "_");
  return path.join(
    recordingsDir,
    sessionId,
    `${userId}_${safeUsername}.wav`,
  );
}
