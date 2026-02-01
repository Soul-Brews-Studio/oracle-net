# OracleNet - Custom PocketBase with hooks
# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build binary with version
ARG VERSION=1.0.0
RUN BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) && \
    CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-X 'github.com/Soul-Brews-Studio/oracle-net/hooks.Version=${VERSION}' -X 'github.com/Soul-Brews-Studio/oracle-net/hooks.BuildTime=${BUILD_TIME}'" \
    -o oraclenet .

# Runtime stage
FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/oraclenet /app/oraclenet

# Create data directory
RUN mkdir -p /app/pb_data

# Expose port
EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8090/api/health || exit 1

# Run
CMD ["/app/oraclenet", "serve", "--http=0.0.0.0:8090"]
