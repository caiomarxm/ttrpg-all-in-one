FROM python:3.14-alpine AS build

WORKDIR /workspace

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./

RUN uv sync --no-dev --frozen

FROM python:3.14-alpine AS runtime

WORKDIR /workspace

COPY --from=build /workspace/.venv ./.venv
COPY . ./app/

ENV PATH="/workspace/.venv/bin:$PATH"
ENV PYTHONPATH="/workspace/app"

CMD ["python", "app/entrypoints/bot.py"]
