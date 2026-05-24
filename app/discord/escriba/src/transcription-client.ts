export type TranscriptionNotifier = {
  notifyTranscriptionReady(sessionId: string, wavPaths: string[]): Promise<void>;
  close(): Promise<void>;
};

export async function tryConnectTranscriptionNotifier(
  apiBaseUrl: string,
): Promise<TranscriptionNotifier | null> {
  if (!apiBaseUrl.trim()) {
    console.warn(
      "[transcription] TRANSCRIPTION_API_URL is empty; recording without transcription enqueue",
    );
    return null;
  }

  return createTranscriptionNotifier(apiBaseUrl);
}

export function createTranscriptionNotifier(
  apiBaseUrl: string,
): TranscriptionNotifier {
  const base = apiBaseUrl.replace(/\/$/, "");

  return {
    async notifyTranscriptionReady(sessionId: string, wavPaths: string[]): Promise<void> {
      const response = await fetch(`${base}/sessions/${sessionId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wav_paths: wavPaths }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `transcription notify failed: ${response.status} ${response.statusText} ${body}`,
        );
      }
    },

    async close(): Promise<void> {
      return;
    },
  };
}
