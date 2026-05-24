import { createWriteStream, mkdirSync } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WriteStream } from "node:fs";

export const WAV_SAMPLE_RATE = 48_000;
export const WAV_CHANNELS = 2;
export const WAV_BIT_DEPTH = 16;
export const WAV_HEADER_SIZE = 44;

export function createWavHeaderPlaceholder(): Buffer {
  const byteRate = WAV_SAMPLE_RATE * WAV_CHANNELS * (WAV_BIT_DEPTH / 8);
  const blockAlign = WAV_CHANNELS * (WAV_BIT_DEPTH / 8);
  const header = Buffer.alloc(WAV_HEADER_SIZE);

  header.write("RIFF", 0);
  header.writeUInt32LE(0, 4);
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
  header.writeUInt32LE(0, 40);

  return header;
}

export function pcmToWav(pcmBuffers: Buffer[]): Buffer {
  const pcm = Buffer.concat(pcmBuffers);
  const header = createWavHeaderPlaceholder();
  header.writeUInt32LE(36 + pcm.length, 4);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function patchWavHeader(filePath: string): Promise<void> {
  const handle = await open(filePath, "r+");
  try {
    const { size } = await handle.stat();
    const pcmSize = size - WAV_HEADER_SIZE;
    if (pcmSize < 0) {
      throw new Error(`WAV file too small to patch header: ${filePath}`);
    }

    const chunkSize = 36 + pcmSize;
    const chunkSizeBuf = Buffer.alloc(4);
    chunkSizeBuf.writeUInt32LE(chunkSize, 0);
    await handle.write(chunkSizeBuf, 0, 4, 4);

    const pcmSizeBuf = Buffer.alloc(4);
    pcmSizeBuf.writeUInt32LE(pcmSize, 0);
    await handle.write(pcmSizeBuf, 0, 4, 40);
  } finally {
    await handle.close();
  }
}

export function openSpeakerWavStream(filePath: string): WriteStream {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const stream = createWriteStream(filePath);
  stream.write(createWavHeaderPlaceholder());
  return stream;
}

export async function writeSpeakerWav(
  filePath: string,
  pcmBuffers: Buffer[],
): Promise<void> {
  mkdirSync(path.dirname(filePath), { recursive: true });
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
