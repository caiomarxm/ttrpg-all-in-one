FROM python:3.14-alpine AS build

WORKDIR /workspace

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY app/api/pyproject.toml app/api/uv.lock ./app/api/

WORKDIR /workspace/app/api

RUN uv sync --no-dev --frozen

FROM python:3.14-alpine AS runtime

WORKDIR /workspace

COPY app/api/ ./app/api/
COPY persistence/ ./persistence/
COPY --from=build /workspace/app/api/.venv ./app/api/.venv

ENV PATH="/workspace/app/api/.venv/bin:$PATH"
ENV PYTHONPATH="/workspace/app/api"

WORKDIR /workspace/app/api

RUN chmod +x scripts/docker-migrate.sh

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
