import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[4]
TRANSCRIBER_DIR = Path(__file__).resolve().parents[2]
TESTDATA_DIR = TRANSCRIBER_DIR / "tests" / "testdata"
SESSIONS_ROOT = Path(__file__).resolve().parent / ".docker-sessions"
SESSION_ID = "session-docker-pt"
DOCKER_IMAGE = "ttrpg-all-in-one-transcriber"
FIXTURE_MP3 = TESTDATA_DIR / "pt_br_sample.mp3"
EXPECTED_FILE = TESTDATA_DIR / "pt_br_sample.expected.txt"


def _normalize(text: str) -> str:
    lowered = text.lower().strip()
    return "".join(
        char
        for char in unicodedata.normalize("NFD", lowered)
        if unicodedata.category(char) != "Mn"
    )


def _significant_words(text: str) -> list[str]:
    words = re.findall(r"[\w']+", _normalize(text), flags=re.UNICODE)
    return [word for word in words if len(word) >= 4]


def _docker_available() -> bool:
    try:
        subprocess.run(
            ["docker", "info"],
            check=True,
            capture_output=True,
            timeout=30,
        )
        return True
    except (subprocess.SubprocessError, OSError):
        return False


def _docker_image_available() -> bool:
    try:
        result = subprocess.run(
            ["docker", "image", "inspect", DOCKER_IMAGE],
            check=True,
            capture_output=True,
            timeout=30,
        )
        return result.returncode == 0
    except (subprocess.SubprocessError, OSError):
        return False


@pytest.fixture(scope="module")
def require_docker() -> None:
    if not _docker_available():
        pytest.skip("Docker is not available")
    if not _docker_image_available():
        pytest.skip(
            f"Docker image {DOCKER_IMAGE} not found; run "
            "`docker compose build transcriber` first",
        )


@pytest.fixture
def docker_session_dir(require_docker: None) -> Path:
    session_dir = SESSIONS_ROOT / SESSION_ID
    if session_dir.exists():
        shutil.rmtree(session_dir)
    session_dir.mkdir(parents=True)
    yield session_dir
    if session_dir.exists():
        shutil.rmtree(session_dir)


@pytest.mark.docker
def test_docker_transcriber_pt_br_fixture(docker_session_dir: Path) -> None:
    assert FIXTURE_MP3.is_file(), f"missing fixture: {FIXTURE_MP3}"
    expected = EXPECTED_FILE.read_text(encoding="utf-8").strip()
    assert expected, "expected transcript file is empty"

    subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{FIXTURE_MP3.parent}:/testdata:ro",
            "-v",
            f"{SESSIONS_ROOT}:/data/recordings",
            "-e",
            "TRANSCRIBER_WHISPER_MODEL=tiny",
            "-e",
            "TRANSCRIBER_RECORDINGS_DIR=/data/recordings",
            DOCKER_IMAGE,
            "sh",
            "-c",
            (
                "ffmpeg -y -i /testdata/pt_br_sample.mp3 "
                "-ar 48000 -ac 2 -sample_fmt s16 "
                f"/data/recordings/{SESSION_ID}/999_narrador.wav && "
                "python -c \""
                "from config import TranscriberConfig; "
                "from transcription import transcribe_session; "
                f"transcribe_session('{SESSION_ID}', TranscriberConfig())"
                "\""
            ),
        ],
        check=True,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=600,
    )

    transcript_path = docker_session_dir / "transcript.txt"
    assert transcript_path.is_file(), "transcriber did not write transcript.txt"

    transcript = transcript_path.read_text(encoding="utf-8")
    normalized_transcript = _normalize(transcript)
    normalized_expected = _normalize(expected)

    assert normalized_expected in normalized_transcript or all(
        word in normalized_transcript for word in _significant_words(expected)
    ), transcript
