#!/usr/bin/env bash
# Проверка состояния после включения ПК (read-only, НИЧЕГО не меняет).
# Запуск:  bash scripts/pc-check.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
DB=data/app.db

echo "================ СЕРВИСЫ (должны быть active) ================"
for u in shorts.service cloudflared.service code-server@davtian.service; do
  printf "  %-30s %s\n" "$u" "$(systemctl is-active "$u" 2>/dev/null)"
done

echo
echo "================ BACKEND :8080 ================"
printf "  %-22s %s\n" "health (локально)"     "$(curl -sS --max-time 4  http://localhost:8080/api/health 2>/dev/null || echo 'НЕ ОТВЕЧАЕТ')"
printf "  %-22s %s\n" "сайт (через туннель)"  "$(curl -sS --max-time 6 https://shareboard.live/api/health 2>/dev/null || echo 'НЕ ОТВЕЧАЕТ')"

echo
echo "================ ОЧЕРЕДЬ ВИДЕО ================"
sqlite3 -readonly "$DB" "
SELECT CASE WHEN post_count=0 THEN 'в очереди (ждут выкладки)' ELSE 'в работе / выложено' END, COUNT(*)
FROM videos GROUP BY (post_count=0) ORDER BY 1;
SELECT 'ВСЕГО в библиотеке', COUNT(*) FROM videos;" 2>/dev/null | sed 's/|/:  /; s/^/  /'

echo
echo "===== БЛИЖАЙШИЕ СЛОТЫ ~2ч (локально $(date +%H:%M) $(date +%Z)) — слот | канал | роликов в очереди ====="
sqlite3 -readonly "$DB" "
WITH now AS (SELECT CAST(strftime('%H','now','localtime') AS INT)*60 + CAST(strftime('%M','now','localtime') AS INT) AS m)
SELECT s.value, COALESCE(NULLIF(TRIM(a.yt_channel_title),''), a.channel_name),
       (SELECT COUNT(*) FROM videos v WHERE v.account_id=a.id AND v.post_count=0)
FROM accounts a, json_each(a.schedule) s, now
WHERE a.enabled=1 AND a.yt_refresh_token IS NOT NULL
  AND ( (CAST(substr(s.value,1,2) AS INT)*60 + CAST(substr(s.value,4,2) AS INT)) BETWEEN now.m AND now.m+120
     OR (now.m+120>=1440 AND (CAST(substr(s.value,1,2) AS INT)*60 + CAST(substr(s.value,4,2) AS INT)) BETWEEN 0 AND now.m+120-1440) )
ORDER BY ((CAST(substr(s.value,1,2) AS INT)*60 + CAST(substr(s.value,4,2) AS INT) - (SELECT m FROM now))+1440)%1440;" 2>/dev/null \
  | sed 's/|/  |  /g; s/^/  /'

echo
echo "(пусто в «слотах» = в ближайшие 2ч выкладок нет; всё active + health ok = система поднялась)"
