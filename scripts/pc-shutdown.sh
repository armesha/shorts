#!/usr/bin/env bash
# Чистое выключение ПК для переезда: корректно гасит backend (даёт доделать текущую
# выкладку на YouTube и слить базу WAL→app.db), затем выключает машину.
# cloudflared и code-server гасит сам poweroff (у них нет важного состояния).
# Запуск:  bash scripts/pc-shutdown.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

echo "Последние события планировщика:"
journalctl -u shorts.service -n 5 --no-pager -o cat 2>/dev/null | sed 's/^/  /' \
  || echo "  (журнал недоступен — не критично)"
echo
read -r -p "Корректно остановить backend и ВЫКЛЮЧИТЬ компьютер? [y/N] " ans
case "${ans,,}" in y|yes) ;; *) echo "Отменено."; exit 0 ;; esac

echo "→ Останавливаю backend (даю доделать выкладку и слить базу)…"
sudo systemctl stop shorts.service
for _ in $(seq 1 25); do
  [ "$(systemctl is-active shorts.service 2>/dev/null)" != active ] && break
  sleep 1
done
echo "  shorts.service: $(systemctl is-active shorts.service 2>/dev/null)"
[ -f data/app.db-wal ] && echo "  WAL остаток: $(stat -c%s data/app.db-wal) байт (после чистой остановки обычно ~0)"

echo "→ Выключаю компьютер…"
sudo systemctl poweroff
