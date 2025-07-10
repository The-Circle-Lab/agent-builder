FROM python:3.12-slim AS runtime

RUN adduser --disabled-password --gecos "" --uid 1000 runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace
USER runner

ENTRYPOINT ["python"] 
