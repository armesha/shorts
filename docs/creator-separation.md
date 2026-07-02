# Creator service split

`/creator` is served by a separate Fastify process on `127.0.0.1:8091`.
The main Shorts service stays on `127.0.0.1:8080`.

Local build/run:

```bash
npm run creator:web:build
npm run creator:server
npm run creator:smoke
```

Production service install, when ready:

```bash
sudo cp systemd/shorts-creator.service /etc/systemd/system/shorts-creator.service
sudo systemctl daemon-reload
sudo systemctl enable --now shorts-creator.service
```

Production Caddy routing, when ready:

```caddyfile
{
	auto_https off
}

http://:8090 {
	bind 127.0.0.1

	handle /api/creator* {
		reverse_proxy 127.0.0.1:8091 {
			lb_try_duration 2s
		}
	}

	handle /creator* {
		reverse_proxy 127.0.0.1:8091 {
			lb_try_duration 2s
		}
	}

	handle {
		reverse_proxy 127.0.0.1:8080 {
			lb_try_duration 2s
		}
	}

	handle_errors {
		@down expression {err.status_code} in [502, 503, 504]
		header @down Retry-After 20
		header @down Cache-Control "no-store, must-revalidate"
		header @down Content-Type "text/html; charset=utf-8"
		respond @down "<!doctype html><html lang=\"ru\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Обновляемся</title><body>Обновляемся. Страница обновится автоматически.</body></html>" 503
	}
}
```

Validate and reload Caddy only after the Creator service is healthy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```
