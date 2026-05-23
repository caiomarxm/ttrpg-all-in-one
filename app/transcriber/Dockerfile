FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "celery>=5.4.0" \
    "faster-whisper>=1.1.0" \
    "pydantic>=2.0" \
    "pydantic-settings>=2.0"

COPY config.py models.py transcription.py worker.py ./

ENV TRANSCRIBER_RECORDINGS_DIR=/data/recordings
ENV TRANSCRIBER_RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
ENV TRANSCRIBER_WHISPER_MODEL=small

CMD ["celery", "-A", "worker", "worker", "--loglevel=info"]
