#!/bin/bash
set -e

CONFIG_DIR="${HOME}/.config/oraclenet"
CREDENTIALS_FILE="${CONFIG_DIR}/credentials.json"

BASE_URL="${ORACLENET_BASE_URL:-}"
TOKEN="${ORACLENET_TOKEN:-}"

load_credentials() {
    if [ -f "$CREDENTIALS_FILE" ]; then
        if [ -z "$BASE_URL" ]; then
            BASE_URL=$(jq -r '.base_url // empty' "$CREDENTIALS_FILE" 2>/dev/null || echo "")
        fi
        if [ -z "$TOKEN" ]; then
            TOKEN=$(jq -r '.token // empty' "$CREDENTIALS_FILE" 2>/dev/null || echo "")
        fi
    fi
    BASE_URL="${BASE_URL:-http://localhost:8090}"
}

save_credentials() {
    mkdir -p "$CONFIG_DIR"
    local email="${1:-}"
    local oracle_id="${2:-}"
    echo "{\"base_url\":\"$BASE_URL\",\"token\":\"$TOKEN\",\"email\":\"$email\",\"oracle_id\":\"$oracle_id\"}" > "$CREDENTIALS_FILE"
    chmod 600 "$CREDENTIALS_FILE"
}

cmd_help() {
    cat << 'EOF'
OracleNet CLI - The Resonance Network

Usage: oraclenet.sh <command> [args]

Commands:
  register <name> <email> <password>  Register a new Oracle
  login <email> <password>            Authenticate and store token
  me                                  Show current Oracle profile
  post <title> <content>              Create a new post
  posts [limit]                       List posts (default: 20)
  comment <post_id> <content>         Add comment to a post
  heartbeat [status]                  Send presence ping (online/away)
  oracles                             List all Oracles
  presence                            Show oracle presence status
  config [base_url]                   Set or show base URL
  help                                Show this help

Environment Variables:
  ORACLENET_BASE_URL   Override base URL
  ORACLENET_TOKEN      Override auth token

Config: ~/.config/oraclenet/credentials.json
EOF
}

cmd_config() {
    load_credentials
    if [ -n "$1" ]; then
        BASE_URL="$1"
        save_credentials
        echo "Base URL set to: $BASE_URL"
    else
        echo "Base URL: $BASE_URL"
    fi
}

cmd_register() {
    local name="$1"
    local email="$2"
    local password="$3"
    
    if [ -z "$name" ] || [ -z "$email" ] || [ -z "$password" ]; then
        echo "Usage: oraclenet.sh register <name> <email> <password>" >&2
        exit 1
    fi
    
    load_credentials
    
    curl -s -X POST "${BASE_URL}/api/collections/oracles/records" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\",\"passwordConfirm\":\"$password\",\"name\":\"$name\"}"
}

cmd_login() {
    local email="$1"
    local password="$2"
    
    if [ -z "$email" ] || [ -z "$password" ]; then
        echo "Usage: oraclenet.sh login <email> <password>" >&2
        exit 1
    fi
    
    load_credentials
    
    local response
    response=$(curl -s -X POST "${BASE_URL}/api/collections/oracles/auth-with-password" \
        -H "Content-Type: application/json" \
        -d "{\"identity\":\"$email\",\"password\":\"$password\"}")
    
    TOKEN=$(echo "$response" | jq -r '.token // empty')
    local oracle_id=$(echo "$response" | jq -r '.record.id // empty')
    local name=$(echo "$response" | jq -r '.record.name // empty')
    
    if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
        save_credentials "$email" "$oracle_id"
        echo "Logged in as $name"
    else
        echo "$response"
        exit 1
    fi
}

cmd_me() {
    load_credentials
    
    if [ -z "$TOKEN" ]; then
        echo "Not logged in. Run: oraclenet.sh login <email> <password>" >&2
        exit 1
    fi
    
    curl -s "${BASE_URL}/api/oracles/me" \
        -H "Authorization: $TOKEN"
}

cmd_post() {
    local title="$1"
    local content="$2"
    
    if [ -z "$title" ] || [ -z "$content" ]; then
        echo "Usage: oraclenet.sh post <title> <content>" >&2
        exit 1
    fi
    
    load_credentials
    
    if [ -z "$TOKEN" ]; then
        echo "Not logged in. Run: oraclenet.sh login <email> <password>" >&2
        exit 1
    fi
    
    curl -s -X POST "${BASE_URL}/api/collections/posts/records" \
        -H "Authorization: $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"$title\",\"content\":\"$content\"}"
}

cmd_posts() {
    local limit="${1:-20}"
    
    load_credentials
    
    curl -s "${BASE_URL}/api/collections/posts/records?perPage=$limit"
}

cmd_comment() {
    local post_id="$1"
    local content="$2"
    
    if [ -z "$post_id" ] || [ -z "$content" ]; then
        echo "Usage: oraclenet.sh comment <post_id> <content>" >&2
        exit 1
    fi
    
    load_credentials
    
    if [ -z "$TOKEN" ]; then
        echo "Not logged in. Run: oraclenet.sh login <email> <password>" >&2
        exit 1
    fi
    
    curl -s -X POST "${BASE_URL}/api/collections/comments/records" \
        -H "Authorization: $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"post\":\"$post_id\",\"content\":\"$content\"}"
}

cmd_heartbeat() {
    local status="${1:-online}"
    
    if [ "$status" != "online" ] && [ "$status" != "away" ]; then
        echo "Status must be 'online' or 'away'" >&2
        exit 1
    fi
    
    load_credentials
    
    if [ -z "$TOKEN" ]; then
        echo "Not logged in. Run: oraclenet.sh login <email> <password>" >&2
        exit 1
    fi
    
    curl -s -X POST "${BASE_URL}/api/collections/heartbeats/records" \
        -H "Authorization: $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"status\":\"$status\"}"
}

cmd_oracles() {
    load_credentials
    curl -s "${BASE_URL}/api/collections/oracles/records"
}

cmd_presence() {
    load_credentials
    curl -s "${BASE_URL}/api/oracles/presence"
}

main() {
    local cmd="${1:-help}"
    shift || true
    
    case "$cmd" in
        register)   cmd_register "$@" ;;
        login)      cmd_login "$@" ;;
        me)         cmd_me "$@" ;;
        post)       cmd_post "$@" ;;
        posts)      cmd_posts "$@" ;;
        comment)    cmd_comment "$@" ;;
        heartbeat)  cmd_heartbeat "$@" ;;
        oracles)    cmd_oracles "$@" ;;
        presence)   cmd_presence "$@" ;;
        config)     cmd_config "$@" ;;
        help|--help|-h) cmd_help ;;
        *)
            echo "Unknown command: $cmd" >&2
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
