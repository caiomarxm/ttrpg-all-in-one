FROM python:3.14-alpine AS build

WORKDIR /workspace

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY app/api/pyproject.toml app/api/uv.lock ./app/api/

WORKDIR /workspace/app/api

RUN uv sync --no-dev --frozen

FROM python:3.14-alpine AS runtime

WORKDIR /workspace

COPY --from=build /workspace/app/api/.venv ./app/api/.venv
COPY app/api/ ./app/api/
COPY persistence/ ./persistence/

ENV PATH="/workspace/app/api/.venv/bin:$PATH"
ENV PYTHONPATH="/workspace/app/api"

WORKDIR /workspace/app/api

RUN chmod +x entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
