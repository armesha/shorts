#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
Source / safety ledger:
- Existing cards in data/tips*, including their source-backed claims, are preserved.
- The expansion below is original deterministic generic household content prepared locally from
  everyday organization, storage, cleaning-routine, budget-tracking, and low-risk digital-hygiene
  patterns. No web text is copied into the generated cards.
- Safety exclusions for generated cards: medical treatment, legal advice, tax filing advice,
  electrical/gas/plumbing repair instructions, fire handling, chemical mixing, weapons, lock
  bypassing, surveillance, and anything requiring a licensed professional.
- Profession keys are only visual background selectors shared by the existing lifehack renderer.
  No generated card claims to be professional advice.
- The German deck intentionally keeps the plain tips-de deck shape: no lifehackVariant field,
  no chaplin/moustache variant, and no generated card field that can select one.
*/

const ROOT = process.cwd();
const TARGET = 1200;
const PACK_SIZE = 300;
const SOURCE_SEED_COUNT = 25;
const PROFS = [
  "accountant",
  "builder",
  "chef",
  "firefighter",
  "hairdresser",
  "lawyer",
  "mechanic",
  "police",
  "programmer",
  "teacher",
];

const DECKS = [
  { id: "tips", dir: "data/tips", locale: "ru", min: 300, max: 700 },
  { id: "tips-de", dir: "data/tips-de", locale: "de", min: 300, max: 700 },
  { id: "tips-es", dir: "data/tips-es", locale: "es", min: 300, max: 700 },
];

const TITLE_PATTERNS = {
  ru: [
    (s) => `${s}: одно место`,
    (s) => `${s}: чек на неделю`,
    (s) => `Меньше хаоса: ${s}`,
    (s) => `${s}: видимый якорь`,
    (s) => `${s}: пять минут`,
  ],
  de: [
    (s) => `${s}: ein Ort`,
    (s) => `${s}: Wochencheck`,
    (s) => `Weniger Chaos: ${s}`,
    (s) => `${s}: sichtbar halten`,
    (s) => `${s}: fuenf Minuten`,
  ],
  es: [
    (s) => `${s}: un lugar`,
    (s) => `${s}: revision semanal`,
    (s) => `Menos caos: ${s}`,
    (s) => `${s}: siempre visible`,
    (s) => `${s}: cinco minutos`,
  ],
};

const TEXT_PATTERNS = {
  ru: [
    (c) =>
      `Домашний порядок легче держится, когда есть одно четкое правило: ${c.action}. Держите подсказку ${c.place}, чтобы не искать детали в последний момент. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
    (c) =>
      `Вместо большой системы используйте маленький повторяемый чек: ${c.action}. Затем используйте ориентир: ${c.place}. ${c.cue}. ${c.benefit}. Такой формат не требует покупок: хватает заметки, наклейки или отдельного места. ${c.avoid}.`,
    (c) =>
      `Когда о таком деле вспоминают только в спешке, помогает видимый якорь: ${c.action}. Держите подсказку ${c.place}. ${c.cue}. ${c.benefit}. Раз в несколько дней убирайте лишнее, чтобы правило оставалось коротким. ${c.avoid}.`,
    (c) =>
      `Попробуйте правило одного шага: ${c.action}. Не храните это в голове; лучше положить подсказку ${c.place}. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
    (c) =>
      `Раз в неделю выберите пять минут на короткую проверку: ${c.action}. ${c.cue}. Проверьте ориентир: ${c.place}. ${c.benefit}. Маленькая регулярность работает лучше, чем редкая генеральная уборка. ${c.avoid}.`,
  ],
  de: [
    (c) =>
      `Alltagsordnung bleibt leichter, wenn es eine klare Regel gibt: ${c.action}. Bewahre den Hinweis ${c.place} auf, damit du Details nicht im letzten Moment suchst. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
    (c) =>
      `Statt eines grossen Systems hilft ein kleiner wiederholbarer Check: ${c.action}. Danach gilt der feste Ort: ${c.place}. ${c.cue}. ${c.benefit}. Dafuer reicht meistens eine Notiz, ein Etikett oder ein fester Platz. ${c.avoid}.`,
    (c) =>
      `Wenn so etwas erst in Eile auffaellt, hilft ein sichtbarer Anker: ${c.action}. Den Hinweis legst du ${c.place} ab. ${c.cue}. ${c.benefit}. Entferne alle paar Tage Ueberfluessiges, damit die Regel kurz bleibt. ${c.avoid}.`,
    (c) =>
      `Teste eine Ein-Schritt-Regel: ${c.action}. Behalte sie nicht im Kopf; lege den Hinweis lieber ${c.place} ab. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
    (c) =>
      `Reserviere einmal pro Woche fuenf Minuten fuer einen kurzen Check: ${c.action}. ${c.cue}. Pruefe den festen Ort: ${c.place}. ${c.benefit}. Kleine Regelmaessigkeit hilft mehr als seltene Grossaktionen. ${c.avoid}.`,
  ],
  es: [
    (c) =>
      `El orden diario se mantiene mejor cuando hay una regla clara: ${c.action}. Guarda la pista ${c.place}, asi no buscas detalles en el ultimo minuto. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
    (c) =>
      `No montes un sistema enorme; usa una revision pequena y repetible: ${c.action}. Despues usa esta referencia: ${c.place}. ${c.cue}. ${c.benefit}. Casi siempre basta una nota, una etiqueta o un sitio fijo. ${c.avoid}.`,
    (c) =>
      `Cuando algo aparece solo con prisa, ayuda tener un ancla visible: ${c.action}. Deja la pista ${c.place}. ${c.cue}. ${c.benefit}. Quita lo que sobre cada pocos dias para que la regla siga corta. ${c.avoid}.`,
    (c) =>
      `Prueba una regla de un paso: ${c.action}. No la guardes en la cabeza; deja la pista ${c.place}. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
    (c) =>
      `Una vez por semana reserva cinco minutos para una revision corta: ${c.action}. ${c.cue}. Revisa esta referencia: ${c.place}. ${c.benefit}. La regularidad pequena gana a una limpieza enorme que nunca llega. ${c.avoid}.`,
  ],
};

const FILLER = {
  ru: "Повторяемость важнее идеального оформления: простая заметка, коробка или стикер уже достаточно хороши для старта.",
  de: "Wiederholung ist wichtiger als Perfektion: Eine Notiz, eine Box oder ein Etikett reicht fuer den Start.",
  es: "La repeticion importa mas que la perfeccion: una nota, una caja o una etiqueta ya sirven para empezar.",
};

const EXTRA_CHECKS = {
  ru: [
    "",
    "Раз в месяц проверяйте, работает ли это без новых покупок.",
    "Если правило нельзя повторить за минуту, упростите его.",
    "Держите подсказку там, где вы принимаете решение.",
  ],
  de: [
    "",
    "Pruefe einmal im Monat, ob es ohne neue Kaeufe funktioniert.",
    "Wenn die Regel nicht in einer Minute passt, mach sie einfacher.",
    "Lege den Hinweis dorthin, wo die Entscheidung faellt.",
  ],
  es: [
    "",
    "Revisa cada mes si funciona sin compras nuevas.",
    "Si la regla no cabe en un minuto, hazla mas simple.",
    "Deja la pista justo donde tomas la decision.",
  ],
};

const concepts = [
  concept("accountant",
    {
      short: "подписки",
      object: "подписки и пробные периоды",
      action: "запишите название сервиса, дату списания и сумму в одну заметку",
      place: "рядом с банковским приложением или в таблице бюджета",
      cue: "После каждого оформления сразу добавляйте строку",
      benefit: "так легче увидеть ненужные траты до следующего счета",
      avoid: "Не храните там пароли, коды и полные номера карт",
    },
    {
      short: "Abos",
      object: "Abos und Testphasen",
      action: "notiere Dienst, Abbuchungsdatum und Betrag an einer Stelle",
      place: "neben der Banking-App oder in deiner Budgettabelle",
      cue: "Nach jedem Abschluss kommt sofort eine neue Zeile dazu",
      benefit: "so erkennst du unnoetige Kosten vor der naechsten Abbuchung",
      avoid: "Speichere dort keine Passwoerter, Codes oder vollstaendigen Kartennummern",
    },
    {
      short: "suscripciones",
      object: "suscripciones y pruebas gratis",
      action: "anota servicio, fecha de cobro y monto en un solo lugar",
      place: "junto a la app del banco o en tu tabla de presupuesto",
      cue: "Cada vez que te registres, agrega una fila de inmediato",
      benefit: "asi ves gastos innecesarios antes del siguiente cobro",
      avoid: "No guardes ahi contrasenas, codigos ni numeros completos de tarjeta",
    }),
  concept("accountant",
    {
      short: "чеки",
      object: "чеки и мелкие покупки",
      action: "сразу складывайте бумажные чеки в один конверт, а электронные помечайте одним тегом",
      place: "в ящике у входа или в папке почты",
      cue: "В конце недели выбрасывайте лишнее и оставляйте только нужное для возврата или гарантии",
      benefit: "так траты не расползаются по карманам, сумкам и чатам",
      avoid: "Не фотографируйте документы рядом с лишними личными данными",
    },
    {
      short: "Belege",
      object: "Belege und kleine Einkaeufe",
      action: "lege Papierbelege sofort in einen Umschlag und markiere digitale Belege mit demselben Tag",
      place: "in einer Schublade am Eingang oder in einem Mailordner",
      cue: "Am Wochenende bleibt nur, was fuer Rueckgabe oder Garantie gebraucht wird",
      benefit: "so verteilen sich Ausgaben nicht auf Taschen, Jacken und Chats",
      avoid: "Fotografiere Dokumente nicht zusammen mit unnoetigen persoenlichen Daten",
    },
    {
      short: "recibos",
      object: "recibos y compras pequenas",
      action: "pon los recibos de papel en un sobre y marca los digitales con la misma etiqueta",
      place: "en un cajon de la entrada o en una carpeta del correo",
      cue: "El fin de semana deja solo lo necesario para cambios o garantia",
      benefit: "asi los gastos no quedan repartidos entre bolsillos, bolsas y chats",
      avoid: "No fotografies documentos junto a datos personales que no hacen falta",
    }),
  concept("accountant",
    {
      short: "кладовка",
      object: "запасы в кладовке",
      action: "держите на дверце короткий список того, что заканчивается чаще всего",
      place: "на внутренней стороне дверцы или в заметке для магазина",
      cue: "Когда открываете последнюю пачку, сразу отмечайте ее",
      benefit: "покупки становятся точнее, а дубли перестают занимать полку",
      avoid: "Не покупайте большие партии того, что семья ест редко",
    },
    {
      short: "Vorrat",
      object: "Vorrat im Schrank",
      action: "fuehre an der Tuer eine kurze Liste der Dinge, die oft ausgehen",
      place: "innen an der Schranktuer oder in der Einkaufsliste",
      cue: "Wenn du die letzte Packung oeffnest, markierst du sie sofort",
      benefit: "Einkaeufe werden genauer und doppelte Packungen blockieren weniger Platz",
      avoid: "Kaufe keine grossen Mengen von Sachen, die selten gegessen werden",
    },
    {
      short: "despensa",
      object: "reservas de la despensa",
      action: "mantén en la puerta una lista corta de lo que se acaba mas seguido",
      place: "por dentro de la puerta o en la nota de compras",
      cue: "Cuando abras el ultimo paquete, marcalo al momento",
      benefit: "compras con mas punteria y evitas duplicados ocupando estantes",
      avoid: "No compres grandes cantidades de cosas que casi nadie usa",
    }),
  concept("accountant",
    {
      short: "подарки",
      object: "подарки и маленькие поводы",
      action: "ведите коробку с нейтральными открытками, лентой и двумя запасными мелочами",
      place: "на верхней полке шкафа, отдельно от ежедневных вещей",
      cue: "После каждого праздника пополняйте только то, что реально ушло",
      benefit: "так срочный подарок не превращается в дорогую покупку в последний момент",
      avoid: "Не храните там скоропортящиеся продукты и вещи без понятного адресата",
    },
    {
      short: "Geschenke",
      object: "Geschenke und kleine Anlaesse",
      action: "halte eine Box mit neutralen Karten, Band und zwei kleinen Reserven bereit",
      place: "oben im Schrank, getrennt von Alltagssachen",
      cue: "Nach jedem Anlass ersetzt du nur, was wirklich verbraucht wurde",
      benefit: "ein spontanes Geschenk wird so nicht zum teuren Last-Minute-Kauf",
      avoid: "Lagere dort keine verderblichen Dinge und nichts ohne klaren Empfaenger",
    },
    {
      short: "regalos",
      object: "regalos y ocasiones pequenas",
      action: "guarda una caja con tarjetas neutras, cinta y dos detalles de reserva",
      place: "en una repisa alta, separada de lo diario",
      cue: "Despues de cada ocasion repón solo lo que de verdad se uso",
      benefit: "un regalo urgente no termina siendo una compra cara de ultimo minuto",
      avoid: "No guardes comida ni objetos sin un destinatario claro",
    }),
  concept("accountant",
    {
      short: "счета",
      object: "счета за дом",
      action: "запишите обычный день прихода каждого счета и способ оплаты",
      place: "в календаре с напоминанием за два дня",
      cue: "После оплаты отмечайте не только сумму, но и месяц",
      benefit: "это снижает шанс двойной оплаты или забытых писем",
      avoid: "Не отправляйте скриншоты счетов в общие чаты без закрытых личных данных",
    },
    {
      short: "Rechnungen",
      object: "Haushaltsrechnungen",
      action: "notiere den ueblichen Eingangstag jeder Rechnung und die Zahlungsart",
      place: "im Kalender mit Erinnerung zwei Tage vorher",
      cue: "Nach dem Bezahlen markierst du nicht nur den Betrag, sondern auch den Monat",
      benefit: "das senkt die Chance auf Doppelzahlungen und vergessene Mails",
      avoid: "Teile keine Rechnungsscreenshots in Gruppenchats, wenn persoenliche Daten sichtbar sind",
    },
    {
      short: "facturas",
      object: "facturas del hogar",
      action: "anota el dia habitual de llegada y la forma de pago de cada factura",
      place: "en el calendario con aviso dos dias antes",
      cue: "Despues de pagar marca no solo el monto, tambien el mes",
      benefit: "asi reduces pagos duplicados y correos olvidados",
      avoid: "No mandes capturas de facturas a chats grupales con datos personales visibles",
    }),
  concept("accountant",
    {
      short: "конверт запаса",
      object: "мелкий домашний запас денег",
      action: "выделите понятную сумму на бытовые неожиданности и подпишите, для чего она",
      place: "в отдельной строке бюджета, а не среди обычных трат",
      cue: "Когда запас использован, запишите причину перед пополнением",
      benefit: "так мелкий сбой не ломает весь месячный план",
      avoid: "Не держите крупные суммы наличными и не смешивайте запас с долгами",
    },
    {
      short: "Puffer",
      object: "kleine Haushaltspuffer",
      action: "lege einen klaren Betrag fuer Alltagsueberraschungen fest und benenne den Zweck",
      place: "als eigene Budgetzeile statt zwischen normalen Ausgaben",
      cue: "Wenn der Puffer genutzt wurde, notierst du vor dem Auffuellen den Grund",
      benefit: "so sprengt eine Kleinigkeit nicht den ganzen Monatsplan",
      avoid: "Bewahre keine grossen Bargeldsummen auf und vermische den Puffer nicht mit Schulden",
    },
    {
      short: "colchon pequeno",
      object: "pequeno colchon del hogar",
      action: "separa una cantidad clara para imprevistos cotidianos y ponle nombre",
      place: "como linea aparte del presupuesto, no mezclada con gastos normales",
      cue: "Si lo usas, anota la razon antes de reponerlo",
      benefit: "un tropiezo pequeno no rompe todo el plan mensual",
      avoid: "No guardes grandes sumas en efectivo ni mezcles este fondo con deudas",
    }),

  concept("builder",
    {
      short: "замеры",
      object: "замеры мебели и углов",
      action: "держите в телефоне размеры дверей, лифта, ниши и любимого стола",
      place: "в одной заметке с датой измерения",
      cue: "Перед покупкой сверяйте не только ширину, но и путь до комнаты",
      benefit: "это спасает от возвратов и коробок, которые не проходят в проем",
      avoid: "Не поднимайте тяжелые вещи в одиночку ради проверки",
    },
    {
      short: "Masse",
      object: "Masse von Moebeln und Ecken",
      action: "speichere Tuerbreiten, Aufzug, Nische und Lieblingstisch im Telefon",
      place: "in einer Notiz mit Messdatum",
      cue: "Vor dem Kauf pruefst du nicht nur die Breite, sondern auch den Weg ins Zimmer",
      benefit: "das verhindert Rueckgaben und Kartons, die nicht durch die Tuer passen",
      avoid: "Hebe schwere Dinge nicht allein nur zum Testen",
    },
    {
      short: "medidas",
      object: "medidas de muebles y rincones",
      action: "guarda en el telefono puertas, ascensor, huecos y mesa favorita",
      place: "en una nota con la fecha de medicion",
      cue: "Antes de comprar revisa no solo el ancho, tambien el camino hasta la habitacion",
      benefit: "evitas devoluciones y cajas que no pasan por la puerta",
      avoid: "No levantes cosas pesadas a solas solo para probar",
    }),
  concept("builder",
    {
      short: "винты",
      object: "винты и мелкие детали",
      action: "приклейте пакетик с деталями к инструкции или подпишите его названием мебели",
      place: "в прозрачной коробке с остальными крепежами",
      cue: "После сборки добавьте дату и комнату, где стоит предмет",
      benefit: "через год не придется угадывать, от чего остался странный болт",
      avoid: "Не оставляйте мелкие детали там, где их могут взять дети",
    },
    {
      short: "Schrauben",
      object: "Schrauben und Kleinteile",
      action: "klebe den Teilebeutel an die Anleitung oder beschrifte ihn mit dem Moebelnamen",
      place: "in einer transparenten Box mit anderem Befestigungsmaterial",
      cue: "Nach dem Aufbau kommen Datum und Raum dazu",
      benefit: "nach einem Jahr musst du nicht raten, wozu die seltsame Schraube gehoert",
      avoid: "Lass Kleinteile nicht dort liegen, wo Kinder sie erreichen koennen",
    },
    {
      short: "tornillos",
      object: "tornillos y piezas pequenas",
      action: "pega la bolsita a las instrucciones o rotulala con el nombre del mueble",
      place: "en una caja transparente con otros herrajes",
      cue: "Despues del armado agrega fecha y habitacion",
      benefit: "dentro de un ano no tendras que adivinar de que era ese tornillo raro",
      avoid: "No dejes piezas pequenas donde puedan alcanzarlas los ninos",
    }),
  concept("builder",
    {
      short: "ножки мебели",
      object: "ножки стульев и столов",
      action: "проверяйте фетровые накладки до того, как пол начал царапаться",
      place: "в маленьком пакете рядом с бытовыми мелочами",
      cue: "Когда двигаете мебель для уборки, смотрите на наклейки снизу",
      benefit: "пол и тишина в комнате дольше остаются нормальными",
      avoid: "Не используйте скользкие прокладки на мебели, которая должна стоять устойчиво",
    },
    {
      short: "Moebelfuesse",
      object: "Stuhl- und Tischbeine",
      action: "pruefe Filzgleiter, bevor der Boden schon Kratzer zeigt",
      place: "in einem kleinen Beutel bei den Haushaltsteilen",
      cue: "Wenn du Moebel zum Putzen verschiebst, schaust du kurz darunter",
      benefit: "Boden und Ruhe im Zimmer bleiben laenger erhalten",
      avoid: "Nutze keine rutschigen Pads an Moebeln, die stabil stehen muessen",
    },
    {
      short: "patas de muebles",
      object: "patas de sillas y mesas",
      action: "revisa los fieltros antes de que el piso ya tenga rayas",
      place: "en una bolsita junto a piezas del hogar",
      cue: "Cuando muevas muebles para limpiar, mira un segundo por debajo",
      benefit: "el piso y el silencio de la habitacion duran mas",
      avoid: "No uses protectores resbalosos en muebles que deben quedar firmes",
    }),
  concept("builder",
    {
      short: "краска",
      object: "остатки краски и образцы",
      action: "подпишите банку комнатой, стеной и датой, а код цвета продублируйте в телефоне",
      place: "на полке без прямого солнца и рядом с малярной лентой",
      cue: "После маленького подкраса отметьте, где он был",
      benefit: "следующий след на стене не потребует поисков по старым чекам",
      avoid: "Не смешивайте неизвестные составы и не храните открытые банки возле еды",
    },
    {
      short: "Farbe",
      object: "Farbreste und Muster",
      action: "beschrifte die Dose mit Raum, Wand und Datum und speichere den Farbcode im Telefon",
      place: "auf einem Regal ohne direkte Sonne neben Malerband",
      cue: "Nach einer kleinen Ausbesserung notierst du die Stelle",
      benefit: "der naechste Fleck an der Wand braucht keine Suche in alten Belegen",
      avoid: "Mische keine unbekannten Stoffe und lagere offene Dosen nicht neben Lebensmitteln",
    },
    {
      short: "pintura",
      object: "restos de pintura y muestras",
      action: "rotula el bote con habitacion, pared y fecha, y guarda el codigo de color en el telefono",
      place: "en una repisa sin sol directo junto a la cinta de pintor",
      cue: "Despues de un retoque pequeno anota donde fue",
      benefit: "la siguiente marca en la pared no exige buscar recibos viejos",
      avoid: "No mezcles productos desconocidos ni guardes botes abiertos junto a comida",
    }),
  concept("builder",
    {
      short: "сквозняки",
      object: "сезонные щели у дверей",
      action: "перед холодами пройдитесь рукой вдоль двери и отметьте места, где тянет",
      place: "в заметке с фото конкретного угла",
      cue: "Сначала уберите мешающие коврики и проверьте, закрывается ли дверь ровно",
      benefit: "иногда проблема видна до покупки новых уплотнителей",
      avoid: "Не разбирайте замки, петли и сложные механизмы без специалиста",
    },
    {
      short: "Zugluft",
      object: "saisonale Spalten an Tueren",
      action: "gehe vor der kalten Zeit mit der Hand am Tuerrahmen entlang und markiere Zugstellen",
      place: "in einer Notiz mit Foto der genauen Ecke",
      cue: "Erst entfernst du stoerende Matten und pruefst, ob die Tuer gerade schliesst",
      benefit: "manchmal ist die Ursache sichtbar, bevor du neue Dichtungen kaufst",
      avoid: "Zerlege keine Schloesser, Scharniere oder komplizierten Mechanismen ohne Fachhilfe",
    },
    {
      short: "corrientes",
      object: "rendijas de temporada en puertas",
      action: "antes del frio pasa la mano por el marco y marca donde entra aire",
      place: "en una nota con foto del rincon exacto",
      cue: "Primero quita alfombras que estorben y mira si la puerta cierra recta",
      benefit: "a veces la causa se ve antes de comprar burletes nuevos",
      avoid: "No desmontes cerraduras, bisagras ni mecanismos complicados sin ayuda tecnica",
    }),
  concept("builder",
    {
      short: "коробки",
      object: "коробки хранения",
      action: "фотографируйте содержимое до того, как коробка уедет на верхнюю полку",
      place: "на самой коробке в виде маленькой распечатки или QR-заметки",
      cue: "Когда достаете одну вещь, сразу обновляйте список",
      benefit: "поиск превращается в просмотр фото, а не в раскопки",
      avoid: "Не перегружайте коробки так, чтобы их было трудно безопасно снять",
    },
    {
      short: "Boxen",
      object: "Aufbewahrungsboxen",
      action: "fotografiere den Inhalt, bevor die Box nach oben ins Regal wandert",
      place: "direkt an der Box als kleiner Ausdruck oder als QR-Notiz",
      cue: "Wenn du etwas herausnimmst, aktualisierst du die Liste sofort",
      benefit: "Suchen wird zum Fotocheck statt zum Ausraeumen",
      avoid: "Ueberlade Boxen nicht so, dass sie schwer sicher herunterzunehmen sind",
    },
    {
      short: "cajas",
      object: "cajas de almacenamiento",
      action: "fotografia el contenido antes de subir la caja a la repisa alta",
      place: "en la caja con una foto pequena o una nota QR",
      cue: "Cuando saques algo, actualiza la lista en ese momento",
      benefit: "buscar se vuelve mirar una foto, no desmontar medio armario",
      avoid: "No sobrecargues cajas hasta que sea dificil bajarlas con seguridad",
    }),

  concept("chef",
    {
      short: "съесть первым",
      object: "полку съесть первым",
      action: "выделите переднюю часть холодильника для продуктов, которые нужно использовать раньше",
      place: "на уровне глаз с маленькой наклейкой",
      cue: "Перед готовкой сначала смотрите туда, а потом открывайте новые упаковки",
      benefit: "остатки быстрее превращаются в ужин, а не в забытый контейнер",
      avoid: "Не оставляйте готовую еду вне холодильника дольше безопасного времени",
    },
    {
      short: "Zuerst essen",
      object: "die Zuerst-essen-Zone",
      action: "reserviere den vorderen Kuehlschrankbereich fuer Dinge, die bald wegmuessen",
      place: "auf Augenhoehe mit einem kleinen Etikett",
      cue: "Vor dem Kochen schaust du zuerst dorthin und oeffnest dann erst neue Packungen",
      benefit: "Reste werden schneller zum Abendessen statt zum vergessenen Behaelter",
      avoid: "Lass gegarte Speisen nicht laenger als sicher ausserhalb des Kuehlschranks stehen",
    },
    {
      short: "comer primero",
      object: "la zona comer primero",
      action: "reserva el frente del refrigerador para productos que deben usarse antes",
      place: "a la altura de los ojos con una etiqueta pequena",
      cue: "Antes de cocinar mira ahi primero y abre paquetes nuevos despues",
      benefit: "las sobras se vuelven cena antes de ser un recipiente olvidado",
      avoid: "No dejes comida cocinada fuera del frio mas tiempo del seguro",
    }),
  concept("chef",
    {
      short: "морозилка",
      object: "порции в морозилке",
      action: "замораживайте плоскими пакетами с названием и датой",
      place: "вертикально в коробке, как папки",
      cue: "Новые пакеты ставьте сзади, старые переносите вперед",
      benefit: "еда быстрее оттаивает и не превращается в ледяной архив",
      avoid: "Не замораживайте повторно то, что уже долго стояло теплым",
    },
    {
      short: "Gefrierfach",
      object: "Portionen im Gefrierfach",
      action: "frieren sie flach mit Name und Datum ein",
      place: "senkrecht in einer Box wie Akten",
      cue: "Neue Beutel kommen nach hinten, alte nach vorn",
      benefit: "Essen taut schneller auf und wird nicht zum Eisarchiv",
      avoid: "Frieren nichts erneut ein, was schon lange warm stand",
    },
    {
      short: "congelador",
      object: "porciones del congelador",
      action: "congela en bolsas planas con nombre y fecha",
      place: "en vertical dentro de una caja, como carpetas",
      cue: "Lo nuevo va atras y lo antiguo pasa al frente",
      benefit: "la comida se descongela mas rapido y no se vuelve archivo de hielo",
      avoid: "No vuelvas a congelar algo que paso mucho tiempo templado",
    }),
  concept("chef",
    {
      short: "банки",
      object: "банки с крупами и специями",
      action: "подпишите не только название, но и дату пересыпания",
      place: "на крышке и сбоку, чтобы было видно в ящике",
      cue: "Когда досыпаете новую пачку, сначала используйте старый остаток",
      benefit: "полка выглядит спокойно, а старые продукты не прячутся под новыми",
      avoid: "Не пересыпайте неизвестный продукт в банку без подписи",
    },
    {
      short: "Glaeser",
      object: "Glaeser mit Vorrat und Gewuerzen",
      action: "beschrifte nicht nur den Namen, sondern auch das Umfuelldatum",
      place: "auf Deckel und Seite, damit es in der Schublade sichtbar bleibt",
      cue: "Beim Nachfuellen verbrauchst du zuerst den alten Rest",
      benefit: "das Regal wirkt ruhiger und alte Produkte verschwinden nicht unter neuen",
      avoid: "Fuelle kein unbekanntes Produkt ohne Beschriftung in ein Glas",
    },
    {
      short: "frascos",
      object: "frascos de granos y especias",
      action: "rotula no solo el nombre, tambien la fecha de llenado",
      place: "en la tapa y el lateral para verlo dentro del cajon",
      cue: "Al rellenar usa primero el resto antiguo",
      benefit: "la repisa se ve tranquila y lo viejo no queda tapado por lo nuevo",
      avoid: "No pases un producto desconocido a un frasco sin etiqueta",
    }),
  concept("chef",
    {
      short: "доска",
      object: "разделочную доску",
      action: "кладите под нее влажное полотенце, чтобы доска не гуляла по столу",
      place: "рядом с рабочей зоной, где полотенце легко сполоснуть",
      cue: "После готовки сразу отправляйте полотенце в стирку или сушку",
      benefit: "резать спокойнее, а стол не приходится ловить локтем",
      avoid: "Не используйте мокрую тряпку рядом с розетками и горячими приборами",
    },
    {
      short: "Brett",
      object: "das Schneidebrett",
      action: "lege ein feuchtes Tuch darunter, damit es nicht ueber die Arbeitsplatte wandert",
      place: "nahe der Arbeitszone, wo das Tuch leicht ausgespuelt wird",
      cue: "Nach dem Kochen kommt das Tuch sofort in Waesche oder zum Trocknen",
      benefit: "Schneiden wird ruhiger und du musst den Tisch nicht mit dem Ellbogen festhalten",
      avoid: "Nutze kein nasses Tuch neben Steckdosen oder heissen Geraeten",
    },
    {
      short: "tabla",
      object: "la tabla de cortar",
      action: "pon debajo un pano humedo para que no se mueva por la encimera",
      place: "cerca de la zona de trabajo, donde puedas enjuagarlo facil",
      cue: "Despues de cocinar manda el pano a lavar o a secar",
      benefit: "cortas con mas calma y no sujetas la mesa con el codo",
      avoid: "No uses un pano mojado junto a enchufes o aparatos calientes",
    }),
  concept("chef",
    {
      short: "ланчбокс",
      object: "ланчбокс на завтра",
      action: "собирайте сухие части вечером, а влажные добавляйте утром",
      place: "на одной полке с пустой бутылкой и салфеткой",
      cue: "Перед сном проверьте только три вещи: контейнер, приборы, напиток",
      benefit: "утро начинается без охоты за крышкой и ложкой",
      avoid: "Не кладите продукты, которым нужен холод, в сумку на всю ночь",
    },
    {
      short: "Lunchbox",
      object: "die Lunchbox fuer morgen",
      action: "bereite trockene Teile abends vor und fuege Feuchtes morgens hinzu",
      place: "auf einem Regal mit leerer Flasche und Serviette",
      cue: "Vor dem Schlafen pruefst du nur drei Dinge: Box, Besteck, Getraenk",
      benefit: "der Morgen startet ohne Suche nach Deckel und Loeffel",
      avoid: "Lege kuehlpflichtige Lebensmittel nicht ueber Nacht in die Tasche",
    },
    {
      short: "lonchera",
      object: "la lonchera de manana",
      action: "prepara lo seco por la noche y agrega lo humedo por la manana",
      place: "en una repisa con botella vacia y servilleta",
      cue: "Antes de dormir revisa solo tres cosas: recipiente, cubiertos, bebida",
      benefit: "la manana empieza sin buscar tapa ni cuchara",
      avoid: "No dejes toda la noche en la bolsa comida que necesita frio",
    }),
  concept("chef",
    {
      short: "специи",
      object: "часто используемые специи",
      action: "оставьте впереди только пять банок, которые реально идут в ход",
      place: "в узком лотке рядом с плитой, но не над жаром",
      cue: "Раз в месяц меняйте набор под сезонные блюда",
      benefit: "рука быстрее находит нужное, а редкие банки не мешают",
      avoid: "Не ставьте специи прямо над паром и горячей поверхностью",
    },
    {
      short: "Gewuerze",
      object: "oft genutzte Gewuerze",
      action: "stelle nur fuenf Glaeser nach vorn, die wirklich oft gebraucht werden",
      place: "in einer schmalen Schale nahe dem Herd, aber nicht ueber Hitze",
      cue: "Einmal im Monat passt du die Auswahl an saisonale Gerichte an",
      benefit: "die Hand findet schneller das Richtige und seltene Glaeser stoeren nicht",
      avoid: "Stelle Gewuerze nicht direkt ueber Dampf oder heisse Flaechen",
    },
    {
      short: "especias",
      object: "especias de uso frecuente",
      action: "deja adelante solo cinco frascos que de verdad usas",
      place: "en una bandeja estrecha cerca de la cocina, pero no sobre calor",
      cue: "Una vez al mes cambia el grupo segun comidas de temporada",
      benefit: "la mano encuentra antes lo correcto y los frascos raros no estorban",
      avoid: "No pongas especias justo sobre vapor o superficies calientes",
    }),

  concept("firefighter",
    {
      short: "зарядки",
      object: "зарядки и кабели",
      action: "назначьте одно место для зарядки и убирайте старые адаптеры из розеток",
      place: "на открытой поверхности без бумаги и ткани сверху",
      cue: "Перед сном проверяйте, что кабель не зажат мебелью",
      benefit: "так меньше перегрева, путаницы и поисков нужного провода",
      avoid: "Не используйте кабели с трещинами, оголением или сильным нагревом",
    },
    {
      short: "Ladekabel",
      object: "Ladegeraete und Kabel",
      action: "bestimme einen Ladeplatz und ziehe alte Adapter aus Steckdosen",
      place: "auf einer freien Flaeche ohne Papier oder Stoff darueber",
      cue: "Vor dem Schlafen pruefst du, dass kein Kabel von Moebeln gequetscht wird",
      benefit: "so gibt es weniger Waerme, Kabelsalat und Sucherei",
      avoid: "Nutze keine Kabel mit Rissen, blanken Stellen oder starker Waerme",
    },
    {
      short: "cargadores",
      object: "cargadores y cables",
      action: "define un solo punto de carga y retira adaptadores viejos de enchufes",
      place: "en una superficie abierta, sin papel ni tela encima",
      cue: "Antes de dormir revisa que ningun cable quede aplastado por muebles",
      benefit: "hay menos calor, menos enredos y menos busqueda del cable correcto",
      avoid: "No uses cables con grietas, partes expuestas o calor fuerte",
    }),
  concept("firefighter",
    {
      short: "коридор",
      object: "проходы у выхода",
      action: "оставьте полосу у двери свободной от обуви, коробок и пакетов",
      place: "между входом, ключами и верхней одеждой",
      cue: "Когда заносите покупки, сразу убирайте упаковку из прохода",
      benefit: "в обычный день проще выйти, а в спешке ничего не цепляется за ноги",
      avoid: "Не храните тяжелые вещи над дверью или на шатких полках",
    },
    {
      short: "Flur",
      object: "Wege zum Ausgang",
      action: "halte einen Streifen an der Tuer frei von Schuhen, Kartons und Tueten",
      place: "zwischen Eingang, Schluesseln und Jacken",
      cue: "Nach dem Einkaufen wandert Verpackung sofort aus dem Weg",
      benefit: "im Alltag gehst du leichter raus und in Eile bleibt nichts an den Fuessen haengen",
      avoid: "Lagere schwere Dinge nicht ueber der Tuer oder auf wackligen Regalen",
    },
    {
      short: "pasillo",
      object: "pasos hacia la salida",
      action: "deja libre una franja junto a la puerta, sin zapatos, cajas ni bolsas",
      place: "entre entrada, llaves y abrigos",
      cue: "Cuando traigas compras, saca los envoltorios del paso de inmediato",
      benefit: "sales mas facil a diario y nada se engancha con los pies si hay prisa",
      avoid: "No guardes cosas pesadas sobre la puerta ni en repisas inestables",
    }),
  concept("firefighter",
    {
      short: "датчики",
      object: "домашние датчики",
      action: "поставьте в календарь короткую проверку кнопки и батарейки",
      place: "рядом с другими сезонными делами, а не в случайной памяти",
      cue: "После проверки запишите месяц на наклейке внутри шкафа",
      benefit: "следующий чек не зависит от того, кто вспомнит первым",
      avoid: "Не заклеивайте датчики и не снимайте их из-за случайного сигнала",
    },
    {
      short: "Melder",
      object: "Haushaltsmelder",
      action: "setze einen kurzen Kalendercheck fuer Taste und Batterie",
      place: "neben andere saisonale Aufgaben statt ins Zufallsgedaechtnis",
      cue: "Nach dem Test notierst du den Monat auf einem Etikett im Schrank",
      benefit: "der naechste Check haengt nicht davon ab, wer sich zuerst erinnert",
      avoid: "Klebe Melder nicht ab und entferne sie nicht wegen eines einzelnen Signals",
    },
    {
      short: "detectores",
      object: "detectores del hogar",
      action: "pon en el calendario una revision corta de boton y bateria",
      place: "junto a otras tareas de temporada, no en la memoria",
      cue: "Despues de revisar anota el mes en una etiqueta dentro del armario",
      benefit: "la proxima revision no depende de quien se acuerde primero",
      avoid: "No tapes detectores ni los retires por una senal aislada",
    }),
  concept("firefighter",
    {
      short: "вечерний свет",
      object: "вечерний уют без свечей",
      action: "держите маленькую лампу или безопасную гирлянду там, где обычно хочется свечу",
      place: "на устойчивой поверхности с понятным выключателем",
      cue: "Перед уходом из комнаты выключайте все одним движением",
      benefit: "атмосфера остается, а открытый огонь не нужен для фона",
      avoid: "Не оставляйте любые источники тепла рядом с занавесками и бумагой",
    },
    {
      short: "Abendlicht",
      object: "gemuetliches Licht ohne Kerzen",
      action: "stelle eine kleine Lampe oder sichere Lichterkette dorthin, wo sonst eine Kerze stehen wuerde",
      place: "auf eine stabile Flaeche mit klarem Schalter",
      cue: "Beim Verlassen des Raums schaltest du alles mit einem Griff aus",
      benefit: "die Stimmung bleibt, ohne offenes Feuer als Hintergrund",
      avoid: "Lass Waermequellen nicht neben Vorhaengen oder Papier stehen",
    },
    {
      short: "luz nocturna",
      object: "ambiente sin velas",
      action: "pon una lampara pequena o guirnalda segura donde normalmente querrias una vela",
      place: "sobre una superficie firme con interruptor claro",
      cue: "Al salir de la habitacion apaga todo con un solo gesto",
      benefit: "queda el ambiente sin necesitar llama abierta de fondo",
      avoid: "No dejes fuentes de calor junto a cortinas o papel",
    }),
  concept("firefighter",
    {
      short: "ворс",
      object: "фильтр сушилки и ворс",
      action: "проверяйте фильтр перед каждой сушкой, а не после нее",
      place: "на маленькой карточке-напоминании у корзины для белья",
      cue: "Когда достаете сухие вещи, сразу убирайте видимый ворс вокруг дверцы",
      benefit: "машина работает спокойнее, а белье сушится ровнее",
      avoid: "Не лезьте внутрь техники и не разбирайте ее без инструкции и специалиста",
    },
    {
      short: "Flusen",
      object: "Trocknerfilter und Flusen",
      action: "pruefe den Filter vor jedem Trocknen statt erst danach",
      place: "auf einer kleinen Erinnerungskarte am Waeschekorb",
      cue: "Beim Herausnehmen trockener Waesche entfernst du sichtbare Flusen an der Tuer",
      benefit: "das Geraet laeuft ruhiger und Waesche trocknet gleichmaessiger",
      avoid: "Greife nicht in Technik hinein und zerlege nichts ohne Anleitung und Fachhilfe",
    },
    {
      short: "pelusa",
      object: "filtro de secadora y pelusa",
      action: "revisa el filtro antes de cada secado, no solo despues",
      place: "en una tarjeta recordatoria junto al cesto de ropa",
      cue: "Al sacar ropa seca quita la pelusa visible alrededor de la puerta",
      benefit: "la maquina trabaja mas tranquila y la ropa seca mas parejo",
      avoid: "No metas la mano dentro de equipos ni desmontes nada sin manual y ayuda tecnica",
    }),
  concept("firefighter",
    {
      short: "приборы",
      object: "мелкие кухонные приборы",
      action: "оставляйте вокруг них немного воздуха и убирайте крошки после использования",
      place: "на чистом участке столешницы, а не вплотную к полотенцам",
      cue: "Перед тем как убрать прибор, дайте ему остыть",
      benefit: "стол чище, запахов меньше, а техника служит аккуратнее",
      avoid: "Не накрывайте теплые приборы тканью и не ставьте их на край",
    },
    {
      short: "Geraete",
      object: "kleine Kuechengeraete",
      action: "lasse etwas Luft darum und entferne Kruemel nach der Nutzung",
      place: "auf einer freien Arbeitsflaeche, nicht direkt an Tuechern",
      cue: "Vor dem Wegräumen laesst du das Geraet abkuehlen",
      benefit: "die Flaeche bleibt sauberer, Gerueche werden weniger und Geraete bleiben ordentlicher",
      avoid: "Decke warme Geraete nicht mit Stoff ab und stelle sie nicht an den Rand",
    },
    {
      short: "aparatos",
      object: "aparatos pequenos de cocina",
      action: "deja algo de aire alrededor y quita migas despues de usarlos",
      place: "en una zona limpia de la encimera, no pegados a panos",
      cue: "Antes de guardarlos deja que se enfrien",
      benefit: "la mesa queda mas limpia, hay menos olores y el equipo dura mejor",
      avoid: "No cubras aparatos tibios con tela ni los pongas al borde",
    }),

  concept("hairdresser",
    {
      short: "мешки для стирки",
      object: "мелкие вещи для стирки",
      action: "держите сетчатый мешок прямо у корзины, чтобы носки и деликатные вещи не терялись",
      place: "на крючке или внутри корзины",
      cue: "Перед запуском машины закрывайте мешок и проверяйте карманы",
      benefit: "после стирки меньше одиночных носков и случайных зацепок",
      avoid: "Не набивайте мешок плотно: вещи должны свободно промываться",
    },
    {
      short: "Waschbeutel",
      object: "kleine Waeschestuecke",
      action: "haenge einen Netzbeutel direkt an den Waeschekorb, damit Socken und Feines nicht verschwinden",
      place: "an einem Haken oder innen im Korb",
      cue: "Vor dem Start schliesst du den Beutel und pruefst Taschen",
      benefit: "nach dem Waschen gibt es weniger Einzelsocken und Ziehfäden",
      avoid: "Stopfe den Beutel nicht voll: Kleidung soll frei ausgespuelt werden",
    },
    {
      short: "bolsas de lavado",
      object: "prendas pequenas para lavar",
      action: "deja una bolsa de malla junto al cesto para que calcetines y prendas delicadas no se pierdan",
      place: "en un gancho o dentro del cesto",
      cue: "Antes de iniciar la lavadora cierra la bolsa y revisa bolsillos",
      benefit: "despues hay menos calcetines sueltos y menos enganches",
      avoid: "No llenes la bolsa al maximo: la ropa debe moverse y enjuagarse",
    }),
  concept("hairdresser",
    {
      short: "полотенца",
      object: "полотенца в ванной",
      action: "назначьте каждому полотенцу крючок или сторону, а запас сложите отдельно",
      place: "там, где ткань может высохнуть полностью",
      cue: "После душа расправляйте полотенце, а не бросайте комом",
      benefit: "ванная пахнет свежее, и стирка не набирается раньше времени",
      avoid: "Не сушите плотные мокрые вещи в закрытой корзине",
    },
    {
      short: "Handtuecher",
      object: "Handtuecher im Bad",
      action: "gib jedem Handtuch einen Haken oder eine Seite und lagere Reserve getrennt",
      place: "dort, wo Stoff vollstaendig trocknen kann",
      cue: "Nach dem Duschen breitest du das Handtuch aus statt es zu knuellen",
      benefit: "das Bad riecht frischer und Waesche sammelt sich langsamer",
      avoid: "Trockne schwere nasse Sachen nicht in einem geschlossenen Korb",
    },
    {
      short: "toallas",
      object: "toallas del bano",
      action: "asigna a cada toalla un gancho o lado, y guarda las de reserva aparte",
      place: "donde la tela pueda secarse por completo",
      cue: "Despues de ducharte estira la toalla en vez de dejarla hecha bola",
      benefit: "el bano huele mas fresco y la ropa sucia tarda mas en llenarse",
      avoid: "No seques telas gruesas mojadas dentro de un cesto cerrado",
    }),
  concept("hairdresser",
    {
      short: "раковина",
      object: "мелочи у раковины",
      action: "соберите ежедневные средства на один поднос и уберите редкое в ящик",
      place: "на сухой стороне раковины или на полке рядом",
      cue: "После утреннего ухода возвращайте все на поднос",
      benefit: "поверхность легче протереть, и баночки не расползаются",
      avoid: "Не оставляйте электрические приборы рядом с водой",
    },
    {
      short: "Waschbecken",
      object: "Kleinteile am Waschbecken",
      action: "sammle taegliche Produkte auf einem Tablett und seltene Dinge in einer Schublade",
      place: "auf der trockenen Seite des Beckens oder auf einem nahen Regal",
      cue: "Nach der Morgenroutine kommt alles zurueck aufs Tablett",
      benefit: "die Flaeche laesst sich leichter wischen und Flaschen wandern nicht herum",
      avoid: "Lass elektrische Geraete nicht neben Wasser liegen",
    },
    {
      short: "lavabo",
      object: "cosas pequenas del lavabo",
      action: "reune lo diario en una bandeja y guarda lo raro en un cajon",
      place: "en el lado seco del lavabo o en una repisa cercana",
      cue: "Despues de la rutina de la manana todo vuelve a la bandeja",
      benefit: "la superficie se limpia facil y los frascos no invaden todo",
      avoid: "No dejes aparatos electricos junto al agua",
    }),
  concept("hairdresser",
    {
      short: "пятна",
      object: "пятна на одежде",
      action: "держите у корзины карточку с типом пятна и временем, когда оно появилось",
      place: "в маленьком блокноте или на стикере рядом со стиркой",
      cue: "Перед стиркой сортируйте такие вещи отдельно и читайте ярлык",
      benefit: "вы не забудете, что именно случилось с рубашкой",
      avoid: "Не смешивайте чистящие средства и не трите ткань агрессивно",
    },
    {
      short: "Flecken",
      object: "Flecken auf Kleidung",
      action: "notiere am Waeschekorb Fleckart und Zeitpunkt",
      place: "in einem kleinen Block oder auf einem Zettel neben der Waesche",
      cue: "Vor dem Waschen sortierst du solche Teile separat und liest das Etikett",
      benefit: "du vergisst nicht, was mit dem Hemd passiert ist",
      avoid: "Mische keine Reiniger und reibe Stoff nicht aggressiv",
    },
    {
      short: "manchas",
      object: "manchas en la ropa",
      action: "anota junto al cesto el tipo de mancha y cuando aparecio",
      place: "en una libreta pequena o etiqueta junto a la ropa",
      cue: "Antes de lavar separa esas prendas y lee la etiqueta",
      benefit: "no olvidas que le paso exactamente a la camisa",
      avoid: "No mezcles limpiadores ni frotes la tela con fuerza",
    }),
  concept("hairdresser",
    {
      short: "обувь",
      object: "обувь после прогулки",
      action: "дайте паре высохнуть на коврике перед тем, как убрать в шкаф",
      place: "у входа на решетке или старом полотенце",
      cue: "Когда обувь высохла, стряхните грязь мягкой щеткой",
      benefit: "полка остается чище, а запахи не закрываются внутри шкафа",
      avoid: "Не ставьте мокрую обувь вплотную к сильному теплу",
    },
    {
      short: "Schuhe",
      object: "Schuhe nach dem Spaziergang",
      action: "lasse das Paar auf einer Matte trocknen, bevor es in den Schrank kommt",
      place: "am Eingang auf einem Gitter oder alten Handtuch",
      cue: "Wenn die Schuhe trocken sind, entfernst du Schmutz mit einer weichen Buerste",
      benefit: "das Regal bleibt sauberer und Gerueche werden nicht im Schrank eingeschlossen",
      avoid: "Stelle nasse Schuhe nicht direkt an starke Hitze",
    },
    {
      short: "zapatos",
      object: "zapatos despues de caminar",
      action: "deja que se sequen en una alfombra antes de meterlos al armario",
      place: "en la entrada, sobre una rejilla o toalla vieja",
      cue: "Cuando esten secos quita la tierra con un cepillo suave",
      benefit: "la repisa queda mas limpia y los olores no se encierran",
      avoid: "No pongas zapatos mojados pegados a calor fuerte",
    }),
  concept("hairdresser",
    {
      short: "гардероб",
      object: "вещи в шкафу",
      action: "разверните все вешалки одной стороной, а после носки возвращайте наоборот",
      place: "на одной штанге, без смешивания с сезонным хранением",
      cue: "Через месяц видно, что реально носится",
      benefit: "решение о лишних вещах становится основанным на факте, а не на настроении",
      avoid: "Не выбрасывайте вещи в спешке: сначала отложите спорное отдельно",
    },
    {
      short: "Kleiderschrank",
      object: "Kleidung im Schrank",
      action: "drehe alle Buegel in eine Richtung und nach dem Tragen andersherum",
      place: "auf einer Stange, getrennt von Saisonlagerung",
      cue: "Nach einem Monat siehst du, was wirklich getragen wird",
      benefit: "Aussortieren basiert auf Fakten statt auf Stimmung",
      avoid: "Wirf nichts in Eile weg: lege Unklares zuerst separat",
    },
    {
      short: "armario",
      object: "ropa del armario",
      action: "gira todas las perchas hacia un lado y devuelve al reves lo que uses",
      place: "en una misma barra, sin mezclar con ropa de temporada",
      cue: "Despues de un mes se ve que prendas salen de verdad",
      benefit: "decidir que sobra se basa en hechos, no en animo del dia",
      avoid: "No tires ropa con prisa: separa primero lo dudoso",
    }),

  concept("lawyer",
    {
      short: "гарантии",
      object: "гарантии и инструкции",
      action: "складывайте чек, инструкцию и фото модели в одну папку по названию вещи",
      place: "в облачной папке и в бумажном конверте для важных покупок",
      cue: "При покупке сразу добавляйте дату и магазин",
      benefit: "если вещь сломается, не придется искать коробку по всему дому",
      avoid: "Не храните лишние персональные данные там, где их не требуют",
    },
    {
      short: "Garantien",
      object: "Garantien und Anleitungen",
      action: "lege Beleg, Anleitung und Modellfoto in einen Ordner mit dem Geraetenamen",
      place: "in einem Cloudordner und als Papierumschlag fuer wichtige Kaeufe",
      cue: "Beim Kauf kommen Datum und Laden sofort dazu",
      benefit: "wenn etwas kaputtgeht, suchst du nicht im ganzen Haus nach der Verpackung",
      avoid: "Speichere keine unnoetigen persoenlichen Daten dort, wo sie nicht gebraucht werden",
    },
    {
      short: "garantias",
      object: "garantias e instrucciones",
      action: "guarda recibo, manual y foto del modelo en una carpeta con el nombre del objeto",
      place: "en una carpeta digital y un sobre de papel para compras importantes",
      cue: "Al comprar agrega fecha y tienda al momento",
      benefit: "si algo falla, no buscas la caja por toda la casa",
      avoid: "No guardes datos personales innecesarios donde no hacen falta",
    }),
  concept("lawyer",
    {
      short: "серийные номера",
      object: "серийные номера техники",
      action: "фотографируйте наклейку с моделью до того, как прибор встанет к стене",
      place: "в папке дом техника с понятным именем файла",
      cue: "После установки добавьте комнату и дату покупки",
      benefit: "поддержка и поиск расходников проходят быстрее",
      avoid: "Не публикуйте такие фото в открытых местах",
    },
    {
      short: "Seriennummern",
      object: "Seriennummern von Geraeten",
      action: "fotografiere das Modelllabel, bevor das Geraet an der Wand steht",
      place: "im Ordner Haushalt Geraete mit klarem Dateinamen",
      cue: "Nach dem Aufstellen ergaenzt du Raum und Kaufdatum",
      benefit: "Support und Zubehoersuche gehen schneller",
      avoid: "Veroeffentliche solche Fotos nicht an offenen Orten",
    },
    {
      short: "numeros de serie",
      object: "numeros de serie de equipos",
      action: "fotografia la etiqueta del modelo antes de poner el aparato contra la pared",
      place: "en la carpeta casa equipos con nombre claro",
      cue: "Despues de instalar agrega habitacion y fecha de compra",
      benefit: "soporte y busqueda de repuestos simples van mas rapido",
      avoid: "No publiques esas fotos en lugares abiertos",
    }),
  concept("lawyer",
    {
      short: "фото жилья",
      object: "фото состояния жилья",
      action: "делайте общий кадр комнаты и крупные кадры заметных следов в один день",
      place: "в папке с датой, адресом и названием комнаты",
      cue: "Сразу удаляйте неудачные дубли, чтобы осталась понятная серия",
      benefit: "через месяц легче вспомнить, что уже было на месте",
      avoid: "Не снимайте людей и личные документы без необходимости",
    },
    {
      short: "Wohnungsfotos",
      object: "Fotos vom Wohnungszustand",
      action: "mache am selben Tag ein Raumfoto und Nahaufnahmen sichtbarer Spuren",
      place: "in einem Ordner mit Datum, Adresse und Raumname",
      cue: "Schlechte Duplikate loeschst du sofort, damit eine klare Serie bleibt",
      benefit: "nach Wochen erinnerst du leichter, was schon vorhanden war",
      avoid: "Fotografiere keine Personen oder persoenlichen Dokumente ohne Grund",
    },
    {
      short: "fotos de vivienda",
      object: "fotos del estado de la vivienda",
      action: "toma una foto general del cuarto y acercamientos de marcas visibles el mismo dia",
      place: "en una carpeta con fecha, direccion y nombre del cuarto",
      cue: "Borra duplicados malos enseguida para dejar una serie clara",
      benefit: "semanas despues recuerdas mejor que ya estaba ahi",
      avoid: "No fotografies personas ni documentos personales sin necesidad",
    }),
  concept("lawyer",
    {
      short: "возвраты",
      object: "сроки возврата покупок",
      action: "сразу после покупки ставьте напоминание за несколько дней до конца срока магазина",
      place: "в календаре рядом с фото чека",
      cue: "До напоминания держите упаковку в одном месте",
      benefit: "решение оставить вещь принимается спокойно, а не в последний вечер",
      avoid: "Не рассчитывайте на память и всегда сверяйте правила конкретного магазина",
    },
    {
      short: "Rueckgaben",
      object: "Rueckgabefristen von Kaeufen",
      action: "setze direkt nach dem Kauf eine Erinnerung einige Tage vor Ende der Ladenfrist",
      place: "im Kalender neben dem Foto des Belegs",
      cue: "Bis dahin bleibt die Verpackung an einem Ort",
      benefit: "die Entscheidung faellt ruhig statt am letzten Abend",
      avoid: "Verlass dich nicht aufs Gedaechtnis und pruefe immer die Regeln des konkreten Ladens",
    },
    {
      short: "devoluciones",
      object: "plazos de devolucion",
      action: "al comprar pon un aviso unos dias antes del limite de la tienda",
      place: "en el calendario junto a la foto del recibo",
      cue: "Hasta ese aviso guarda el empaque en un solo lugar",
      benefit: "decides con calma si quedarte el objeto, no la ultima noche",
      avoid: "No dependas de la memoria y revisa siempre las reglas de esa tienda",
    }),
  concept("lawyer",
    {
      short: "домашние правила",
      object: "общие домашние договоренности",
      action: "запишите одну страницу с задачами, днями и ответственными",
      place: "на холодильнике или в общей заметке",
      cue: "Если правило раздражает, меняйте только один пункт за раз",
      benefit: "меньше бытовых споров начинается со слов я думал",
      avoid: "Не превращайте список в наказание или публичный счет ошибок",
    },
    {
      short: "Hausregeln",
      object: "gemeinsame Haushaltsabsprachen",
      action: "schreibe eine Seite mit Aufgaben, Tagen und Verantwortlichen",
      place: "am Kuehlschrank oder in einer gemeinsamen Notiz",
      cue: "Wenn eine Regel nervt, aenderst du nur einen Punkt auf einmal",
      benefit: "weniger Streit beginnt mit dem Satz ich dachte",
      avoid: "Mache aus der Liste keine Strafe und keine oeffentliche Fehlerrechnung",
    },
    {
      short: "reglas de casa",
      object: "acuerdos compartidos del hogar",
      action: "escribe una pagina con tareas, dias y responsables",
      place: "en el refrigerador o en una nota compartida",
      cue: "Si una regla molesta, cambia solo un punto por vez",
      benefit: "menos discusiones empiezan con yo creia",
      avoid: "No conviertas la lista en castigo ni en marcador publico de errores",
    }),
  concept("lawyer",
    {
      short: "копии документов",
      object: "копии важных документов",
      action: "храните простой список, где лежит оригинал и где находится копия",
      place: "в защищенной папке и в бумажной описи без лишних номеров",
      cue: "После поездки или оформления обновляйте только изменившиеся строки",
      benefit: "поиск становится спокойнее, когда нужен один конкретный лист",
      avoid: "Не отправляйте копии в мессенджеры без явной необходимости",
    },
    {
      short: "Dokumentkopien",
      object: "Kopien wichtiger Dokumente",
      action: "fuehre eine einfache Liste mit Ort des Originals und Ort der Kopie",
      place: "in einem geschuetzten Ordner und als Papieruebersicht ohne unnoetige Nummern",
      cue: "Nach Reise oder Antrag aktualisierst du nur geaenderte Zeilen",
      benefit: "die Suche bleibt ruhiger, wenn genau ein Blatt gebraucht wird",
      avoid: "Sende Kopien nicht ohne klaren Grund in Messenger",
    },
    {
      short: "copias",
      object: "copias de documentos importantes",
      action: "mantén una lista simple con lugar del original y lugar de la copia",
      place: "en una carpeta protegida y un indice en papel sin numeros innecesarios",
      cue: "Tras un viaje o tramite actualiza solo las lineas cambiadas",
      benefit: "buscar es mas tranquilo cuando necesitas una hoja concreta",
      avoid: "No mandes copias por mensajeria sin una razon clara",
    }),

  concept("mechanic",
    {
      short: "шины",
      object: "давление в шинах",
      action: "поставьте ежемесячное напоминание проверить значение по табличке автомобиля",
      place: "в календаре рядом с ближайшей заправкой или сервисом",
      cue: "После проверки запишите дату, а не пытайтесь помнить ее",
      benefit: "машина ведет себя предсказуемее, а поездки планируются спокойнее",
      avoid: "Не выполняйте работы под машиной и не игнорируйте предупреждения панели",
    },
    {
      short: "Reifen",
      object: "Reifendruck",
      action: "setze eine monatliche Erinnerung, den Wert laut Fahrzeugetikett zu pruefen",
      place: "im Kalender neben Tankstelle oder Servicepunkt",
      cue: "Nach dem Check notierst du das Datum statt es dir zu merken",
      benefit: "das Auto verhaelt sich berechenbarer und Fahrten planen sich ruhiger",
      avoid: "Arbeite nicht unter dem Auto und ignoriere keine Warnleuchten",
    },
    {
      short: "neumaticos",
      object: "presion de neumaticos",
      action: "pon un aviso mensual para revisar el valor indicado por el vehiculo",
      place: "en el calendario junto a una gasolinera o servicio cercano",
      cue: "Despues de revisar anota la fecha en vez de recordarla de memoria",
      benefit: "el auto se comporta mas predecible y los viajes se planean mejor",
      avoid: "No trabajes debajo del auto ni ignores luces de advertencia",
    }),
  concept("mechanic",
    {
      short: "багажник",
      object: "маленький набор в багажнике",
      action: "держите плед, воду, салфетки, пакет и фонарик в одной мягкой сумке",
      place: "у боковой стенки, чтобы сумка не каталась",
      cue: "После каждой поездки возвращайте использованное на место",
      benefit: "неожиданная грязь, ожидание или пролитая вода решаются без паники",
      avoid: "Не храните в машине то, что портится от жары или мороза",
    },
    {
      short: "Kofferraum",
      object: "kleine Kofferraumtasche",
      action: "bewahre Decke, Wasser, Tuecher, Beutel und Taschenlampe in einer weichen Tasche auf",
      place: "an der Seitenwand, damit sie nicht herumrollt",
      cue: "Nach jeder Fahrt kommt Verbrauchtes wieder hinein",
      benefit: "Schmutz, Warten oder verschuettetes Wasser lassen sich ohne Stress loesen",
      avoid: "Lagere im Auto nichts, was Hitze oder Frost schlecht vertraegt",
    },
    {
      short: "maletero",
      object: "kit pequeno del maletero",
      action: "guarda manta, agua, panos, bolsa y linterna en una bolsa blanda",
      place: "junto a la pared lateral para que no ruede",
      cue: "Despues de cada viaje repón lo usado",
      benefit: "barro, espera o agua derramada se resuelven sin drama",
      avoid: "No guardes en el auto cosas que se danan con calor o frio",
    }),
  concept("mechanic",
    {
      short: "сумки",
      object: "многоразовые сумки",
      action: "после разгрузки сразу кладите одну сумку обратно к двери или в машину",
      place: "на ручке входной двери или в кармане багажника",
      cue: "Если сумка грязная, оставьте ее раскрытой до стирки",
      benefit: "в магазине меньше случайных пакетов и лишних трат",
      avoid: "Не храните влажные сумки сложенными в закрытом месте",
    },
    {
      short: "Taschen",
      object: "Mehrwegtaschen",
      action: "lege nach dem Ausraeumen sofort eine Tasche zurueck an Tuer oder ins Auto",
      place: "an den Tuergriff oder in die Kofferraumtasche",
      cue: "Wenn sie schmutzig ist, bleibt sie offen bis zur Waesche",
      benefit: "im Laden brauchst du weniger spontane Tueten und gibst weniger aus",
      avoid: "Lagere feuchte Taschen nicht gefaltet in einem geschlossenen Fach",
    },
    {
      short: "bolsas",
      object: "bolsas reutilizables",
      action: "al vaciarlas devuelve una bolsa a la puerta o al auto",
      place: "en la manija de entrada o en el bolsillo del maletero",
      cue: "Si esta sucia, dejala abierta hasta lavarla",
      benefit: "en la tienda usas menos bolsas de impulso y gastas menos",
      avoid: "No guardes bolsas humedas dobladas en un lugar cerrado",
    }),
  concept("mechanic",
    {
      short: "батарейки",
      object: "батарейки в пультах",
      action: "приклейте внутри крышки маленькую дату последней замены",
      place: "на обратной стороне крышки или в заметке домашняя техника",
      cue: "Когда пульт начинает сбоить, сначала смотрите дату и контакты",
      benefit: "вы быстрее понимаете, нужна ли новая батарейка или уборка пульта",
      avoid: "Не вставляйте поврежденные батарейки и не храните их россыпью с металлом",
    },
    {
      short: "Batterien",
      object: "Batterien in Fernbedienungen",
      action: "klebe innen an die Klappe ein kleines Datum des letzten Wechsels",
      place: "auf die Deckelrueckseite oder in die Notiz Haushaltstechnik",
      cue: "Wenn die Fernbedienung spinnt, pruefst du zuerst Datum und Kontakte",
      benefit: "du erkennst schneller, ob Batterie oder Reinigung noetig ist",
      avoid: "Nutze keine beschaedigten Batterien und lagere sie nicht lose mit Metall",
    },
    {
      short: "pilas",
      object: "pilas de controles remotos",
      action: "pega dentro de la tapa la fecha del ultimo cambio",
      place: "en la parte interna de la tapa o en la nota equipos de casa",
      cue: "Si el control falla, mira primero fecha y contactos",
      benefit: "sabes antes si falta pila nueva o solo limpieza del control",
      avoid: "No uses pilas danadas ni las guardes sueltas con metal",
    }),
  concept("mechanic",
    {
      short: "инструменты",
      object: "ящик с инструментами",
      action: "обведите самые ходовые предметы на подложке или сделайте фото раскладки",
      place: "в крышке ящика или на стенке шкафа",
      cue: "После мелкой работы возвращайте предмет по силуэту",
      benefit: "пропажа отвертки видна сразу, а уборка занимает минуту",
      avoid: "Не оставляйте острые инструменты без чехла на открытой поверхности",
    },
    {
      short: "Werkzeug",
      object: "Werkzeugkasten",
      action: "zeichne die wichtigsten Teile auf der Unterlage nach oder fotografiere die Ordnung",
      place: "im Deckel des Kastens oder an der Schrankwand",
      cue: "Nach einer Kleinigkeit kommt jedes Teil an seine Form zurueck",
      benefit: "ein fehlender Schraubendreher faellt sofort auf und Aufraeumen dauert kurz",
      avoid: "Lass scharfe Werkzeuge nicht ohne Schutz offen liegen",
    },
    {
      short: "herramientas",
      object: "caja de herramientas",
      action: "marca las piezas principales en la base o toma una foto del orden",
      place: "en la tapa de la caja o en la pared del armario",
      cue: "Despues de un trabajo pequeno cada pieza vuelve a su silueta",
      benefit: "si falta un destornillador se nota al instante y ordenar toma poco",
      avoid: "No dejes herramientas filosas sin funda sobre superficies abiertas",
    }),
  concept("mechanic",
    {
      short: "мануалы",
      object: "инструкции к приборам",
      action: "сохраните PDF или фото важной страницы сразу после покупки",
      place: "в папке по названию прибора",
      cue: "Бумажную инструкцию оставляйте только для техники, которую сложно искать онлайн",
      benefit: "нужная кнопка или режим находятся быстрее, чем в стопке буклетов",
      avoid: "Не нажимайте сервисные режимы, если не понимаете их назначение",
    },
    {
      short: "Anleitungen",
      object: "Geraeteanleitungen",
      action: "speichere PDF oder Foto der wichtigsten Seite direkt nach dem Kauf",
      place: "in einem Ordner mit dem Geraetenamen",
      cue: "Papier hebst du nur fuer Technik auf, die online schwer zu finden ist",
      benefit: "Taste oder Programm findest du schneller als in einem Stapel Hefte",
      avoid: "Aktiviere keine Servicemodi, deren Zweck du nicht verstehst",
    },
    {
      short: "manuales",
      object: "manuales de aparatos",
      action: "guarda PDF o foto de la pagina importante justo despues de comprar",
      place: "en una carpeta con el nombre del aparato",
      cue: "El papel queda solo para equipos dificiles de encontrar online",
      benefit: "un boton o modo aparece antes que en una pila de folletos",
      avoid: "No actives modos de servicio si no entiendes para que sirven",
    }),

  concept("police",
    {
      short: "сумка",
      object: "ежедневную сумку",
      action: "держите в ней три постоянных места: ключи, кошелек, мелочи",
      place: "в отдельных карманах, а не на дне",
      cue: "Перед выходом проведите рукой по этим трем точкам",
      benefit: "проверка занимает секунды и снижает шанс забыть важное",
      avoid: "Не вешайте на ключи бирку с домашним адресом",
    },
    {
      short: "Tasche",
      object: "Alltagstasche",
      action: "gib Schluesseln, Geldboerse und Kleinteilen drei feste Plaetze",
      place: "in getrennten Faechern statt ganz unten",
      cue: "Vor dem Gehen tastest du diese drei Punkte kurz ab",
      benefit: "der Check dauert Sekunden und senkt die Chance, Wichtiges zu vergessen",
      avoid: "Haenge keine Adresse an deinen Schluesselbund",
    },
    {
      short: "bolso",
      object: "bolso diario",
      action: "asigna tres lugares fijos: llaves, cartera y objetos pequenos",
      place: "en bolsillos separados, no en el fondo",
      cue: "Antes de salir toca esos tres puntos con la mano",
      benefit: "la revision dura segundos y reduce olvidos importantes",
      avoid: "No pongas tu direccion en el llavero",
    }),
  concept("police",
    {
      short: "посылки",
      object: "посылки у двери",
      action: "выберите одно место для доставки, которое видно вам, но не мешает проходу",
      place: "в инструкции доставки и в заметке для семьи",
      cue: "После уведомления забирайте коробку в ближайший удобный момент",
      benefit: "меньше коробок стоит на виду и меньше шансов споткнуться",
      avoid: "Не публикуйте фото посылки с адресной наклейкой",
    },
    {
      short: "Pakete",
      object: "Pakete an der Tuer",
      action: "waehle einen Ablageort, den du siehst und der den Weg nicht blockiert",
      place: "in der Lieferanweisung und in der Familiennotiz",
      cue: "Nach der Benachrichtigung holst du die Box beim naechsten passenden Moment",
      benefit: "weniger Kartons stehen sichtbar herum und niemand stolpert darueber",
      avoid: "Poste kein Paketfoto mit sichtbarem Adresslabel",
    },
    {
      short: "paquetes",
      object: "paquetes en la puerta",
      action: "elige un punto de entrega visible para ti y fuera del paso",
      place: "en la instruccion de entrega y en una nota familiar",
      cue: "Tras el aviso recoge la caja en el primer momento comodo",
      benefit: "hay menos cajas a la vista y menos riesgo de tropezar",
      avoid: "No publiques fotos del paquete con la etiqueta de direccion visible",
    }),
  concept("police",
    {
      short: "маршрут",
      object: "план поездки",
      action: "сохраните адрес, время и запасной контакт в одной заметке",
      place: "офлайн в телефоне и, при необходимости, на бумаге",
      cue: "Перед выходом проверьте батарею и доступ к карте",
      benefit: "если связь пропадет, базовые детали уже под рукой",
      avoid: "Не выкладывайте точный маршрут публично до возвращения",
    },
    {
      short: "Route",
      object: "Reiseplan",
      action: "speichere Adresse, Zeit und Ersatzkontakt in einer Notiz",
      place: "offline im Telefon und bei Bedarf auf Papier",
      cue: "Vor dem Losgehen pruefst du Akku und Kartenzugriff",
      benefit: "wenn Empfang fehlt, sind Grunddaten trotzdem griffbereit",
      avoid: "Veroeffentliche die genaue Route nicht oeffentlich vor der Rueckkehr",
    },
    {
      short: "ruta",
      object: "plan de viaje",
      action: "guarda direccion, hora y contacto alternativo en una nota",
      place: "sin conexion en el telefono y, si hace falta, en papel",
      cue: "Antes de salir revisa bateria y acceso al mapa",
      benefit: "si falla la senal, los datos basicos siguen a mano",
      avoid: "No publiques la ruta exacta antes de volver",
    }),
  concept("police",
    {
      short: "ключи",
      object: "запасные ключи",
      action: "подписывайте их нейтральным кодом, а расшифровку храните отдельно",
      place: "в домашней заметке без адресов и фамилий",
      cue: "Когда меняете связку, сразу обновляйте код",
      benefit: "ключ легче отличить, но он не подсказывает лишнего посторонним",
      avoid: "Не оставляйте ключи в очевидных местах у входа",
    },
    {
      short: "Schluessel",
      object: "Ersatzschluessel",
      action: "beschrifte sie mit neutralem Code und bewahre die Erklaerung getrennt auf",
      place: "in einer Haushaltsnotiz ohne Adressen und Nachnamen",
      cue: "Wenn ein Bund gewechselt wird, aktualisierst du den Code sofort",
      benefit: "der Schluessel ist unterscheidbar, verraet Fremden aber wenig",
      avoid: "Lege Schluessel nicht an offensichtliche Orte am Eingang",
    },
    {
      short: "llaves",
      object: "llaves de repuesto",
      action: "rotulalas con un codigo neutro y guarda la explicacion aparte",
      place: "en una nota de casa sin direcciones ni apellidos",
      cue: "Si cambias un llavero, actualiza el codigo al momento",
      benefit: "distingues la llave sin dar pistas de mas a desconocidos",
      avoid: "No dejes llaves en lugares obvios junto a la entrada",
    }),
  concept("police",
    {
      short: "велосипед",
      object: "велосипед или самокат",
      action: "сделайте фото общего вида и номера рамы, если он есть",
      place: "в папке транспорт вместе с датой покупки",
      cue: "После ремонта или замены деталей обновляйте кадр",
      benefit: "описать вещь проще, если она потеряется или ее нужно узнать",
      avoid: "Не показывайте публично место хранения и привычный график поездок",
    },
    {
      short: "Rad",
      object: "Fahrrad oder Scooter",
      action: "mache ein Foto vom ganzen Teil und, falls vorhanden, von der Rahmennummer",
      place: "im Ordner Verkehr mit Kaufdatum",
      cue: "Nach Reparatur oder Teilewechsel aktualisierst du das Foto",
      benefit: "Beschreibung wird leichter, falls etwas verloren geht oder erkannt werden muss",
      avoid: "Zeige Lagerort und gewohnte Fahrzeiten nicht oeffentlich",
    },
    {
      short: "bicicleta",
      object: "bicicleta o patinete",
      action: "toma foto general y del numero de cuadro si existe",
      place: "en la carpeta transporte con fecha de compra",
      cue: "Despues de reparar o cambiar piezas actualiza la imagen",
      benefit: "describir el objeto es mas facil si se pierde o hay que reconocerlo",
      avoid: "No muestres publicamente donde lo guardas ni tus horarios habituales",
    }),
  concept("police",
    {
      short: "потеряшки",
      object: "вещи, которые часто теряются",
      action: "заведите маленький лоток для находок: флешки, сережки, мелкие детали",
      place: "у входа или на полке, куда все смотрят",
      cue: "Раз в неделю возвращайте предметы владельцам или на постоянные места",
      benefit: "дом перестает создавать десять мини-розысков в день",
      avoid: "Не складывайте туда батарейки, острые предметы и чужие документы",
    },
    {
      short: "Fundschale",
      object: "Dinge, die oft verschwinden",
      action: "richte eine kleine Fundschale fuer USB-Sticks, Ohrringe und Kleinteile ein",
      place: "am Eingang oder auf einem Regal, das alle sehen",
      cue: "Einmal pro Woche gehen Dinge zu Besitzern oder an feste Plaetze zurueck",
      benefit: "das Zuhause erzeugt weniger kleine Suchaktionen pro Tag",
      avoid: "Lege dort keine Batterien, scharfen Dinge oder fremde Dokumente ab",
    },
    {
      short: "objetos perdidos",
      object: "cosas que se pierden seguido",
      action: "crea una bandeja de hallazgos para USB, pendientes y piezas pequenas",
      place: "en la entrada o una repisa que todos miren",
      cue: "Una vez por semana devuelve objetos a su dueno o lugar fijo",
      benefit: "la casa deja de crear diez busquedas pequenas al dia",
      avoid: "No pongas ahi pilas, objetos filosos ni documentos ajenos",
    }),

  concept("programmer",
    {
      short: "фото",
      object: "резервные копии фото",
      action: "раз в неделю проверяйте, что новые снимки попали в облако или на диск",
      place: "в заметке с датой последней успешной проверки",
      cue: "После важного события запускайте копирование вручную",
      benefit: "память телефона освобождается без страха потерять семейные кадры",
      avoid: "Не храните единственную копию только на одном устройстве",
    },
    {
      short: "Fotos",
      object: "Fotobackups",
      action: "pruefe einmal pro Woche, ob neue Bilder in Cloud oder auf Disk angekommen sind",
      place: "in einer Notiz mit Datum des letzten erfolgreichen Checks",
      cue: "Nach einem wichtigen Ereignis startest du die Kopie manuell",
      benefit: "Telefonspeicher wird frei, ohne Familienbilder zu riskieren",
      avoid: "Bewahre die einzige Kopie nicht nur auf einem Geraet auf",
    },
    {
      short: "fotos",
      object: "copias de seguridad de fotos",
      action: "una vez por semana revisa que las fotos nuevas llegaron a la nube o disco",
      place: "en una nota con fecha de la ultima revision correcta",
      cue: "Despues de un evento importante inicia la copia manualmente",
      benefit: "liberas memoria del telefono sin miedo a perder recuerdos",
      avoid: "No guardes la unica copia en un solo dispositivo",
    }),
  concept("programmer",
    {
      short: "пароли",
      object: "пароли и входы",
      action: "соберите список сервисов в менеджере паролей и проверьте, где включен второй фактор",
      place: "в защищенном приложении, а не в обычной заметке",
      cue: "После регистрации нового сервиса сразу добавляйте запись",
      benefit: "вы меньше зависите от памяти и повторяющихся паролей",
      avoid: "Не пересылайте пароли себе в чатах и письмах",
    },
    {
      short: "Passwoerter",
      object: "Passwoerter und Logins",
      action: "sammle Dienste im Passwortmanager und pruefe, wo ein zweiter Faktor aktiv ist",
      place: "in einer geschuetzten App statt in einer normalen Notiz",
      cue: "Nach jeder neuen Registrierung kommt der Eintrag sofort dazu",
      benefit: "du haengst weniger an Gedaechtnis und wiederholten Passwoertern",
      avoid: "Sende Passwoerter nicht an dich selbst in Chats oder Mails",
    },
    {
      short: "contrasenas",
      object: "contrasenas e inicios de sesion",
      action: "reune servicios en un gestor de contrasenas y revisa donde hay segundo factor",
      place: "en una app protegida, no en una nota normal",
      cue: "Despues de registrarte en un servicio nuevo agrega la entrada",
      benefit: "dependes menos de la memoria y de claves repetidas",
      avoid: "No te envies contrasenas por chats ni correos",
    }),
  concept("programmer",
    {
      short: "экран телефона",
      object: "главный экран телефона",
      action: "оставьте на первой странице только приложения ежедневного действия",
      place: "остальное спрячьте в поиск или папки по задачам",
      cue: "Если приложение не открывалось две недели, уберите его с первого экрана",
      benefit: "палец меньше попадает в случайные отвлечения",
      avoid: "Не удаляйте приложения, от которых зависят банки, работа или важные входы, без проверки",
    },
    {
      short: "Homescreen",
      object: "Startbildschirm des Telefons",
      action: "lasse auf der ersten Seite nur Apps fuer taegliche Aktionen",
      place: "alles andere kommt in Suche oder Aufgabenordner",
      cue: "Wenn eine App zwei Wochen nicht geoeffnet wurde, verschwindet sie von Seite eins",
      benefit: "der Finger landet seltener in zufaelligen Ablenkungen",
      avoid: "Loesche keine Apps fuer Bank, Arbeit oder wichtige Logins ohne Pruefung",
    },
    {
      short: "pantalla",
      object: "pantalla principal del telefono",
      action: "deja en la primera pagina solo apps de uso diario",
      place: "lo demas va a busqueda o carpetas por tarea",
      cue: "Si una app no se abrio en dos semanas, sale de la primera pantalla",
      benefit: "el dedo cae menos en distracciones al azar",
      avoid: "No borres apps de banco, trabajo o accesos importantes sin revisar",
    }),
  concept("programmer",
    {
      short: "почта",
      object: "рассылки и письма",
      action: "создайте папку разобрать и правило для неважных уведомлений",
      place: "в почте, а не в голове",
      cue: "Раз в неделю открывайте папку и отписывайтесь от одного лишнего источника",
      benefit: "входящие меньше похожи на шумный склад",
      avoid: "Не переходите по подозрительным ссылкам для отписки",
    },
    {
      short: "Mail",
      object: "Newsletter und Mails",
      action: "erstelle einen Ordner spaeter pruefen und eine Regel fuer unwichtige Hinweise",
      place: "im Mailprogramm statt im Kopf",
      cue: "Einmal pro Woche oeffnest du den Ordner und meldest eine unnoetige Quelle ab",
      benefit: "der Posteingang wirkt weniger wie ein lautes Lager",
      avoid: "Klicke keine verdaechtigen Abmeldelinks an",
    },
    {
      short: "correo",
      object: "boletines y correos",
      action: "crea una carpeta revisar y una regla para avisos poco importantes",
      place: "en el correo, no en la cabeza",
      cue: "Una vez por semana abre la carpeta y cancela una fuente innecesaria",
      benefit: "la bandeja de entrada parece menos un almacen ruidoso",
      avoid: "No abras enlaces sospechosos para darte de baja",
    }),
  concept("programmer",
    {
      short: "имена файлов",
      object: "названия файлов",
      action: "используйте порядок дата тема версия, например 2026-06 кухня список",
      place: "в папках документов, фото ремонта и семейных планов",
      cue: "Новый файл называйте сразу, пока контекст свежий",
      benefit: "поиск по дате и теме становится предсказуемым",
      avoid: "Не называйте важные файлы финал финал новый",
    },
    {
      short: "Dateinamen",
      object: "Dateinamen",
      action: "nutze die Reihenfolge Datum Thema Version, etwa 2026-06 Kueche Liste",
      place: "in Dokumentenordnern, Renovierungsfotos und Familienplaenen",
      cue: "Neue Dateien benennst du sofort, solange der Kontext frisch ist",
      benefit: "Suche nach Datum und Thema wird berechenbar",
      avoid: "Nenne wichtige Dateien nicht final final neu",
    },
    {
      short: "archivos",
      object: "nombres de archivos",
      action: "usa el orden fecha tema version, por ejemplo 2026-06 cocina lista",
      place: "en documentos, fotos de arreglos y planes familiares",
      cue: "Nombra cada archivo nuevo mientras el contexto esta fresco",
      benefit: "buscar por fecha y tema se vuelve predecible",
      avoid: "No llames a archivos importantes final final nuevo",
    }),
  concept("programmer",
    {
      short: "вкладки",
      object: "открытые вкладки браузера",
      action: "в конце дня сохраняйте нужные ссылки в список прочитать, а вкладки закрывайте",
      place: "в закладках или простой заметке по темам",
      cue: "Если ссылка не нужна для действия, не оставляйте ее открытой",
      benefit: "компьютер дышит легче, а работа начинается с чистого окна",
      avoid: "Не сохраняйте страницы с личными данными в общие закладки",
    },
    {
      short: "Tabs",
      object: "offene Browser-Tabs",
      action: "speichere abends wichtige Links in eine Lesen-Liste und schliesse Tabs",
      place: "in Lesezeichen oder einer einfachen Themen-Notiz",
      cue: "Wenn ein Link keine naechste Aktion hat, bleibt er nicht offen",
      benefit: "der Rechner atmet leichter und Arbeit startet mit einem klaren Fenster",
      avoid: "Speichere Seiten mit persoenlichen Daten nicht in gemeinsamen Lesezeichen",
    },
    {
      short: "pestanas",
      object: "pestanas abiertas del navegador",
      action: "al final del dia guarda enlaces utiles en una lista leer y cierra pestanas",
      place: "en marcadores o una nota simple por temas",
      cue: "Si un enlace no tiene proxima accion, no queda abierto",
      benefit: "el computador respira mejor y el trabajo empieza con ventana limpia",
      avoid: "No guardes paginas con datos personales en marcadores compartidos",
    }),

  concept("teacher",
    {
      short: "календарь",
      object: "семейный календарь",
      action: "выберите один цвет для каждого человека и один цвет для общих дел",
      place: "на стене или в общей цифровой версии",
      cue: "Новые события добавляйте сразу с временем выхода, а не только началом",
      benefit: "утром меньше сюрпризов, кто куда должен успеть",
      avoid: "Не перегружайте календарь задачами без конкретного дня",
    },
    {
      short: "Kalender",
      object: "Familienkalender",
      action: "waehle eine Farbe pro Person und eine fuer gemeinsame Termine",
      place: "an der Wand oder in einer geteilten digitalen Version",
      cue: "Neue Termine bekommen sofort auch die Losgehzeit, nicht nur den Beginn",
      benefit: "morgens gibt es weniger Ueberraschungen, wer wohin muss",
      avoid: "Ueberlade den Kalender nicht mit Aufgaben ohne konkreten Tag",
    },
    {
      short: "calendario",
      object: "calendario familiar",
      action: "elige un color por persona y otro para planes compartidos",
      place: "en la pared o en una version digital compartida",
      cue: "Los eventos nuevos llevan hora de salida, no solo hora de inicio",
      benefit: "por la manana hay menos sorpresas sobre quien debe llegar a donde",
      avoid: "No llenes el calendario con tareas sin dia concreto",
    }),
  concept("teacher",
    {
      short: "рюкзак",
      object: "рабочую или учебную сумку",
      action: "каждый вечер убирайте мусор, возвращайте документы и кладите одну нужную вещь на завтра",
      place: "у двери, а не посреди комнаты",
      cue: "Утром остается проверить воду, ключи и заряд",
      benefit: "выход становится короче, потому что поиск уже сделан вечером",
      avoid: "Не кладите тяжелые предметы, которые не нужны завтра",
    },
    {
      short: "Rucksack",
      object: "Arbeits- oder Schultasche",
      action: "raeume abends Muell raus, lege Dokumente zurueck und packe eine Sache fuer morgen",
      place: "an der Tuer statt mitten im Zimmer",
      cue: "Morgens bleiben nur Wasser, Schluessel und Akkucheck",
      benefit: "das Losgehen wird kuerzer, weil die Suche abends erledigt ist",
      avoid: "Packe keine schweren Dinge ein, die morgen nicht gebraucht werden",
    },
    {
      short: "mochila",
      object: "bolsa de trabajo o estudio",
      action: "cada noche saca basura, devuelve documentos y pon una cosa necesaria para manana",
      place: "junto a la puerta, no en medio del cuarto",
      cue: "Por la manana solo revisas agua, llaves y bateria",
      benefit: "salir toma menos porque la busqueda ya paso por la noche",
      avoid: "No cargues objetos pesados que no haran falta manana",
    }),
  concept("teacher",
    {
      short: "кабели",
      object: "кабели зарядки",
      action: "пометьте каждый кабель цветом или короткой биркой по устройству",
      place: "у розетки, где этот кабель живет",
      cue: "После поездки возвращайте кабель на его место до распаковки остального",
      benefit: "меньше споров, чей провод пропал, и меньше лишних покупок",
      avoid: "Не используйте поврежденные провода ради экономии",
    },
    {
      short: "Kabel",
      object: "Ladekabel",
      action: "markiere jedes Kabel mit Farbe oder kurzer Beschriftung nach Geraet",
      place: "an der Steckdose, wo dieses Kabel lebt",
      cue: "Nach einer Reise kommt das Kabel zurueck, bevor der Rest ausgepackt wird",
      benefit: "es gibt weniger Streit um verschwundene Kabel und weniger Ersatzkaeufe",
      avoid: "Nutze beschaedigte Kabel nicht aus Sparsamkeit",
    },
    {
      short: "cables",
      object: "cables de carga",
      action: "marca cada cable con color o etiqueta corta segun el dispositivo",
      place: "junto al enchufe donde vive ese cable",
      cue: "Tras un viaje devuelve el cable antes de desempacar lo demas",
      benefit: "hay menos discusiones por cables perdidos y menos compras extra",
      avoid: "No uses cables danados por ahorrar",
    }),
  concept("teacher",
    {
      short: "книги",
      object: "книги и чтение",
      action: "держите маленькую корзину сейчас читаем вместо стопки по всему дому",
      place: "рядом с диваном или кроватью",
      cue: "Когда книга дочитана, сразу возвращайте ее на полку или в библиотеку",
      benefit: "читать проще, когда текущий выбор виден и не тонет в вещах",
      avoid: "Не ставьте тяжелую стопку на край кровати или высокую полку",
    },
    {
      short: "Buecher",
      object: "Buecher und Lesen",
      action: "nutze einen kleinen Korb aktuell lesen statt Stapel ueberall",
      place: "neben Sofa oder Bett",
      cue: "Wenn ein Buch fertig ist, geht es sofort ins Regal oder zur Bibliothek",
      benefit: "Lesen faellt leichter, wenn die aktuelle Auswahl sichtbar bleibt",
      avoid: "Stelle schwere Stapel nicht an Bettkanten oder hohe Regale",
    },
    {
      short: "libros",
      object: "libros y lectura",
      action: "usa una cesta pequena leyendo ahora en vez de pilas por toda la casa",
      place: "junto al sofa o la cama",
      cue: "Al terminar un libro vuelve a la repisa o biblioteca",
      benefit: "leer es mas facil cuando la opcion actual esta visible",
      avoid: "No pongas pilas pesadas al borde de la cama o en repisas altas",
    }),
  concept("teacher",
    {
      short: "вечерний сброс",
      object: "вечерний сброс комнаты",
      action: "ставьте таймер на две минуты и возвращайте только вещи без постоянного места",
      place: "в одну корзину, которую потом разбирают по зонам",
      cue: "Остановитесь, когда таймер прозвенел, даже если не все идеально",
      benefit: "привычка не пугает масштабом и легче повторяется завтра",
      avoid: "Не начинайте поздно шумную уборку, если она мешает другим",
    },
    {
      short: "Abendreset",
      object: "Abendreset im Zimmer",
      action: "stelle zwei Minuten Timer und sammle nur Dinge ohne festen Platz",
      place: "in einen Korb, der spaeter nach Zonen sortiert wird",
      cue: "Hoere auf, wenn der Timer klingelt, auch wenn nicht alles perfekt ist",
      benefit: "die Gewohnheit wirkt nicht gross und wiederholt sich morgen leichter",
      avoid: "Starte spaet keine laute Aufraeumaktion, wenn sie andere stoert",
    },
    {
      short: "reset nocturno",
      object: "reset nocturno del cuarto",
      action: "pon temporizador de dos minutos y devuelve solo cosas sin lugar fijo",
      place: "en una cesta que luego se separa por zonas",
      cue: "Para cuando suene, aunque no quede perfecto",
      benefit: "el habito no asusta y se repite mas facil manana",
      avoid: "No empieces limpieza ruidosa tarde si molesta a otros",
    }),
  concept("teacher",
    {
      short: "один вошел",
      object: "новые вещи в доме",
      action: "когда появляется новая мелочь, выберите одну старую для отдачи, ремонта или выброса",
      place: "в коробке решения у шкафа",
      cue: "Разбирайте коробку в один и тот же день недели",
      benefit: "дом растет медленнее, а выбор не превращается в большой марафон",
      avoid: "Не выбрасывайте чужие вещи без согласия",
    },
    {
      short: "Eins rein",
      object: "neue Dinge im Zuhause",
      action: "wenn etwas Neues kommt, waehle ein altes Teil fuer Spende, Reparatur oder Muell",
      place: "in einer Entscheidungsbox am Schrank",
      cue: "Die Box wird immer am selben Wochentag geleert",
      benefit: "das Zuhause waechst langsamer und Aussortieren wird kein Marathon",
      avoid: "Wirf keine fremden Dinge ohne Zustimmung weg",
    },
    {
      short: "uno entra",
      object: "cosas nuevas en casa",
      action: "cuando llega algo nuevo, elige una cosa vieja para donar, reparar o tirar",
      place: "en una caja de decision junto al armario",
      cue: "Revisa la caja el mismo dia de cada semana",
      benefit: "la casa crece mas lento y ordenar no se vuelve maraton",
      avoid: "No tires cosas ajenas sin permiso",
    }),
];

function concept(profession, ru, de, es) {
  return { profession, ru, de, es };
}

function clean(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function capFirst(s) {
  const text = clean(s);
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function sentenceCaseAfterPeriods(text) {
  return clean(text).replace(/(^|[.!?]\s+)([a-zа-яё])/giu, (_match, prefix, char) => `${prefix}${char.toUpperCase()}`);
}

function truncateTitle(title, max = 42) {
  let s = capFirst(title).replace(/[.!…]+$/u, "");
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > 18 ? cut.slice(0, sp) : cut).trim();
}

function key(text) {
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${s.length}`;
}

function candidatesFor(locale, profession) {
  const out = [];
  for (const c of concepts.filter((it) => it.profession === profession)) {
    const localized = c[locale];
    for (let variant = 0; variant < TEXT_PATTERNS[locale].length; variant += 1) {
      let text = sentenceCaseAfterPeriods(TEXT_PATTERNS[locale][variant](localized));
      if (text.length < 300) text = `${text} ${FILLER[locale]}`;
      for (const extra of EXTRA_CHECKS[locale]) {
        out.push({
          title: truncateTitle(TITLE_PATTERNS[locale][variant](localized.short)),
          text: sentenceCaseAfterPeriods(`${text} ${extra}`),
          profession,
        });
      }
    }
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

function writeJson(path, value, pretty = false) {
  writeFileSync(resolve(ROOT, path), JSON.stringify(value, null, pretty ? 2 : 0));
}

function validateGenerated(deck, cards, index) {
  const allowedKeys = ["chars", "id", "pack", "profession", "text", "title"].sort().join(",");
  const seen = new Set();
  const byProfession = Object.fromEntries(PROFS.map((p) => [p, 0]));
  const lengths = [];

  if (!Array.isArray(cards)) throw new Error(`${deck.id}: titled.json must be an array`);
  if (cards.length < TARGET) throw new Error(`${deck.id}: expected at least ${TARGET}, got ${cards.length}`);

  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const keys = Object.keys(card).sort().join(",");
    if (keys !== allowedKeys) throw new Error(`${deck.id}: card ${i + 1} has unexpected keys: ${keys}`);
    if (card.id !== i + 1) throw new Error(`${deck.id}: bad id at ${i + 1}`);
    if (card.pack !== Math.floor(i / PACK_SIZE) + 1) throw new Error(`${deck.id}: bad pack at ${i + 1}`);
    if (!PROFS.includes(card.profession)) throw new Error(`${deck.id}: bad profession ${card.profession}`);
    if (!card.title || typeof card.title !== "string") throw new Error(`${deck.id}: missing title at ${i + 1}`);
    if (!card.text || typeof card.text !== "string") throw new Error(`${deck.id}: missing text at ${i + 1}`);
    if (card.chars !== card.text.length) throw new Error(`${deck.id}: bad chars at ${i + 1}`);
    if (card.text.length < deck.min || card.text.length > deck.max) {
      throw new Error(`${deck.id}: length ${card.text.length} out of range at ${i + 1}: ${card.title}`);
    }
    const k = key(card.text);
    if (seen.has(k)) throw new Error(`${deck.id}: duplicate text at ${i + 1}`);
    seen.add(k);
    byProfession[card.profession] += 1;
    lengths.push(card.text.length);
  }

  const range = [Math.min(...lengths), Math.max(...lengths)];
  const expectedIndex = {
    total: cards.length,
    packs: Math.max(1, Math.ceil(cards.length / PACK_SIZE)),
    packSize: PACK_SIZE,
    range,
    byProfession,
  };
  if (JSON.stringify(index) !== JSON.stringify(expectedIndex)) {
    throw new Error(`${deck.id}: index.json does not match titled.json`);
  }
  if (deck.locale === "ru" && !cards.every((card) => /[А-Яа-яЁё]/u.test(card.text))) {
    throw new Error(`${deck.id}: Russian deck contains non-Russian-looking text`);
  }
  if (deck.locale !== "ru" && cards.some((card) => /[А-Яа-яЁё]/u.test(card.text))) {
    throw new Error(`${deck.id}: non-Russian deck contains Cyrillic`);
  }
  if (cards.some((card) => /chaplin|moustache|mustache|schnurrbart|bigote|усы/i.test(`${card.title} ${card.text}`))) {
    throw new Error(`${deck.id}: moustache/variant wording leaked into card text`);
  }
}

function rebuild(deck) {
  const titledPath = `${deck.dir}/titled.json`;
  const indexPath = `${deck.dir}/index.json`;
  const existing = readJson(titledPath).slice(0, SOURCE_SEED_COUNT);
  const seenText = new Set(existing.map((card) => key(clean(card.text))));
  const counts = Object.fromEntries(PROFS.map((p) => [p, 0]));

  const cards = existing.map((card) => {
    const profession = clean(card.profession).toLowerCase();
    if (!PROFS.includes(profession)) throw new Error(`${deck.id}: bad existing profession ${card.profession}`);
    counts[profession] += 1;
    return {
      id: 0,
      pack: 0,
      text: clean(card.text),
      chars: clean(card.text).length,
      title: truncateTitle(card.title),
      profession,
    };
  });

  const targetByProfession = Object.fromEntries(PROFS.map((p) => [p, Math.floor(TARGET / PROFS.length)]));
  const queues = Object.fromEntries(PROFS.map((p) => [p, candidatesFor(deck.locale, p)]));

  while (cards.length < TARGET && PROFS.some((p) => counts[p] < targetByProfession[p])) {
    let progressed = false;
    for (const profession of PROFS) {
      if (cards.length >= TARGET) break;
      if (counts[profession] >= targetByProfession[profession]) continue;
      const queue = queues[profession];
      while (queue.length > 0) {
        const candidate = queue.shift();
        const k = key(candidate.text);
        if (seenText.has(k)) continue;
        seenText.add(k);
        counts[profession] += 1;
        cards.push({
          id: 0,
          pack: 0,
          text: candidate.text,
          chars: candidate.text.length,
          title: candidate.title,
          profession,
        });
        progressed = true;
        break;
      }
    }
    if (!progressed) throw new Error(`${deck.id}: not enough generated candidates`);
  }

  cards.forEach((card, index) => {
    card.id = index + 1;
    card.pack = Math.floor(index / PACK_SIZE) + 1;
    card.chars = card.text.length;
  });

  const lengths = cards.map((card) => card.text.length);
  const byProfession = Object.fromEntries(PROFS.map((p) => [p, cards.filter((card) => card.profession === p).length]));
  const index = {
    total: cards.length,
    packs: Math.max(1, Math.ceil(cards.length / PACK_SIZE)),
    packSize: PACK_SIZE,
    range: [Math.min(...lengths), Math.max(...lengths)],
    byProfession,
  };

  validateGenerated(deck, cards, index);
  writeJson(titledPath, cards, false);
  writeJson(indexPath, index, true);
  return { id: deck.id, total: cards.length, byProfession };
}

const summary = DECKS.map(rebuild);
for (const item of summary) {
  console.log(`${item.id}: ${item.total} cards`);
}
