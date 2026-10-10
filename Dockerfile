# Multi-stage build: compile the React frontend, then run the FastAPI backend
# which serves the built assets from frontend/dist.

# --- Stage 1: frontend build -------------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend runtime ------------------------------------------------
FROM python:3.10-slim AS backend
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VISIONTRACK_DATA_DIR=/app/data \
    VISIONTRACK_MODELS_DIR=/app/models

# OpenCV runtime libraries.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --upgrade pip && pip install -r backend/requirements.txt

COPY backend/ backend/
COPY scripts/ scripts/
COPY --from=frontend /app/frontend/dist frontend/dist

RUN mkdir -p /app/data/uploads /app/data/outputs /app/models

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "backend"]
