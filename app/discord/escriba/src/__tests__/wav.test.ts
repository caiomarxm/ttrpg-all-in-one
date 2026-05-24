import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  WAV_BIT_DEPTH,
  WAV_CHANNELS,
  WAV_HEADER_SIZE,
  WAV_SAMPLE_RATE,
  createWavHeaderPlaceholder,
  patchWavHeader,
  pcmToWav,
  writeSpeakerWav,
} from "../wav.js";

describe("wav", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("createWavHeaderPlaceholder writes fmt with zero size fields", () => {
    const header = createWavHeaderPlaceholder();

    expect(header.length).toBe(WAV_HEADER_SIZE);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.toString("ascii", 8, 12)).toBe("WAVE");
    expect(header.readUInt32LE(4)).toBe(0);
    expect(header.readUInt16LE(22)).toBe(WAV_CHANNELS);
    expect(header.readUInt32LE(24)).toBe(WAV_SAMPLE_RATE);
    expect(header.readUInt16LE(34)).toBe(WAV_BIT_DEPTH);
    expect(header.readUInt32LE(40)).toBe(0);
  });

  it("patchWavHeader updates size fields from file length", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-wav-"));
    const filePath = path.join(tempDir, "partial.wav");
    const pcm = Buffer.alloc(960, 1);
    const header = createWavHeaderPlaceholder();

    await writeFile(filePath, Buffer.concat([header, pcm]));
    await patchWavHeader(filePath);

    const written = await readFile(filePath);
    expect(written.readUInt32LE(4)).toBe(36 + pcm.length);
    expect(written.readUInt32LE(40)).toBe(pcm.length);
    expect(written.length).toBe(WAV_HEADER_SIZE + pcm.length);
  });

  it("pcmToWav writes a valid 48kHz stereo 16-bit PCM header", () => {
    const pcm = Buffer.alloc(4, 0);
    const wav = pcmToWav([pcm]);

    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(WAV_CHANNELS);
    expect(wav.readUInt32LE(24)).toBe(WAV_SAMPLE_RATE);
    expect(wav.readUInt16LE(34)).toBe(WAV_BIT_DEPTH);
    expect(wav.length).toBe(44 + pcm.length);
  });

  it("writeSpeakerWav persists file to disk", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "escriba-wav-"));
    const filePath = path.join(tempDir, "session-1", "user_speaker.wav");
    const pcm = Buffer.alloc(960, 1);

    await writeSpeakerWav(filePath, [pcm]);
    const written = await readFile(filePath);

    expect(written.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(written.length).toBe(44 + pcm.length);
  });
});
