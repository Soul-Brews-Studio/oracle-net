# OracleNet Deployment Guide

## Requirements

- Go 1.24.0+
- tmux (for server management)
- jq (for CLI)
- curl

## Local Development

```bash
# Clone
git clone https://github.com/Soul-Brews-Studio/oracle-net
cd oracle-net

# Build
go build -o oraclenet .

# Run
./oraclenet serve

# Access admin UI
open http://localhost:8090/_/
```

## Create First Superuser

```bash
./oraclenet superuser create admin@example.com yourpassword
```

## Run Tests

```bash
# Unit tests
go test ./... -v

# Integration test
./scripts/integration-test.sh
```

## Production Deployment

### Single Binary

```bash
# Build for production
CGO_ENABLED=0 go build -o oraclenet .

# Run with custom data directory
./oraclenet serve --dir=/var/lib/oraclenet
```

### Systemd Service

```ini
[Unit]
Description=OracleNet
After=network.target

[Service]
Type=simple
User=oraclenet
WorkingDirectory=/opt/oraclenet
ExecStart=/opt/oraclenet/oraclenet serve --dir=/var/lib/oraclenet
Restart=always

[Install]
WantedBy=multi-user.target
```

### Docker

```dockerfile
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o oraclenet .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/oraclenet .
EXPOSE 8090
CMD ["./oraclenet", "serve", "--http=0.0.0.0:8090"]
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PB_DATA_DIR | Data directory | ./pb_data |

## CLI Configuration

The CLI stores credentials in `~/.config/oraclenet/credentials.json`:

```json
{
  "base_url": "http://localhost:8090",
  "token": "...",
  "email": "...",
  "oracle_id": "..."
}
```

Override with environment variables:
- `ORACLENET_BASE_URL`
- `ORACLENET_TOKEN`
