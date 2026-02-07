🚀 API ArgosAI Maquina

Simple, secure Node.js + Express API scaffold with pnpm - ready for Jetson-style deployments.

---

✨ Overview

Small, production-minded API with:

- API Key authentication (x-api-key header)
- HTTPS / HTTP/2 ready (expects certs in ./certs)
- Rate limiting (returns 429 with rate headers)
- gzip compression
- Cursor-based pagination and fields filtering
- Error responses use application/problem+json
- SQLite persistence (local DB file)

---

⚡ Quick Start

Requirements: Node.js (18+ recommended), pnpm

1. Install dependencies

```bash
pnpm install
```

2. Create a .env file with at minimum:

```
API_KEY=your_api_key_here
PORT=3000
DB_PATH=./data/argos.db
MACHINE_ID=jetson-01
TRUST_PROXY=0
LOG_FILE=
```

Notes:
- `DB_PATH` can be absolute (e.g. `D:\sqlite\databases\carlitos-db`) or relative.
- Set `LOG_FILE` to a path to log to file; leave empty for stdout.

3. (Optional) Create TLS certs for local HTTPS (dev only)

Place `key.pem` and `cert.pem` under `./certs` so the server can load them. Below are quick ways to generate self-signed certs on common platforms.

- OpenSSL (Linux / macOS / Windows with OpenSSL installed):

```bash
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout certs/key.pem -out certs/cert.pem -days 365 \
  -subj "/CN=localhost"
```

- mkcert (recommended for local dev; trusted by your system):

```bash
mkcert -install
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ::1
```

- PowerShell / Windows (creates a PFX then converts to PEM with OpenSSL):

```powershell
New-Item -ItemType Directory -Path .\certs -Force
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\LocalMachine\My"
$pwd = ConvertTo-SecureString -String "changeit" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ".\certs\localhost.pfx" -Password $pwd
# Use OpenSSL (Git for Windows / WSL) to extract PEM files from the PFX
openssl pkcs12 -in .\certs\localhost.pfx -nocerts -nodes -out .\certs\key.pem -passin pass:changeit
openssl pkcs12 -in .\certs\localhost.pfx -clcerts -nokeys -out .\certs\cert.pem -passin pass:changeit
```

Notes:
- Self-signed certs are fine for local development only—do not use them in production.
- For production, provision certs from a trusted CA (ACME/Let's Encrypt or your enterprise PKI) and keep private keys secure.
- Ensure `./certs` is listed in `.gitignore` so certs/keys are not committed.

4. Start the server

```bash
pnpm start
```

🛡️ Generating an API key

You can generate a secure API key locally and place it into your `.env` as `API_KEY`.

Examples:

- OpenSSL (Linux/macOS):

```bash
openssl rand -hex 32
```

- Node.js (cross-platform):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- PowerShell (Windows):

```powershell
[Convert]::ToBase64String((New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes(32))
```

Paste the generated value into `.env` as `API_KEY=` and keep this file out of version control. For production, use a secrets manager instead of a plain `.env` file.

---

🧭 Endpoints (short)

Base path: /v1

Resource: /v1/data-records (plural, kebab-case)

GET /v1/data-records

- Query params must be snake_case.
- Pagination: cursor (id) and page_size (int, default 10, max 100).
- Filtering fields: fields (comma-separated snake_case list). id is always returned.
- Response: 200 with body { data: [...], meta: {...}, links: { self, next? } }.

POST /v1/data-records

- Content-Type: application/json
- JSON property names must be snake_case.
- Required properties: value, date.
- Optional enum status must be UPPER_SNAKE_CASE (eg. PENDING).
- Response: 201 with created resource.

---

🩺 Health & Readiness

- Liveness: `GET /health` → 200 {status: "ok"}
- Readiness: `GET /ready` → 200 {status: "ready"} when the service is accepting traffic, 503 while the server is shutting down.

The server performs a graceful shutdown on `SIGINT`/`SIGTERM`: it stops accepting new connections, waits up to 30s for in-flight requests to finish, then exits. During shutdown `GET /ready` returns 503 so orchestrators (k8s, systemd) can stop routing traffic.
---

📦 Headers & Caching

- Required: x-api-key for protected routes.
- Use Accept: application/json when calling the API.
- Responses set Cache-Control: no-store by default for GETs.
- Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After on 429.

---

❗ Error format

- Errors use application/problem+json with keys: type, title, status, detail.
- The server does not expose stack traces in responses.

---

🧪 Examples

Create a record:

```bash
curl -i -X POST https://localhost:3000/v1/data-records \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_api_key_here" \
  -d '{"value":"hello","date":"2026-02-06"}'
```

List first page (10):

```bash
curl -i "https://localhost:3000/v1/data-records?page_size=10" -H "x-api-key: your_api_key_here"
```

Request only id and date fields:

```bash
curl -i "https://localhost:3000/v1/data-records?fields=id,date" -H "x-api-key: your_api_key_here"
```

---

📝 Notes & Next Steps

- For development you may disable HTTPS redirection or generate local certs with mkcert.
- Consider replacing in-memory store with a durable DB and using UUIDs for ids.
- To add an OpenAPI spec or Swagger UI, ask and it will be added.

---

⚖️ License

MIT
