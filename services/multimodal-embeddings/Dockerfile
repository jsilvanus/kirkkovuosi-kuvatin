FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml README.md ./
COPY multimodal_embeddings ./multimodal_embeddings
RUN pip install --upgrade pip && pip install .

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data /models \
    && chown -R appuser:appuser /app /data /models
USER appuser
ENV EMBEDDING_DATA_DIR=/data \
    HF_HOME=/models
EXPOSE 8091
CMD ["uvicorn", "multimodal_embeddings.api:app", "--host", "0.0.0.0", "--port", "8091"]
