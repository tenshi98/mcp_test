# 2. Instalación

## Requisitos
- **Hardware:** cualquier equipo; ≥ 512 MB RAM y 100 MB de disco son suficientes.
- **Software:** Node.js ≥ 22.5 (recomendado 24; trae `node:sqlite`), npm ≥ 10, git. Opcional: `sqlite3` CLI para inspeccionar la BD,
  `curl` para verificar.
- **Sistemas:** Linux, macOS, Windows (WSL o nativo).

## Pasos
```bash
git clone <repositorio> mcp_test && cd mcp_test
npm install                                  # @modelcontextprotocol/sdk, zod
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # pegue el resultado en TOKEN_PEPPER
```
### Base de datos
La BD es un archivo SQLite (`DB_PATH`, por defecto `data/mcp.db`). Se crea **desde cero** con los scripts entregados:
```bash
npm run db:init                  # ejecuta sql/001_schema.sql + sql/002_seed_records.sql
npm run db:init -- --no-seed     # solo tablas, sin datos de prueba
# alternativa manual con sqlite3:
sqlite3 data/mcp.db < sql/001_schema.sql && sqlite3 data/mcp.db < sql/002_seed_records.sql
```
`001_schema.sql` es idempotente. `002_seed_records.sql` **borra y recarga** `test_records` (úselo solo en entornos de prueba).

### Primer usuario y token
```bash
npm run admin -- user-add --name "Admin" --email admin@example.com --role admin
npm run admin -- token-issue 1 --label primer-token --days 30
```
Guarde el token: **no se puede recuperar** (solo se almacena su hash).

### Iniciar y verificar
```bash
npm start                         # HTTP en HTTP_HOST:HTTP_PORT (127.0.0.1:3000)
curl localhost:3000/health        # {"status":"ok"}
curl -i -X POST localhost:3000/mcp -d '{}'     # 401 (sin token) → la seguridad funciona
npm test                          # todas las pruebas deben pasar
sqlite3 data/mcp.db 'select count(*) from test_records'     # 30
```
Para exponerlo fuera de localhost, colóquelo detrás de un proxy TLS (nginx/Caddy) y ajuste `PUBLIC_URL`. Nunca publique HTTP sin TLS.
