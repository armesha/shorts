#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
Source / safety ledger:
- These are deterministic localized lifehack cards prepared in-repo from generic household
  organization, storage, routine, and digital-hygiene concepts.
- No web text is copied into the generated cards.
- Excluded topics: medical treatment, legal/tax advice, electrical/gas/plumbing repair,
  fire handling, chemical mixing, weapons, lock bypassing, surveillance, and anything that
  requires a licensed professional.
- The profession field is only a visual background selector used by the lifehack renderer.
*/

const ROOT = process.cwd();
const PACK_SIZE = 300;
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

const locales = {
  en: {
    id: "tips-en",
    titlePrefix: ["fixed place", "weekly check", "visible cue"],
    lenses: {
      accountant: "Make it measurable: write the date, amount, or count while the task is fresh",
      builder: "Clear the physical path first so the rule is easy to follow",
      chef: "Put the food or kitchen item where it will be seen before it is forgotten",
      firefighter: "Keep heat, clutter, and blocked exits out of the setup",
      hairdresser: "Make the visual cue obvious enough to notice while moving quickly",
      lawyer: "Leave a small paper trail so you can understand the decision later",
      mechanic: "Check the simple wear signs before the problem becomes expensive",
      police: "Use one handoff point so shared items do not become a search mission",
      programmer: "Make the reminder searchable and keep private data out of plain notes",
      teacher: "Turn the rule into one sentence everyone at home can repeat",
    },
    patterns: [
      (c) => `A simple rule helps here: ${c.action}. Keep the reminder ${c.place}. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
      (c) => `Use a weekly five-minute check: ${c.action}. Then look at ${c.place}. ${c.cue}. ${c.benefit}. Keep it small and repeatable. ${c.avoid}.`,
      (c) => `Make it visible before it becomes urgent: ${c.action}. Put the cue ${c.place}. ${c.cue}. ${c.benefit}. One note, label, or box is enough to start. ${c.avoid}.`,
    ],
    topics: [
      t("Subscriptions", "write the service name, billing date, and amount in one list", "next to your banking app or budget sheet", "Add a row immediately after every signup", "you can spot forgotten charges before the next bill", "Do not store passwords, codes, or full card numbers there"),
      t("Pantry", "keep the items that expire first in the front row", "on one shelf label that says use first", "Check that row before opening a new pack", "good food gets used before it disappears behind newer boxes", "Do not keep open food without a date or closed container"),
      t("Documents", "keep a short note that says where each original and copy lives", "in a protected folder and a simple paper index", "Update only the changed line after a trip or renewal", "searching becomes calmer when one paper is needed quickly", "Do not send scans through shared chats unless private data is hidden"),
      t("Cables", "choose one charging place and remove old adapters from sockets", "on a clear surface away from paper and fabric", "Before sleep, check that no cable is pinched by furniture", "there is less heat, clutter, and last-minute searching", "Do not use cracked cables or anything that becomes hot"),
      t("Laundry", "hang a mesh bag on the laundry basket for socks and delicate pieces", "on a hook or inside the basket", "Close the bag before each wash and check pockets", "small items stop vanishing between sorting and drying", "Do not overfill the bag because fabric still needs room to rinse"),
      t("Receipts", "put paper receipts in one envelope and tag digital receipts the same way", "in an entry drawer or mail folder", "At the end of the week, keep only what matters for returns or warranty", "small purchases stop spreading across bags and pockets", "Do not photograph documents beside unnecessary personal data"),
      t("Leftovers", "make one fridge shelf the use-soon shelf", "at eye level with a small label", "Start cooking by looking there first", "leftovers become dinner instead of a forgotten container", "Do not leave cooked food sitting out longer than is safe"),
      t("Cleaning kit", "give each cloth color one job and keep the list with the cloths", "inside the cleaning box lid", "Replace or wash the cloths before the next task", "surfaces stay cleaner because bathroom, kitchen, and dust cloths do not mix", "Do not mix cleaning products or invent stronger blends"),
      t("Calendar", "add the leaving time, not only the appointment time", "in the same calendar entry", "Include travel, shoes, bag, and a small buffer", "the morning plan becomes a route instead of a surprise", "Do not put private access codes in shared calendar notes"),
      t("Passwords", "use a password manager and give every important account a unique password", "in the manager, not in a note called passwords", "Turn on multi-factor protection where it is available", "one leaked password is less likely to open everything else", "Do not reuse recovery codes or keep them in screenshots"),
    ],
  },
  it: {
    id: "tips-it",
    titlePrefix: ["posto fisso", "controllo settimanale", "promemoria visibile"],
    lenses: {
      accountant: "Rendilo misurabile: scrivi data, importo o quantita mentre il compito e fresco",
      builder: "Libera prima il percorso fisico, cosi la regola e facile da seguire",
      chef: "Metti il cibo o l'oggetto da cucina dove si vede prima di dimenticarlo",
      firefighter: "Tieni lontani calore, disordine e uscite bloccate dalla soluzione",
      hairdresser: "Rendi il segnale visivo chiaro anche quando ti muovi di fretta",
      lawyer: "Lascia una piccola traccia scritta per capire la decisione piu tardi",
      mechanic: "Controlla i segni semplici di usura prima che il problema costi caro",
      police: "Usa un solo punto di passaggio per non trasformare gli oggetti condivisi in una ricerca",
      programmer: "Rendi il promemoria cercabile e tieni i dati privati fuori dalle note aperte",
      teacher: "Trasforma la regola in una frase che tutti in casa possono ripetere",
    },
    patterns: [
      (c) => `Una regola semplice aiuta: ${c.action}. Tieni il promemoria ${c.place}. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
      (c) => `Usa un controllo di cinque minuti a settimana: ${c.action}. Poi guarda ${c.place}. ${c.cue}. ${c.benefit}. Tienilo piccolo e ripetibile. ${c.avoid}.`,
      (c) => `Rendilo visibile prima che diventi urgente: ${c.action}. Metti il segnale ${c.place}. ${c.cue}. ${c.benefit}. Per iniziare basta una nota, un'etichetta o una scatola. ${c.avoid}.`,
    ],
    topics: [
      t("Abbonamenti", "scrivi nome del servizio, data di addebito e importo in un solo elenco", "accanto all'app della banca o al foglio del budget", "Aggiungi una riga subito dopo ogni iscrizione", "noti gli addebiti dimenticati prima della fattura successiva", "Non salvare li password, codici o numeri completi di carta"),
      t("Dispensa", "metti davanti gli alimenti che scadono prima", "su una mensola con etichetta usa prima", "Controlla quella fila prima di aprire una confezione nuova", "il cibo buono viene usato prima di sparire dietro alle scatole nuove", "Non tenere cibo aperto senza data o contenitore chiuso"),
      t("Documenti", "tieni una nota breve con il posto di originali e copie", "in una cartella protetta e in un indice di carta semplice", "Aggiorna solo la riga cambiata dopo un viaggio o rinnovo", "la ricerca e piu calma quando serve un foglio preciso", "Non inviare scansioni in chat condivise se i dati privati non sono coperti"),
      t("Cavi", "scegli un punto di ricarica e togli i vecchi adattatori dalle prese", "su una superficie libera lontana da carta e tessuti", "Prima di dormire controlla che nessun cavo sia schiacciato dai mobili", "ci sono meno calore, disordine e ricerche all'ultimo minuto", "Non usare cavi rotti o oggetti che diventano caldi"),
      t("Bucato", "appendi un sacchetto a rete al cesto per calzini e capi delicati", "a un gancio o dentro il cesto", "Chiudi il sacchetto prima del lavaggio e controlla le tasche", "i piccoli pezzi smettono di sparire tra smistamento e asciugatura", "Non riempire troppo il sacchetto: il tessuto deve risciacquarsi"),
      t("Scontrini", "metti gli scontrini di carta in una busta e usa lo stesso tag per quelli digitali", "in un cassetto all'ingresso o in una cartella email", "A fine settimana tieni solo cio che serve per resi o garanzia", "le piccole spese non restano sparse in borse e tasche", "Non fotografare documenti vicino a dati personali inutili"),
      t("Avanzi", "dedica un ripiano del frigo alle cose da consumare presto", "all'altezza degli occhi con una piccola etichetta", "Inizia a cucinare guardando prima li", "gli avanzi diventano cena invece di un contenitore dimenticato", "Non lasciare cibo cotto fuori piu a lungo del sicuro"),
      t("Pulizia", "assegna a ogni colore di panno un solo uso e tieni la lista con i panni", "dentro il coperchio della scatola pulizie", "Lava o cambia i panni prima del compito successivo", "le superfici restano piu pulite perche bagno, cucina e polvere non si mischiano", "Non mischiare detergenti e non creare miscele piu forti"),
      t("Calendario", "aggiungi l'orario di partenza, non solo quello dell'appuntamento", "nella stessa voce del calendario", "Includi viaggio, scarpe, borsa e un piccolo margine", "la mattina diventa un percorso invece di una sorpresa", "Non mettere codici privati in note di calendario condivise"),
      t("Password", "usa un gestore password e assegna a ogni account importante una password unica", "nel gestore, non in una nota chiamata password", "Attiva la protezione a piu fattori quando disponibile", "una password rubata apre meno porte", "Non riutilizzare codici di recupero e non tenerli negli screenshot"),
    ],
  },
  fr: {
    id: "tips-fr",
    titlePrefix: ["place fixe", "verification hebdo", "repere visible"],
    lenses: {
      accountant: "Rends-le mesurable: note la date, le montant ou le nombre pendant que c'est frais",
      builder: "Degage d'abord le chemin physique pour que la regle soit facile a suivre",
      chef: "Place l'aliment ou l'objet de cuisine la ou il sera vu avant d'etre oublie",
      firefighter: "Garde chaleur, encombrement et sorties bloquees hors du dispositif",
      hairdresser: "Rends le repere visuel assez clair pour le voir meme en vitesse",
      lawyer: "Laisse une petite trace ecrite pour comprendre la decision plus tard",
      mechanic: "Verifie les signes simples d'usure avant que le probleme coute cher",
      police: "Utilise un seul point de passage pour que les objets partages ne deviennent pas une recherche",
      programmer: "Rends le rappel cherchable et garde les donnees privees hors des notes ouvertes",
      teacher: "Transforme la regle en une phrase que tout le monde a la maison peut repeter",
    },
    patterns: [
      (c) => `Une regle simple aide beaucoup: ${c.action}. Garde le rappel ${c.place}. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
      (c) => `Fais une verification de cinq minutes chaque semaine: ${c.action}. Regarde ensuite ${c.place}. ${c.cue}. ${c.benefit}. Garde le systeme petit et repetable. ${c.avoid}.`,
      (c) => `Rends-le visible avant que ce soit urgent: ${c.action}. Place le repere ${c.place}. ${c.cue}. ${c.benefit}. Une note, une etiquette ou une boite suffit pour commencer. ${c.avoid}.`,
    ],
    topics: [
      t("Abonnements", "note le nom du service, la date de prelevement et le montant dans une seule liste", "pres de l'application bancaire ou du tableau de budget", "Ajoute une ligne juste apres chaque inscription", "tu reperes les frais oublies avant le prochain paiement", "Ne garde pas de mots de passe, codes ou numeros complets de carte a cet endroit"),
      t("Placard", "mets devant les aliments qui expirent en premier", "sur une etagere marquee a utiliser d'abord", "Regarde cette rangee avant d'ouvrir un nouveau paquet", "les bons produits sont utilises avant de disparaitre derriere les boites neuves", "Ne garde pas d'aliment ouvert sans date ou contenant ferme"),
      t("Documents", "tiens une note courte indiquant ou sont les originaux et les copies", "dans un dossier protege et un index papier simple", "Apres un voyage ou un renouvellement, modifie seulement la ligne concernee", "la recherche est plus calme quand il faut un papier precis", "N'envoie pas de scans en discussion partagee sans masquer les donnees privees"),
      t("Cables", "choisis un seul coin de charge et retire les vieux adaptateurs des prises", "sur une surface degagee loin du papier et du tissu", "Avant de dormir, verifie qu'aucun cable n'est coince par un meuble", "il y a moins de chaleur, moins de fouillis et moins de recherches", "N'utilise pas de cables abimes ou d'objets qui chauffent"),
      t("Linge", "accroche un filet au panier pour les chaussettes et les pieces delicates", "sur un crochet ou a l'interieur du panier", "Ferme le filet avant chaque lavage et verifie les poches", "les petits objets cessent de disparaitre entre le tri et le sechage", "Ne remplis pas trop le filet: le tissu doit encore se rincer"),
      t("Recus", "mets les recus papier dans une enveloppe et donne le meme tag aux recus numeriques", "dans un tiroir d'entree ou un dossier mail", "En fin de semaine, garde seulement ce qui sert aux retours ou garanties", "les petites depenses ne se dispersent plus dans les sacs et poches", "Ne photographie pas de documents avec des donnees personnelles inutiles autour"),
      t("Restes", "reserve une etagere du frigo aux aliments a finir bientot", "a hauteur des yeux avec une petite etiquette", "Commence a cuisiner en regardant d'abord cet endroit", "les restes deviennent un repas au lieu d'un contenant oublie", "Ne laisse pas les plats cuits dehors plus longtemps que ce qui est sur"),
      t("Menage", "donne un usage a chaque couleur de chiffon et garde la liste avec eux", "dans le couvercle de la boite de menage", "Lave ou remplace les chiffons avant la tache suivante", "les surfaces restent plus propres car salle de bain, cuisine et poussiere ne se melangent pas", "Ne melange pas les produits et n'invente pas de formule plus forte"),
      t("Calendrier", "ajoute l'heure de depart, pas seulement l'heure du rendez-vous", "dans la meme entree de calendrier", "Compte le trajet, les chaussures, le sac et une petite marge", "le matin devient un itineraire au lieu d'une surprise", "Ne mets pas de codes prives dans des notes de calendrier partagees"),
      t("Mots de passe", "utilise un gestionnaire et donne un mot de passe unique a chaque compte important", "dans le gestionnaire, pas dans une note appelee mots de passe", "Active la protection multifactorielle quand elle existe", "un mot de passe vole ouvre moins de comptes", "Ne reutilise pas les codes de secours et ne les garde pas en capture d'ecran"),
    ],
  },
  pt: {
    id: "tips-pt",
    titlePrefix: ["lugar fixo", "checagem semanal", "lembrete visivel"],
    lenses: {
      accountant: "Torne mensuravel: anote data, valor ou quantidade enquanto a tarefa esta fresca",
      builder: "Limpe primeiro o caminho fisico para a regra ficar facil de seguir",
      chef: "Coloque a comida ou item de cozinha onde sera visto antes de ser esquecido",
      firefighter: "Mantenha calor, bagunca e saidas bloqueadas fora da solucao",
      hairdresser: "Deixe o sinal visual claro o bastante para notar mesmo com pressa",
      lawyer: "Deixe um pequeno registro escrito para entender a decisao depois",
      mechanic: "Confira sinais simples de desgaste antes que o problema fique caro",
      police: "Use um unico ponto de entrega para itens compartilhados nao virarem busca",
      programmer: "Deixe o lembrete pesquisavel e mantenha dados privados fora de notas abertas",
      teacher: "Transforme a regra em uma frase que todos em casa conseguem repetir",
    },
    patterns: [
      (c) => `Uma regra simples ajuda: ${c.action}. Mantenha o lembrete ${c.place}. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
      (c) => `Use uma checagem semanal de cinco minutos: ${c.action}. Depois olhe ${c.place}. ${c.cue}. ${c.benefit}. Mantenha tudo pequeno e repetivel. ${c.avoid}.`,
      (c) => `Deixe visivel antes de virar urgencia: ${c.action}. Coloque o sinal ${c.place}. ${c.cue}. ${c.benefit}. Uma nota, etiqueta ou caixa ja basta para começar. ${c.avoid}.`,
    ],
    topics: [
      t("Assinaturas", "anote nome do servico, data de cobranca e valor em uma lista unica", "perto do app do banco ou da planilha de orçamento", "Adicione uma linha logo apos cada cadastro", "voce percebe cobrancas esquecidas antes da proxima fatura", "Nao guarde ali senhas, codigos ou numeros completos de cartao"),
      t("Despensa", "deixe na frente os itens que vencem primeiro", "em uma prateleira marcada usar primeiro", "Confira essa fila antes de abrir uma embalagem nova", "comida boa e usada antes de sumir atras de caixas novas", "Nao deixe comida aberta sem data ou pote fechado"),
      t("Documentos", "mantenha uma nota curta dizendo onde ficam originais e copias", "em uma pasta protegida e em um indice de papel simples", "Depois de viagem ou renovacao, atualize apenas a linha alterada", "a busca fica mais tranquila quando um papel especifico e necessario", "Nao envie scans em chats compartilhados sem ocultar dados privados"),
      t("Cabos", "escolha um ponto de carregamento e tire adaptadores antigos das tomadas", "em uma superficie limpa longe de papel e tecido", "Antes de dormir, veja se nenhum cabo esta preso nos moveis", "ha menos calor, bagunca e procura de ultima hora", "Nao use cabos rachados ou qualquer item que esquente"),
      t("Lavanderia", "pendure um saquinho de rede no cesto para meias e pecas delicadas", "em um gancho ou dentro do cesto", "Feche o saco antes da lavagem e confira os bolsos", "pecas pequenas param de sumir entre separar e secar", "Nao encha demais o saco: o tecido ainda precisa enxaguar"),
      t("Recibos", "coloque recibos de papel em um envelope e marque os digitais com a mesma etiqueta", "em uma gaveta da entrada ou pasta de email", "No fim da semana, guarde apenas o que serve para troca ou garantia", "pequenas compras deixam de se espalhar por bolsas e bolsos", "Nao fotografe documentos perto de dados pessoais desnecessarios"),
      t("Sobras", "reserve uma prateleira da geladeira para o que precisa ser usado logo", "na altura dos olhos com uma pequena etiqueta", "Comece a cozinhar olhando esse ponto primeiro", "sobras viram refeicao em vez de pote esquecido", "Nao deixe comida cozida fora por mais tempo do que e seguro"),
      t("Limpeza", "de a cada cor de pano uma funcao e guarde a lista com os panos", "dentro da tampa da caixa de limpeza", "Lave ou troque os panos antes da proxima tarefa", "as superficies ficam mais limpas porque banheiro, cozinha e po nao se misturam", "Nao misture produtos de limpeza nem invente combinacoes mais fortes"),
      t("Calendario", "adicione o horario de sair, nao so o horario do compromisso", "no mesmo evento do calendario", "Inclua trajeto, sapatos, bolsa e uma pequena folga", "a manha vira uma rota em vez de surpresa", "Nao coloque codigos privados em notas de calendario compartilhadas"),
      t("Senhas", "use um gerenciador e de uma senha unica a cada conta importante", "no gerenciador, nao em uma nota chamada senhas", "Ative protecao multifator quando existir", "uma senha vazada tem menos chance de abrir todo o resto", "Nao reutilize codigos de recuperacao nem os guarde em screenshots"),
    ],
  },
  hi: {
    id: "tips-hi",
    titlePrefix: ["एक जगह", "साप्ताहिक जांच", "दिखने वाला संकेत"],
    lenses: {
      accountant: "इसे मापने लायक बनाएं: काम ताजा हो तभी तारीख, रकम या संख्या लिखें",
      builder: "पहले रास्ता साफ करें ताकि नियम अपनाना आसान रहे",
      chef: "खाने या रसोई की चीज को ऐसी जगह रखें जहां भूलने से पहले दिखे",
      firefighter: "गर्मी, भीड़ और बंद रास्तों को इस व्यवस्था से दूर रखें",
      hairdresser: "संकेत इतना साफ रखें कि जल्दी में भी नजर आ जाए",
      lawyer: "बाद में फैसला समझने के लिए छोटी लिखित निशानी छोड़ें",
      mechanic: "समस्या महंगी बनने से पहले आसान घिसावट संकेत जांचें",
      police: "साझा चीजों के लिए एक ही सौंपने की जगह रखें ताकि खोज न बने",
      programmer: "याद दिलाने वाली बात खोजने योग्य रखें और निजी डेटा खुली नोट में न रखें",
      teacher: "नियम को एक ऐसे वाक्य में बदलें जिसे घर में सब दोहरा सकें",
    },
    patterns: [
      (c) => `एक आसान नियम मदद करता है: ${c.action}. याद दिलाने वाली बात ${c.place} रखें. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
      (c) => `हर हफ्ते पांच मिनट की छोटी जांच रखें: ${c.action}. फिर ${c.place} देखें. ${c.cue}. ${c.benefit}. इसे छोटा और दोहराने लायक रखें. ${c.avoid}.`,
      (c) => `बात जरूरी बनने से पहले उसे दिखने लायक बनाएं: ${c.action}. संकेत ${c.place} रखें. ${c.cue}. ${c.benefit}. शुरू करने के लिए एक नोट, लेबल या डिब्बा काफी है. ${c.avoid}.`,
    ],
    topics: [
      t("सब्सक्रिप्शन", "सेवा का नाम, बिल की तारीख और रकम एक ही सूची में लिखें", "बैंक ऐप या बजट शीट के पास", "हर नए साइनअप के तुरंत बाद एक पंक्ति जोड़ें", "अगले बिल से पहले भूले हुए खर्च दिख जाते हैं", "वहां पासवर्ड, कोड या पूरे कार्ड नंबर न रखें"),
      t("रसोई शेल्फ", "जो सामान पहले खत्म या एक्सपायर होना है उसे आगे रखें", "एक छोटे लेबल वाली शेल्फ पर", "नई पैकिंग खोलने से पहले उसी पंक्ति को देखें", "अच्छा खाना नई चीजों के पीछे छिपकर खराब नहीं होता", "खुला खाना तारीख या बंद डिब्बे के बिना न रखें"),
      t("दस्तावेज", "असली कागज और कॉपी कहां हैं, इसकी छोटी सूची रखें", "सुरक्षित फोल्डर और सादे कागज की सूची में", "यात्रा या नवीनीकरण के बाद केवल बदली हुई लाइन अपडेट करें", "जरूरी कागज खोजते समय घबराहट कम होती है", "निजी जानकारी छिपाए बिना स्कैन साझा चैट में न भेजें"),
      t("केबल", "चार्जिंग की एक जगह तय करें और पुराने एडैप्टर सॉकेट से निकालें", "कागज और कपड़े से दूर साफ सतह पर", "सोने से पहले देखें कि कोई केबल फर्नीचर में दबा तो नहीं", "गर्मी, उलझन और आखिरी मिनट की खोज कम होती है", "टूटी केबल या गरम होने वाली चीज का उपयोग न करें"),
      t("लॉन्ड्री", "मोजों और नाजुक कपड़ों के लिए कपड़े की जाली वाला बैग टांगें", "हुक पर या टोकरी के अंदर", "धुलाई से पहले बैग बंद करें और जेबें जांचें", "छोटी चीजें छंटाई और सुखाने के बीच गायब नहीं होतीं", "बैग को बहुत न भरें, कपड़े को धुलने की जगह चाहिए"),
      t("रसीदें", "कागजी रसीदें एक लिफाफे में रखें और डिजिटल रसीदों को एक जैसा टैग दें", "दरवाजे के पास दराज या ईमेल फोल्डर में", "हफ्ते के अंत में केवल वापसी या वारंटी वाली रसीद रखें", "छोटे खर्च बैग और जेबों में बिखरते नहीं", "दस्तावेज की फोटो में बेकार निजी जानकारी साथ न आने दें"),
      t("बचा खाना", "फ्रिज में जल्दी इस्तेमाल वाली चीजों के लिए एक शेल्फ तय करें", "आंखों की ऊंचाई पर छोटे लेबल के साथ", "खाना बनाने से पहले उसी जगह को देखें", "बचा खाना भूले हुए डिब्बे की जगह अगले भोजन में बदलता है", "पका खाना सुरक्षित समय से ज्यादा बाहर न छोड़ें"),
      t("सफाई", "हर रंग के कपड़े को एक काम दें और सूची उन्हीं के साथ रखें", "सफाई बॉक्स के ढक्कन के अंदर", "अगले काम से पहले कपड़ा धोएं या बदलें", "बाथरूम, रसोई और धूल के कपड़े अलग रहते हैं", "सफाई के उत्पादों को मिलाकर तेज मिश्रण न बनाएं"),
      t("कैलेंडर", "सिर्फ अपॉइंटमेंट नहीं, निकलने का समय भी लिखें", "उसी कैलेंडर एंट्री में", "रास्ता, जूते, बैग और छोटा बफर जोड़ें", "सुबह अचानक भागने की जगह साफ रास्ता बनती है", "साझा कैलेंडर नोट में निजी कोड न लिखें"),
      t("पासवर्ड", "पासवर्ड मैनेजर उपयोग करें और हर जरूरी खाते का अलग पासवर्ड रखें", "मैनेजर में, पासवर्ड नाम की नोट में नहीं", "जहां हो सके मल्टी-फैक्टर सुरक्षा चालू करें", "एक लीक पासवर्ड बाकी सब कुछ नहीं खोलता", "रिकवरी कोड दोबारा इस्तेमाल न करें और स्क्रीनशॉट में न रखें"),
    ],
  },
  id: {
    id: "tips-id",
    titlePrefix: ["satu tempat", "cek mingguan", "tanda terlihat"],
    lenses: {
      accountant: "Buat terukur: tulis tanggal, jumlah, atau hitungan saat tugas masih segar",
      builder: "Bersihkan jalur fisik dulu agar aturan mudah diikuti",
      chef: "Taruh makanan atau barang dapur di tempat yang terlihat sebelum terlupa",
      firefighter: "Jauhkan panas, tumpukan barang, dan pintu terhalang dari pengaturan ini",
      hairdresser: "Buat tanda visual cukup jelas untuk terlihat saat bergerak cepat",
      lawyer: "Tinggalkan catatan kecil agar keputusan mudah dipahami nanti",
      mechanic: "Cek tanda aus sederhana sebelum masalah menjadi mahal",
      police: "Gunakan satu titik serah agar barang bersama tidak menjadi pencarian",
      programmer: "Buat pengingat mudah dicari dan jauhkan data pribadi dari catatan terbuka",
      teacher: "Ubah aturan menjadi satu kalimat yang bisa diulang semua orang di rumah",
    },
    patterns: [
      (c) => `Aturan sederhana bisa membantu: ${c.action}. Simpan pengingat ${c.place}. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
      (c) => `Pakai cek lima menit setiap minggu: ${c.action}. Lalu lihat ${c.place}. ${c.cue}. ${c.benefit}. Buat kecil dan mudah diulang. ${c.avoid}.`,
      (c) => `Buat terlihat sebelum menjadi darurat: ${c.action}. Letakkan tanda ${c.place}. ${c.cue}. ${c.benefit}. Satu catatan, label, atau kotak sudah cukup untuk mulai. ${c.avoid}.`,
    ],
    topics: [
      t("Langganan", "tulis nama layanan, tanggal tagihan, dan jumlahnya dalam satu daftar", "di dekat aplikasi bank atau lembar anggaran", "Tambahkan baris langsung setelah setiap pendaftaran", "biaya yang terlupa terlihat sebelum tagihan berikutnya", "Jangan simpan kata sandi, kode, atau nomor kartu lengkap di sana"),
      t("Dapur", "taruh barang yang kedaluwarsa lebih dulu di baris depan", "di rak dengan label pakai dulu", "Periksa baris itu sebelum membuka kemasan baru", "makanan yang masih bagus terpakai sebelum tertutup kotak baru", "Jangan simpan makanan terbuka tanpa tanggal atau wadah tertutup"),
      t("Dokumen", "buat catatan pendek tentang lokasi dokumen asli dan salinannya", "di folder terlindungi dan indeks kertas sederhana", "Setelah perjalanan atau perpanjangan, ubah hanya baris yang berubah", "pencarian lebih tenang saat satu dokumen dibutuhkan cepat", "Jangan kirim scan di chat bersama tanpa menutup data pribadi"),
      t("Kabel", "tentukan satu tempat pengisian daya dan cabut adaptor lama dari stopkontak", "di permukaan kosong jauh dari kertas dan kain", "Sebelum tidur, cek tidak ada kabel terjepit furnitur", "panas, kusut, dan pencarian mendadak berkurang", "Jangan gunakan kabel retak atau alat yang terasa panas"),
      t("Cucian", "gantung kantong jaring di keranjang untuk kaus kaki dan pakaian halus", "di kait atau di dalam keranjang", "Tutup kantong sebelum mencuci dan cek saku", "barang kecil tidak mudah hilang antara sortir dan pengeringan", "Jangan isi kantong terlalu penuh karena kain perlu ruang untuk terbilas"),
      t("Struk", "masukkan struk kertas ke satu amplop dan beri tag sama untuk struk digital", "di laci dekat pintu atau folder email", "Akhir minggu, simpan hanya yang perlu untuk retur atau garansi", "belanja kecil tidak tersebar di tas dan saku", "Jangan foto dokumen di dekat data pribadi yang tidak perlu"),
      t("Sisa makanan", "buat satu rak kulkas khusus untuk yang harus segera dipakai", "setinggi mata dengan label kecil", "Mulai memasak dengan melihat rak itu dulu", "sisa makanan menjadi makan malam, bukan wadah terlupa", "Jangan biarkan makanan matang di luar lebih lama dari yang aman"),
      t("Alat bersih", "beri satu fungsi untuk tiap warna lap dan simpan daftarnya bersama lap", "di bagian dalam tutup kotak bersih-bersih", "Cuci atau ganti lap sebelum tugas berikutnya", "permukaan lebih bersih karena lap kamar mandi, dapur, dan debu tidak bercampur", "Jangan mencampur produk pembersih atau membuat ramuan lebih kuat"),
      t("Kalender", "tambahkan jam berangkat, bukan hanya jam janji", "di acara kalender yang sama", "Masukkan perjalanan, sepatu, tas, dan jeda kecil", "pagi hari menjadi rute, bukan kejutan", "Jangan tulis kode pribadi di catatan kalender bersama"),
      t("Kata sandi", "gunakan pengelola kata sandi dan beri tiap akun penting kata sandi unik", "di pengelola, bukan di catatan bernama password", "Aktifkan perlindungan multifaktor jika tersedia", "satu kata sandi bocor tidak langsung membuka semuanya", "Jangan pakai ulang kode pemulihan atau menyimpannya sebagai tangkapan layar"),
    ],
  },
  ar: {
    id: "tips-ar",
    titlePrefix: ["مكان ثابت", "فحص أسبوعي", "تذكير واضح"],
    lenses: {
      accountant: "اجعلها قابلة للقياس: اكتب التاريخ أو المبلغ أو العدد قبل أن تنسى التفاصيل",
      builder: "نظف المسار المادي أولا حتى يكون اتباع القاعدة سهلا",
      chef: "ضع الطعام أو أداة المطبخ في مكان يراه الجميع قبل أن ينسى",
      firefighter: "أبعد الحرارة والفوضى والمخارج المغلقة عن هذه الطريقة",
      hairdresser: "اجعل الإشارة البصرية واضحة بما يكفي لتلاحظها وأنت مستعجل",
      lawyer: "اترك أثرا مكتوبا صغيرا لتفهم القرار لاحقا",
      mechanic: "افحص علامات التآكل البسيطة قبل أن تصبح المشكلة مكلفة",
      police: "استخدم نقطة تسليم واحدة حتى لا تتحول الأشياء المشتركة إلى بحث",
      programmer: "اجعل التذكير قابلا للبحث ولا تضع البيانات الخاصة في ملاحظات مفتوحة",
      teacher: "حوّل القاعدة إلى جملة واحدة يستطيع كل من في البيت تكرارها",
    },
    patterns: [
      (c) => `قاعدة بسيطة تساعد هنا: ${c.action}. ضع التذكير ${c.place}. ${c.cue}. ${c.benefit}. ${c.avoid}.`,
      (c) => `اجعلها مراجعة قصيرة من خمس دقائق كل أسبوع: ${c.action}. ثم انظر إلى ${c.place}. ${c.cue}. ${c.benefit}. أبقها صغيرة وسهلة التكرار. ${c.avoid}.`,
      (c) => `اجعل الأمر مرئيا قبل أن يصبح عاجلا: ${c.action}. ضع الإشارة ${c.place}. ${c.cue}. ${c.benefit}. ملاحظة أو ملصق أو صندوق واحد يكفي للبدء. ${c.avoid}.`,
    ],
    topics: [
      t("الاشتراكات", "اكتب اسم الخدمة وتاريخ السحب والمبلغ في قائمة واحدة", "قرب تطبيق البنك أو جدول الميزانية", "أضف سطرا فور الاشتراك في أي خدمة جديدة", "تظهر الرسوم المنسية قبل الفاتورة التالية", "لا تحفظ هناك كلمات مرور أو رموزا أو أرقام بطاقات كاملة"),
      t("المخزن", "ضع الأشياء التي تنتهي صلاحيتها أولا في الصف الأمامي", "على رف صغير عليه ملصق استخدم أولا", "افحص ذلك الصف قبل فتح عبوة جديدة", "يستخدم الطعام الجيد قبل أن يختفي خلف علب أحدث", "لا تترك طعاما مفتوحا بلا تاريخ أو وعاء مغلق"),
      t("المستندات", "احتفظ بملاحظة قصيرة توضح مكان الأصل ومكان النسخة", "في مجلد محمي وفهرس ورقي بسيط", "بعد السفر أو التجديد حدث السطر الذي تغير فقط", "يصبح البحث أهدأ عندما تحتاج ورقة محددة بسرعة", "لا ترسل صور المستندات في دردشة مشتركة قبل إخفاء البيانات الخاصة"),
      t("الكابلات", "اختر مكانا واحدا للشحن وانزع المحولات القديمة من المقابس", "على سطح خال بعيدا عن الورق والقماش", "قبل النوم تأكد أن أي كابل غير مضغوط تحت الأثاث", "تقل الحرارة والفوضى والبحث في آخر لحظة", "لا تستخدم كابلا متشققا أو شيئا يسخن"),
      t("الغسيل", "علق كيسا شبكيا على سلة الغسيل للجوارب والقطع الحساسة", "على خطاف أو داخل السلة", "أغلق الكيس قبل كل غسلة وافحص الجيوب", "تتوقف القطع الصغيرة عن الاختفاء بين الفرز والتجفيف", "لا تملأ الكيس كثيرا لأن القماش يحتاج مساحة للشطف"),
      t("الإيصالات", "ضع الإيصالات الورقية في ظرف واحد ووسم الرقمية بالوسم نفسه", "في درج عند المدخل أو مجلد بريد", "في نهاية الأسبوع احتفظ بما يلزم للإرجاع أو الضمان فقط", "لا تنتشر المشتريات الصغيرة بين الحقائب والجيوب", "لا تصور المستندات قرب بيانات شخصية غير ضرورية"),
      t("بقايا الطعام", "خصص رف ثلاجة لما يجب استخدامه قريبا", "على مستوى العين مع ملصق صغير", "ابدأ الطبخ بالنظر إلى هذا الرف أولا", "تصبح البقايا وجبة بدلا من علبة منسية", "لا تترك الطعام المطبوخ خارج الثلاجة أكثر من الآمن"),
      t("التنظيف", "اجعل لكل لون مناشف تنظيف مهمة واحدة واحتفظ بالقائمة معها", "داخل غطاء صندوق التنظيف", "اغسل أو بدّل القطعة قبل المهمة التالية", "تبقى الأسطح أنظف لأن الحمام والمطبخ والغبار لا تختلط أدواتها", "لا تخلط منتجات التنظيف ولا تخترع خليطا أقوى"),
      t("التقويم", "أضف وقت الخروج لا وقت الموعد فقط", "في خانة التقويم نفسها", "احسب الطريق والحذاء والحقيبة وهامشا صغيرا", "يتحول الصباح إلى مسار واضح بدلا من مفاجأة", "لا تكتب رموزا خاصة في ملاحظات تقويم مشتركة"),
      t("كلمات المرور", "استخدم مدير كلمات مرور واجعل لكل حساب مهم كلمة مختلفة", "داخل المدير وليس في ملاحظة اسمها كلمات المرور", "فعل الحماية متعددة العوامل حيثما توفرت", "كلمة مرور مسربة واحدة لا تفتح كل شيء", "لا تعد استخدام رموز الاسترداد ولا تحفظها في لقطات شاشة"),
    ],
  },
};

function t(short, action, place, cue, benefit, avoid) {
  return { short, action, place, cue, benefit, avoid };
}

function titleFor(locale, topic, variant) {
  return `${topic.short}: ${locale.titlePrefix[variant]}`;
}

function buildLocale(locale) {
  const cards = [];
  for (const profession of PROFS) {
    for (const topic of locale.topics) {
      for (let variant = 0; variant < locale.patterns.length; variant += 1) {
        const text = `${locale.patterns[variant](topic)} ${locale.lenses[profession]}.`.replace(/\s+/g, " ").trim();
        cards.push({
          id: cards.length + 1,
          pack: Math.floor(cards.length / PACK_SIZE) + 1,
          text,
          chars: text.length,
          title: titleFor(locale, topic, variant),
          profession,
        });
      }
    }
  }
  return cards;
}

for (const locale of Object.values(locales)) {
  const dir = resolve(ROOT, "data", locale.id);
  mkdirSync(dir, { recursive: true });
  const cards = buildLocale(locale);
  const byProfession = Object.fromEntries(PROFS.map((profession) => [profession, cards.filter((card) => card.profession === profession).length]));
  const lens = cards.map((card) => card.chars).sort((a, b) => a - b);
  writeFileSync(resolve(dir, "titled.json"), JSON.stringify(cards, null, 2) + "\n");
  writeFileSync(
    resolve(dir, "index.json"),
    JSON.stringify(
      {
        total: cards.length,
        packs: Math.max(1, Math.ceil(cards.length / PACK_SIZE)),
        packSize: PACK_SIZE,
        range: [lens[0] ?? 0, lens[lens.length - 1] ?? 0],
        byProfession,
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(
    resolve(dir, "sources.json"),
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        source: "scripts/build-missing-lifehack-locales.mjs",
        license: "original deterministic localized cards prepared in-repo",
        safety: "generic household organization, storage, routine, and digital-hygiene tips; excludes high-risk professional, medical, legal, repair, weapon, surveillance, and chemical-mixing advice",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${locale.id}: ${cards.length} cards, len ${lens[0]}..${lens[lens.length - 1]}`);
}
