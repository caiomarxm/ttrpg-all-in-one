import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTranscriptionNotifier,
  tryConnectTranscriptionNotifier,
} from "../transcription-client.js";

describe("createTranscriptionNotifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs wav paths to the session transcription endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      statusText: "Accepted",
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const notifier = createTranscriptionNotifier(
      "http://api:8080/session-transcription",
    );
    await notifier.notifyTranscriptionReady("session-abc", [
      "/data/recordings/session-abc/user-1_alice.wav",
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api:8080/session-transcription/sessions/session-abc/transcribe",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wav_paths: ["/data/recordings/session-abc/user-1_alice.wav"],
        }),
      }),
    );
  });

  it("throws when the API returns a non-success status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "boom",
      }),
    );

    const notifier = createTranscriptionNotifier(
      "http://api:8080/session-transcription",
    );

    await expect(
      notifier.notifyTranscriptionReady("session-abc", []),
    ).rejects.toThrow("transcription notify failed: 500");
  });
});

describe("tryConnectTranscriptionNotifier", () => {
  it("returns null when the API URL is empty", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const notifier = await tryConnectTranscriptionNotifier("   ");
    expect(notifier).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[transcription] TRANSCRIPTION_API_URL is empty; recording without transcription enqueue",
    );
  });

  it("returns a notifier when the API URL is configured", async () => {
    const notifier = await tryConnectTranscriptionNotifier(
      "http://api:8080/session-transcription",
    );
    expect(notifier).not.toBeNull();
  });
});
