import { z } from "zod";

const envSchema = z.object({
  RECORDER_TOKEN: z.string().optional().default(""),
  RECORDINGS_DIR: z.string().default("/data/recordings"),
  PORT: z.coerce.number().int().positive().default(3000),
  TRANSCRIPTION_API_URL: z
    .string()
    .default("http://api:8080/session-transcription"),
  IGNORED_USER_IDS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((id) => id.trim()).filter(Boolean)),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return envSchema.parse(env);
}
