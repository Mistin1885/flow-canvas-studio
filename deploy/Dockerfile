FROM node:24-bookworm-slim AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && install -d -m 1777 /run/flow-canvas
COPY backend/__init__.py backend/

FROM runtime AS database
COPY backend/database_api.py backend/storage.py backend/backup.py backend/
ENV FLOW_DATA_DIR=/data
USER 1000:1000
CMD ["uvicorn", "backend.database_api:app", "--uds", "/run/flow-canvas/database.sock", "--workers", "1", "--no-proxy-headers"]

FROM runtime AS web
COPY backend/main.py backend/auth.py backend/
COPY --from=frontend-build /build/dist/ frontend/dist/
ENV FLOW_DATABASE_SOCKET=/run/flow-canvas/database.sock
USER 1000:1000
CMD ["uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8768", "--workers", "1", "--no-proxy-headers"]
