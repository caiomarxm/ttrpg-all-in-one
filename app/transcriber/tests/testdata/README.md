# Transcriber test fixtures

## `pt_br_sample.mp3`

Brazilian Portuguese speech sample for the Docker integration test.

| Field | Value |
|-------|--------|
| Source | [Tatoeba](https://tatoeba.org/) sentence #13227381 |
| License | CC-BY 2.0 (Tatoeba) |
| Expected text | `pt_br_sample.expected.txt` — *Não há perguntas tolas.* |

The Docker test converts this file to 48 kHz stereo WAV (matching O Escriba output) and runs faster-whisper inside the `transcriber` container.
