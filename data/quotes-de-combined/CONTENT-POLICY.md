# ⚠️ quotes-de — content policy (ЧИТАТЬ ПЕРЕД правкой videos.json)

Эта дека (`Politiker-Zitate (DE)`, admin-only) уже получила **страйк YouTube** за hate speech
(цитата Штрауса «…die roten Ratten … in ihre Löcher», `q204.mp4`, снято 2026-06-19). 2026-06-20 из
деки вычищены 10 цитат + соответствующие строки очереди.

**Прежде чем добавить ЛЮБУЮ цитату в `videos.json` — отбракуй её по списку. Сомневаешься → не добавляй.**

Запрещено (дроп сразу):
- дегуманизация людей/групп (звери, паразиты, «крысы», «в норы»);
- слуры по защищённым группам — ориентация/раса/религия/пол/инвалидность (напр. `warmer Bruder`);
- прославление нацизма/диктатуры/авторитаризма, «беспрекословное подчинение», лозунги Геббельса
  (`Wollt ihr den totalen Krieg`), хвала Пиночету;
- релятивизация/отрицание Холокоста, «хватит напоминать о прошлом» (`…auch nicht von Tel Aviv…`);
- анти-иммигрантское/этно-сокращение/«вон» (`Ausländer um die Hälfte reduzieren`, `Gastrecht … Raus`);
- фейк-цитаты (приписанные, но не сказанные) — дезинфо-риск;
- любые призывы к насилию/ненависти/дискриминации.
- для card-style batch также дропай прямые violence terms вроде `tötet`, `Todesstrafe`, `Rache`,
  `Wiedervergeltung`, `geschossen`, даже если это историческая/литературная формулировка.

Целевой регистр: достойное/остроумное/историческое (Weizsäcker, Brandt, Heuss, Genscher, Rau).
Острая политика без атаки на защищённые группы — можно, но при сомнении бери нейтральное.

Lint-страховка (не замена ручной проверки):
```bash
grep -niE "ratten|warmer bruder|bedingungslosen gehorsam|totalen krieg|tel aviv|raus, und zwar|um die hälfte|untermensch|ausrotten|hingehören|ausländer|asyl|flüchtling|juden|israel|parasiten|schweine|vernichten|vergas|zigeuner|neger|nigger|erschieß|umbring|töt|totschlag|totgeschlag|todesstrafe|rache|wiedervergeltung|geschossen|schossen" videos.json
```

Полные правила и контекст: `docs/pack-generation.md` → раздел «⚠️ Inhaltsrichtlinie `quotes-de`».
