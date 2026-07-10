# Voiceover Presets

Use these as starting points for Gemini TTS fields. Keep the transcript exact unless the user explicitly asks for extra commentary.

## Cat Meme, Sleepy

- Voice: `Leda`
- Style: playful Russian meme narration, slightly higher-pitched, soft and friendly, with a small smile in the voice
- Pace: slower first question, short pause, warm answer, small natural laugh at the end
- Tags: `[curiosity]`, `[friendly]`, `[short pause]`, `[laughs]`

## Cat Meme, Deadpan

- Voice: `Zubenelgenubi` or `Puck`
- Style: casual confused commentator, amused but not shouting
- Pace: hesitant setup, sharper punchline, small laugh only if the image makes it fit
- Tags: `[confusion]`, `[amusement]`, `[sarcasm]`, `[short pause]`

## Anecdote Storyteller

- Voice: `Achird`
- Style: friendly Russian joke storyteller, conversational and human, small theater smile
- Pace: setup clear and medium, dry second beat, short pause before punchline, punchline slower with a smile
- Tags: `[friendly]`, `[neutral]`, `[amusement]`, `[short pause]`, `[laughs]`

## Whisper Reveal

- Voice: `Enceladus`
- Style: close-mic breathy narrator, quiet but clear
- Pace: slow setup, tiny reveal pause, soft punchline
- Tags: `[whispers]`, `[curiosity]`, `[short pause]`, `[relief]`

## Fast Shorts Hook

- Voice: `Puck`, `Fenrir`, or `Laomedeia`
- Style: upbeat short-form host with clear diction
- Pace: fast but readable; never let music overpower consonants
- Tags: `[excitement]`, `[fast]`, `[short pause]`, `[amusement]`

## Витёк, низкий бодрый мемный голос

- Voice: `Gacrux`.
- Style: низкий, грудной взрослый русский голос; бодрый и уверенный, но не крикливый. Улыбка должна быть слышна в интонации, без настоящего смеха, писклявости или носового тембра. Не имитируй конкретного реального человека.
- Pace: начни спокойно и разговорно; на повороте ускорься примерно на 10%, а в финальной ситуации — ещё чуть быстрее, не теряя согласные. Между строками оставляй только микропаузу, без «мёртвого» воздуха. Не сокращай дыхание и не ускоряй реплику ради заданного хронометража: длительность должна следовать за отыгрышем.
- Escalating meme direction: когда мем идёт от нормальной ситуации к стрессовой, первую строку подай спокойно, среднюю — с оживлением, а последнюю — энергично и с понятным финальным акцентом. Юмор строится только на динамике и «улыбке в голосе», не на добавленных репликах.
- Exact-text rule: если пользователь просит не добавлять «отсебятину», оставь транскрипт без аудиотегов, смеха, вздохов и дополнительных слов. Управляй характером через `style`, `pace`, `scene` и `energy`.

Пример для мема про сердце у кассы: спокойно «Моё сердце» и «Гуляю», заметно бодрее «Бегу», затем постепенно ускорь последнюю строку и выдели «перед кассиром» как сдержанный панчлайн. Не добавляй ничего к исходному тексту.

Если пользователь прямо просит отыгрывать дыханием, это отменяет правило выше только для названных звуков. Для этого мема используй биты: `[calm] Гуляю. [quiet inhale]`; `[gasp] Бегу.`; `[breathless, very fast] Пытаюсь быстро сложить сдачу в кошелёк перед кассиром.` Держи дыхание коротким, а последние слова — быстрыми и разборчивыми; не добавляй иных звуков или слов.
