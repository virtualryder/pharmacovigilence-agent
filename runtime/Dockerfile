# AgentCore Runtime container (built ARM64 in CodeBuild). Serves /invocations + /ping on :8080
# via BedrockAgentCoreApp.run(). Uses public.ecr.aws base to avoid Docker Hub rate limits.
FROM public.ecr.aws/docker/library/python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent.py .

EXPOSE 8080
# Run under OpenTelemetry auto-instrumentation so AgentCore Observability captures Strands
# per-agent/per-tool spans (no-op if the OTEL collector env isn't injected). -u = unbuffered
# stdout so structured logs flush to CloudWatch immediately.
CMD ["opentelemetry-instrument", "python", "-u", "agent.py"]
