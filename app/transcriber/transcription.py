from collections import defaultdict
from pathlib import Path

from faster_whisper import WhisperModel

from config import TranscriberConfig
from models import Segment, Transcript


def speaker_label_from_wav(path: Path) -> str:
    stem = path.stem
    if "_" in stem:
        return stem.split("_", 1)[1]
    return stem


def transcribe_wav(
    model: WhisperModel,
    wav_path: Path,
    *,
    language: str = "pt",
) -> list[Segment]:
    speaker = speaker_label_from_wav(wav_path)
    segments_iter, _info = model.transcribe(
        str(wav_path),
        language=language,
        vad_filter=True,
    )

    segments: list[Segment] = []
    for segment in segments_iter:
        text = segment.text.strip()
        if not text:
            continue
        segments.append(
            Segment(
                speaker=speaker,
                start=segment.start,
                end=segment.end,
                text=text,
            )
        )
    return segments


def transcribe_session(
    session_id: str,
    config: TranscriberConfig,
    *,
    model: WhisperModel | None = None,
) -> Path:
    session_dir = Path(config.recordings_dir) / session_id
    wav_files = sorted(session_dir.glob("*.wav"))
    if not wav_files:
        raise FileNotFoundError(f"No WAV files in {session_dir}")

    whisper = model or WhisperModel(
        config.whisper_model,
        device="cpu",
        compute_type="int8",
    )

    all_segments: list[Segment] = []
    for wav_path in wav_files:
        all_segments.extend(transcribe_wav(whisper, wav_path))

    by_speaker: dict[str, list[Segment]] = defaultdict(list)
    for seg in all_segments:
        by_speaker[seg.speaker].append(seg)

    for speaker, segs in by_speaker.items():
        per_speaker_path = session_dir / f"transcript_{speaker}.txt"
        per_speaker_path.write_text(Transcript(segs).format(), encoding="utf-8")

    output_path = session_dir / "transcript.txt"
    output_path.write_text(Transcript(all_segments).format(), encoding="utf-8")
    return output_path
