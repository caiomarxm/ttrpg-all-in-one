from models import Segment, Transcript


def test_transcript_sorts_segments_by_start_time() -> None:
    transcript = Transcript(
        [
            Segment(speaker="bob", start=5.0, end=6.0, text="segundo"),
            Segment(speaker="alice", start=0.5, end=1.5, text="primeiro"),
        ]
    )

    assert [segment.speaker for segment in transcript.segments] == [
        "alice",
        "bob",
    ]


def test_transcript_format_includes_speaker_and_timestamp() -> None:
    transcript = Transcript(
        [
            Segment(speaker="alice", start=1.2, end=2.0, text="Olá pessoal"),
        ]
    )

    assert transcript.format() == "[1.2s] alice: Olá pessoal\n"
