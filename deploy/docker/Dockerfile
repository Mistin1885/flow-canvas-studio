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
COPY backend/database_api.py backend/canvas_lifecycle.py backend/catalog_pages.py backend/paging.py backend/backup_pages.py backend/storage.py backend/activity.py backend/operations.py backend/bundle.py backend/backup.py backend/snapshot_schema.py backend/snapshots.py backend/snapshot_schedule.py backend/admin_api.py backend/recovery.py backend/
RUN python -c "from backend.database_api import app"
ENV FLOW_DATA_DIR=/data
USER 1000:1000
CMD ["uvicorn", "backend.database_api:app", "--uds", "/run/flow-canvas/database.sock", "--workers", "1", "--no-proxy-headers"]

FROM runtime AS web
COPY backend/main.py backend/live_room.py backend/auth.py backend/github_identity.py backend/
RUN python -c "from backend.main import app"
COPY --from=frontend-build /build/dist/ frontend/dist/
ENV FLOW_DATABASE_SOCKET=/run/flow-canvas/database.sock
USER 1000:1000
CMD ["uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8768", "--workers", "1", "--no-proxy-headers"]
