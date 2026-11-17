# syntax=docker/dockerfile:1.7
# ai-service images (DEPLOYMENT §1). Build from apps/ai-service:
#   docker build --target cpu -t snapshare/ai-service:cpu apps/ai-service
# Model weights are never baked in: they are fetched at start and verified by SHA-256
# (Phase 4, infrastructure/models.lock).

FROM ghcr.io/astral-sh/uv:0.13.8 AS uv

FROM python:3.12-slim-bookworm AS cpu
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 PATH=/app/.venv/bin:$PATH
WORKDIR /app
COPY --from=uv /uv /usr/local/bin/uv
# Dependencies first so code changes don't invalidate the dependency layer.
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev
COPY app ./app
RUN useradd --system --uid 10001 --no-create-home ai && rm /usr/local/bin/uv
USER ai
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "--factory", "app.main:create_app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]

# GPU image (nvidia/cuda runtime + onnxruntime-gpu) is built in Phase 4 together with the
# real models. Until then this target fails loudly instead of shipping a CPU image as "cuda".
FROM cpu AS cuda
RUN echo "The cuda target arrives in Phase 4 (AI_ARCHITECTURE §6.3)." >&2 && exit 1
