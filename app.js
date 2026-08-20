const $ = (id) => document.getElementById(id);
const value = (id) => ($(id)?.value || "").trim();
const numberValue = (id) => Number.parseFloat(String($(id)?.value || "").replace(",", "."));
const templates = window.GLI_REPORT_TEMPLATES;

const typePrompts = {
  intake: [
    ["Open de intake", "Wat maakt dat je juist nu met je leefstijl aan de slag wilt?", "Gebruik een open vraag en laat de deelnemer eerst het eigen verhaal vertellen."],
    ["Verdiep de motivatie", "Wat zou er in je dagelijks leven veranderen als dit traject slaagt?", "Ontlok eigen redenen voor verandering; vermijd overtuigen."],
    ["Verken vertrouwen", "Hoeveel vertrouwen heb je er op een schaal van 0 tot 10 in dat dit haalbaar is?", "Vraag daarna waarom het cijfer niet lager is."],
    ["Maak het concreet", "Wat zou een eerste kleine en haalbare stap zijn?", "Formuleer de stap samen specifiek en uitvoerbaar."]
  ],
  tussen: [
    ["Open de evaluatie", "Hoe kijk je terug op de periode sinds het vorige gesprek?", "Begin breed en luister naar verandertaal."],
    ["Bekrachtig vooruitgang", "Waar ben je zelf het meest tevreden over?", "Benoem inzet en keuzes, niet alleen het resultaat."],
    ["Verken hindernissen", "Wat maakte het lastig en wat hielp op moeilijke momenten?", "Erken ambivalentie zonder de reparatiereflex."],
    ["Kies de volgende stap", "Welke verandering heeft voor jou nu de meeste prioriteit?", "Laat de deelnemer de richting en aanpak zoveel mogelijk zelf formuleren."]
  ],
  eind: [
    ["Kijk terug", "Waar ben je het meest trots op als je naar het hele traject kijkt?", "Vat zowel resultaat als leerproces samen."],
    ["Borg wat werkt", "Welke gewoonten wil je zeker blijven vasthouden?", "Vraag wat deze gewoonten succesvol maakte."],
    ["Voorkom terugval", "Waaraan merk je vroeg dat het minder goed gaat?", "Maak een concreet als-dan-plan voor risicomomenten."],
    ["Versterk zelfmanagement", "Wat heb je nodig om dit zelfstandig voort te zetten?", "Leg eigen regie, steunbronnen en nazorg vast."]
  ]
};

const categoryKeywords = {
  progress: /doel|resultaat|afgevallen|gewicht|vooruit|verbeter|gelukt|bereikt|fit|conditie|bloeddruk|suiker|cholesterol/i,
  lifestyle: /voeding|eten|groente|fruit|beweeg|sport|wandel|fiets|slaap|stress|ontspan|rook|alcohol|gewoonte/i,
  barriers: /moeilijk|lastig|hindernis|obstakel|druk|tijd|pijn|klacht|terugval|motivatieverlies|niet gelukt|verleiding|oplossing/i,
  motivation: /motiv|vertrouwen|energie|stemming|welzijn|trots|belangrijk|wil|bereid|haalbaar|verwacht/i,
  health: /aandoening|medicatie|medicijn|huisarts|verwijz|contra.indicatie|bloeddruk|diabetes|klacht|pijn|verslaving/i,
  nextSteps: /afspraak|volgende|komende|actie|stap|plan|doorgaan|ondersteun|doorverwij|nazorg|vasthouden|behouden/i
};

let timerHandle = null;
let elapsedSeconds = 0;
let tipIndex = 0;
let parsedConversation = null;
let lastReport = "";

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function bmiClassification(bmi) {
  if (!bmi) return "—";
  if (bmi < 18.5) return "Ondergewicht";
  if (bmi < 25) return "Gezond gewicht";
  if (bmi < 30) return "Overgewicht";
  return "Obesitas";
}

function calculateMeasurements() {
  const height = numberValue("height") / 100;
  const weight = numberValue("currentWeight");
  const waist = numberValue("currentWaist");
  const bmi = height > 0 && weight > 0 ? weight / (height * height) : null;
  $("metrics").innerHTML = [
    ["BMI", bmi ? bmi.toFixed(1) : "—"],
    ["Classificatie", bmiClassification(bmi)],
    ["Buikomvang", Number.isFinite(waist) ? `${waist.toFixed(1)} cm` : "—"]
  ].map(([label, result]) => `<div class="metric"><span>${label}</span><strong>${result}</strong></div>`).join("");
  return { height: Number.isFinite(height) ? height : null, weight, waist, bmi };
}

function renderGuidance() {
  const type = $("evaluationType").value;
  const tips = typePrompts[type];
  const [title, question, note] = tips[tipIndex % tips.length];
  $("guidanceOutput").innerHTML = `<strong>${escapeHtml(title)}</strong><p>“${escapeHtml(question)}”</p><small>${escapeHtml(note)}</small>`;
}

function setEvaluationType() {
  const type = $("evaluationType").value;
  tipIndex = 0;
  $("modeLabel").textContent = templates[type].label;
  $("reportTitle").textContent = templates[type].label;
  renderGuidance();
  if (parsedConversation) generateReport();
}

function formatTimer() {
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
  $("timer").textContent = `${minutes}:${seconds}`;
}

function startSession() {
  if (!$("consentCheck").checked) {
    $("wordHelp").textContent = "Bevestig eerst dat de deelnemer toestemming heeft gegeven.";
    $("consentCheck").focus();
    return;
  }
  if (!timerHandle) {
    elapsedSeconds = 0;
    formatTimer();
    timerHandle = window.setInterval(() => { elapsedSeconds += 1; formatTimer(); }, 1000);
  }
  $("sessionStatus").textContent = "Gesprek actief";
  $("sessionStatus").classList.add("recording");
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;
  $("wordHelp").textContent = "Word is geopend. Kies daar Start → Dicteren → Transcriberen → Opname starten.";
  window.open("https://word.cloud.microsoft/", "_blank", "noopener,noreferrer");
}

function stopSession() {
  if (timerHandle) window.clearInterval(timerHandle);
  timerHandle = null;
  $("sessionStatus").textContent = "Klaar voor import";
  $("sessionStatus").classList.remove("recording");
  $("startBtn").disabled = false;
  $("stopBtn").disabled = true;
  $("wordHelp").textContent = "Laat Word de opname transcriberen en plak daarna het volledige transcript in stap 4.";
  $("transcriptInput").focus();
}

function cleanLine(line) {
  return line.replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/g, "").replace(/\s+/g, " ").trim();
}

function parseWordTranscript(rawText) {
  const text = rawText.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { turns: [], speakers: [] };

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const turns = [];
  let currentSpeaker = null;
  let buffer = [];
  const speakerPattern = /^(?:\[)?(speaker|spreker|guest|gast)\s*[-_ ]?(\d+)(?:\])?(?:\s*[·:\-–—]\s*|\s+\d{1,2}:\d{2}(?::\d{2})?\s*)?(.*)$/i;

  const flush = () => {
    const content = cleanLine(buffer.join(" "));
    if (currentSpeaker && content) turns.push({ speaker: currentSpeaker, text: content });
    buffer = [];
  };

  lines.forEach((line) => {
    const match = line.match(speakerPattern);
    if (match) {
      flush();
      currentSpeaker = `Speaker ${match[2]}`;
      if (match[3]) buffer.push(match[3]);
    } else if (currentSpeaker) {
      buffer.push(line);
    }
  });
  flush();

  if (!turns.length) {
    const inlinePattern = /(?:^|\n)\s*(?:\[)?(speaker|spreker|guest|gast)\s*[-_ ]?(\d+)(?:\])?\s*[:\-–—]\s*([\s\S]*?)(?=(?:\n\s*(?:\[)?(?:speaker|spreker|guest|gast)\s*[-_ ]?\d+)|$)/gi;
    let match;
    while ((match = inlinePattern.exec(text))) {
      const content = cleanLine(match[3]);
      if (content) turns.push({ speaker: `Speaker ${match[2]}`, text: content });
    }
  }

  return { turns, speakers: [...new Set(turns.map((turn) => turn.speaker))] };
}

function inferRoles(turns, speakers) {
  const scores = Object.fromEntries(speakers.map((speaker) => [speaker, { questions: 0, coachWords: 0, chars: 0, turns: 0 }]));
  turns.forEach((turn) => {
    const score = scores[turn.speaker];
    score.questions += (turn.text.match(/\?/g) || []).length;
    score.coachWords += (turn.text.match(/\b(hoe|wat|welke|waarom|vertel|schaal|afspraak|samenvatten|begrijp|hoor ik)\b/gi) || []).length;
    score.chars += turn.text.length;
    score.turns += 1;
  });
  const ranked = [...speakers].sort((a, b) => {
    const aScore = scores[a].questions * 5 + scores[a].coachWords * 1.5 - scores[a].chars / 1200;
    const bScore = scores[b].questions * 5 + scores[b].coachWords * 1.5 - scores[b].chars / 1200;
    return bScore - aScore;
  });
  const coach = ranked[0] || "Speaker 1";
  const participant = ranked.find((speaker) => speaker !== coach) || ranked[0] || "Speaker 2";
  return { coach, participant, scores };
}

function sentenceList(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 12);
}

function participantSentences(conversation) {
  return conversation.turns
    .filter((turn) => turn.speaker === conversation.roles.participant)
    .flatMap((turn) => sentenceList(turn.text));
}

function selectSentences(sentences, pattern, limit = 4) {
  const selected = sentences.filter((sentence) => pattern.test(sentence)).slice(0, limit);
  pattern.lastIndex = 0;
  return selected;
}

function bulletText(sentences, fallback) {
  return sentences.length ? sentences.map((sentence) => `- ${sentence}`).join("\n") : `- ${fallback}`;
}

function buildAnalysis(conversation) {
  const participant = participantSentences(conversation);
  const changeTalk = selectSentences(participant, /wil|ga|kan|belangrijk|doel|plan|proberen|behouden|gelukt|trots/i, 3);
  const barriers = selectSentences(participant, categoryKeywords.barriers, 3);
  const totalChars = conversation.turns.reduce((sum, turn) => sum + turn.text.length, 0);
  const participantChars = conversation.turns.filter((turn) => turn.speaker === conversation.roles.participant).reduce((sum, turn) => sum + turn.text.length, 0);
  const participantShare = totalChars ? Math.round((participantChars / totalChars) * 100) : 0;
  const coachQuestions = conversation.roles.scores[conversation.roles.coach]?.questions || 0;
  const cards = [
    ["Spreekverhouding", `${participantShare}% deelnemer`, participantShare >= 55 ? "Ruimte voor het verhaal van de deelnemer." : "Overweeg meer open vragen en reflecties."],
    ["Coachvragen", String(coachQuestions), "Controleer of vragen open en niet-sturend zijn."],
    ["Verandertaal", String(changeTalk.length), changeTalk[0] || "Nog weinig expliciete verandertaal gevonden."],
    ["Hindernissen", String(barriers.length), barriers[0] || "Geen duidelijke hindernis herkend."]
  ];
  $("analysisOutput").className = "analysis-grid";
  $("analysisOutput").innerHTML = cards.map(([label, result, note]) => `<div class="analysis-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(result)}</strong><small>${escapeHtml(note)}</small></div>`).join("");
}

function measurementText() {
  const data = calculateMeasurements();
  return [
    `- Lengte: ${value("height") || "niet ingevuld"} cm`,
    `- Gewicht: ${value("currentWeight") || "niet ingevuld"} kg`,
    `- Buikomvang: ${value("currentWaist") || "niet ingevuld"} cm`,
    `- BMI: ${data.bmi ? data.bmi.toFixed(1) : "niet berekend"}${data.bmi ? ` (${bmiClassification(data.bmi).toLowerCase()})` : ""}`
  ].join("\n");
}

function sectionContent(key, conversation) {
  const sentences = participantSentences(conversation);
  const categories = {
    progress: selectSentences(sentences, categoryKeywords.progress),
    lifestyle: selectSentences(sentences, categoryKeywords.lifestyle, 6),
    barriers: selectSentences(sentences, categoryKeywords.barriers),
    motivation: selectSentences(sentences, categoryKeywords.motivation),
    health: selectSentences(sentences, categoryKeywords.health),
    nextSteps: selectSentences(sentences, categoryKeywords.nextSteps)
  };
  if (key === "measurements") return measurementText();
  if (key === "abstract") {
    const core = [...categories.progress, ...categories.lifestyle, ...categories.barriers].slice(0, 3);
    return core.length ? core.join(" ") : "Het gesprek is gevoerd en de relevante leefstijlthema's zijn besproken; controleer het transcript en vul ontbrekende kerninformatie aan.";
  }
  const fallbacks = {
    progress: "Doelen of voortgang zijn niet duidelijk uit het transcript herkend.",
    lifestyle: "Voeding, beweging, slaap en stress zijn niet volledig uit het transcript herkend.",
    barriers: "Hindernissen of werkende oplossingen zijn niet duidelijk benoemd.",
    motivation: "Motivatie, vertrouwen of welzijn zijn niet duidelijk benoemd.",
    health: "Gezondheidsgegevens of relevante aandachtspunten zijn niet duidelijk benoemd.",
    nextSteps: "Concrete vervolgstappen en ondersteuning moeten nog worden vastgelegd."
  };
  return bulletText(categories[key] || [], fallbacks[key] || "Niet uit het transcript herkend.");
}

function generateReport() {
  if (!parsedConversation?.turns.length) return;
  const type = $("evaluationType").value;
  const template = templates[type];
  const date = new Date().toLocaleDateString("nl-NL");
  const sections = template.sections.map(([title, key]) => `${title}\n${sectionContent(key, parsedConversation)}`).join("\n\n");
  lastReport = `${template.label}\nDatum evaluatie: ${date}\n\n${sections}`;
  $("reportOutput").className = "report-output";
  $("reportOutput").textContent = lastReport;
  $("copyBtn").disabled = false;
  $("generateBtn").disabled = false;
}

function processTranscript() {
  const rawText = value("transcriptInput");
  const parsed = parseWordTranscript(rawText);
  if (parsed.speakers.length < 2 || parsed.turns.length < 2) {
    $("transcriptStatus").textContent = "Niet herkend";
    $("speakerResult").className = "speaker-result error-state";
    $("speakerResult").textContent = "Er zijn geen twee Word-sprekers herkend. Kopieer het volledige transcript inclusief de labels Speaker 1 en Speaker 2.";
    return;
  }
  const roles = inferRoles(parsed.turns, parsed.speakers);
  parsedConversation = { ...parsed, roles };
  $("transcriptStatus").textContent = `${parsed.turns.length} gespreksdelen`;
  $("speakerResult").className = "speaker-result";
  $("speakerResult").innerHTML = `<div><span>Waarschijnlijk coach</span><strong>${escapeHtml(roles.coach)}</strong></div><div><span>Waarschijnlijk deelnemer</span><strong>${escapeHtml(roles.participant)}</strong></div><p>De rol wordt bepaald op basis van vraagstelling en gespreksverdeling. Controleer dit voor gebruik in het dossier.</p>`;
  buildAnalysis(parsedConversation);
  generateReport();
  $("reportOutput").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function importTranscriptFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  $("transcriptInput").value = await file.text();
  $("transcriptStatus").textContent = "Bestand geladen";
  processTranscript();
}

function clearConversation() {
  $("transcriptInput").value = "";
  $("transcriptFile").value = "";
  parsedConversation = null;
  lastReport = "";
  $("transcriptStatus").textContent = "Nog leeg";
  $("speakerResult").className = "speaker-result empty-state";
  $("speakerResult").textContent = "Na verwerking verschijnen hier de automatisch bepaalde rollen.";
  $("analysisOutput").className = "analysis-grid empty-state";
  $("analysisOutput").textContent = "Importeer eerst een transcript.";
  $("reportOutput").className = "report-output empty-state";
  $("reportOutput").textContent = "Het verslag verschijnt na verwerking van het transcript.";
  $("copyBtn").disabled = true;
  $("generateBtn").disabled = true;
}

async function copyReport() {
  if (!lastReport) return;
  try {
    await navigator.clipboard.writeText(lastReport);
    const original = $("copyBtn").textContent;
    $("copyBtn").textContent = "Gekopieerd";
    window.setTimeout(() => { $("copyBtn").textContent = original; }, 1600);
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("reportOutput"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

["height", "currentWeight", "currentWaist"].forEach((id) => $(id).addEventListener("input", () => {
  calculateMeasurements();
  if (parsedConversation) generateReport();
}));
$("evaluationType").addEventListener("change", setEvaluationType);
$("nextTipBtn").addEventListener("click", () => { tipIndex += 1; renderGuidance(); });
$("startBtn").addEventListener("click", startSession);
$("stopBtn").addEventListener("click", stopSession);
$("processBtn").addEventListener("click", processTranscript);
$("transcriptFile").addEventListener("change", importTranscriptFile);
$("clearBtn").addEventListener("click", clearConversation);
$("generateBtn").addEventListener("click", generateReport);
$("copyBtn").addEventListener("click", copyReport);

$("templateVersion").textContent = `Bronformat ${templates.version}`;
calculateMeasurements();
setEvaluationType();
