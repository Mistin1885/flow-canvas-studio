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
COPY backend/ backend/
COPY --from=frontend-build /build/dist/ frontend/dist/

FROM runtime AS web
RUN python -c "from backend.main import app; from backend.database_api import app"
USER 1000:1000
CMD ["uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8768", "--workers", "1", "--no-proxy-headers"]
