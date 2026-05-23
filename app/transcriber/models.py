from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Segment:
    speaker: str
    start: float
    end: float
    text: str


class Transcript:
    def __init__(self, segments: list[Segment]) -> None:
        self.segments = sorted(segments, key=lambda segment: segment.start)

    def format(self) -> str:
        lines = [
            f"[{segment.start:.1f}s] {segment.speaker}: {segment.text}"
            for segment in self.segments
            if segment.text
        ]
        return "\n".join(lines) + ("\n" if lines else "")
