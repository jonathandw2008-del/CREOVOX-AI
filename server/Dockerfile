# CREOVOX AI API + worker image. The same image runs both (see docker-compose.yml).
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv PATH="/opt/venv/bin:$PATH"

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --python /usr/local/bin/python3

COPY alembic.ini ./
COPY alembic ./alembic
COPY assets ./assets
COPY app ./app

ENV STORAGE_DIR=/data/storage
RUN useradd --create-home --uid 1000 creovox && mkdir -p /data/storage && chown -R creovox /data
USER creovox
VOLUME ["/data"]
EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
