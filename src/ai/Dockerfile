# Independent AI sidecar. Base image is small and fully offline: the default
# heuristic backend needs no weights and makes no network calls.
#
# Optional model backends (Laya via transformers, Gemma via Ollama) are opt-in:
#   docker build --build-arg INSTALL_MODELS=1 -t dogfood-ai:models ./src/ai
# Weights must be pre-provisioned (baked in or mounted at /models); the image
# runs with HF_HUB_OFFLINE=1 so it never downloads at runtime.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_OFFLINE=1

WORKDIR /srv

COPY requirements.txt requirements-models.txt ./
RUN pip install --no-cache-dir -r requirements.txt

ARG INSTALL_MODELS=0
RUN if [ "$INSTALL_MODELS" = "1" ]; then pip install --no-cache-dir -r requirements-models.txt; fi

COPY app ./app

EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=20 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=2).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
