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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const TARGET_SAMPLE_RATE = 16000;

let timerHandle = null;
let elapsedSeconds = 0;
let tipIndex = 0;
let parsedConversation = null;
let lastReport = "";
let transcriptDebounce = null;

let isRecording = false;
let isStarting = false;
let mediaStream = null;
let audioContext = null;
let audioSource = null;
let audioProcessor = null;
let silentGain = null;
let pcmChunks = [];
let totalPcmSamples = 0;
let audioUrl = "";

let recognition = null;
let liveFinalText = "";
let liveInterimText = "";
let lastSpeechAt = 0;

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
    ["Buikomvang", Number.isFinite(waist) ? waist.toFixed(1) + " cm" : "—"]
  ].map(([label, result]) => '<div class="metric"><span>' + label + "</span><strong>" + result + "</strong></div>").join("");
  return { height: Number.isFinite(height) ? height : null, weight, waist, bmi };
}

function measurementsAreValid() {
  const height = numberValue("height");
  const weight = numberValue("currentWeight");
  const waist = numberValue("currentWaist");
  return height >= 100 && height <= 250 && weight >= 20 && weight <= 350 && waist >= 40 && waist <= 250;
}

function renderGuidance() {
  const type = $("evaluationType").value;
  const tips = typePrompts[type];
  const [title, question, note] = tips[tipIndex % tips.length];
  $("guidanceOutput").innerHTML = "<strong>" + escapeHtml(title) + "</strong><p>“" + escapeHtml(question) + "”</p><small>" + escapeHtml(note) + "</small>";
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
  $("timer").textContent = minutes + ":" + seconds;
}

function updateRecordingUi(active) {
  $("startBtn").disabled = false;
  $("startBtn").textContent = active ? "Stop gesprek" : "Start gesprek";
  $("startBtn").classList.toggle("stop-session", active);
  $("sessionStatus").textContent = active ? "Gesprek actief" : "Opname gereed";
  $("sessionStatus").classList.toggle("recording", active);
  $("miStatus").textContent = active ? "Live" : "Na gesprek";
  $("miStatus").classList.toggle("recording", active);
}

function startTimer() {
  elapsedSeconds = 0;
  formatTimer();
  timerHandle = window.setInterval(() => {
    elapsedSeconds += 1;
    formatTimer();
    if (elapsedSeconds % 12 === 0) renderLiveMiFeedback();
  }, 1000);
}

function stopTimer() {
  if (timerHandle) window.clearInterval(timerHandle);
  timerHandle = null;
}

function downsampleToInt16(input, inputRate, outputRate) {
  if (!input?.length) return new Int16Array(0);
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(outputLength);
  let inputOffset = 0;
  for (let outputOffset = 0; outputOffset < outputLength; outputOffset += 1) {
    const nextInputOffset = Math.min(input.length, Math.round((outputOffset + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (; inputOffset < nextInputOffset; inputOffset += 1) {
      sum += input[inputOffset];
      count += 1;
    }
    const sample = Math.max(-1, Math.min(1, count ? sum / count : 0));
    output[outputOffset] = sample < 0 ? sample * 32768 : sample * 32767;
  }
  return output;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function createWavBlob(chunks, sampleRate) {
  const sampleCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);
  let offset = 44;
  chunks.forEach((chunk) => {
    for (let index = 0; index < chunk.length; index += 1) {
      view.setInt16(offset, chunk[index], true);
      offset += 2;
    }
  });
  return new Blob([buffer], { type: "audio/wav" });
}

function updateMicLevel(samples) {
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  const percentage = Math.min(100, Math.max(2, rms * 360));
  $("micLevel").style.width = percentage + "%";
}

function resetLocalSession() {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = "";
  pcmChunks = [];
  totalPcmSamples = 0;
  liveFinalText = "";
  liveInterimText = "";
  lastSpeechAt = 0;
  $("audioPanel").hidden = true;
  $("audioPreview").removeAttribute("src");
  $("downloadWavBtn").removeAttribute("href");
  $("liveTranscript").textContent = "Luisteren naar het gesprek…";
  $("liveTranscriptStatus").textContent = "Luistert";
}

function startAudioCapture(stream) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("AudioContext wordt niet ondersteund in deze browser.");
  audioContext = new AudioContextClass();
  audioSource = audioContext.createMediaStreamSource(stream);
  audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  audioProcessor.onaudioprocess = (event) => {
    if (!isRecording) return;
    const samples = event.inputBuffer.getChannelData(0);
    updateMicLevel(samples);
    const chunk = downsampleToInt16(samples, audioContext.sampleRate, TARGET_SAMPLE_RATE);
    if (chunk.length) {
      pcmChunks.push(chunk);
      totalPcmSamples += chunk.length;
    }
  };
  audioSource.connect(audioProcessor);
  audioProcessor.connect(silentGain);
  silentGain.connect(audioContext.destination);
  return audioContext.resume();
}

function stopAudioCapture() {
  if (audioProcessor) {
    audioProcessor.onaudioprocess = null;
    audioProcessor.disconnect();
  }
  if (audioSource) audioSource.disconnect();
  if (silentGain) silentGain.disconnect();
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  if (audioContext && audioContext.state !== "closed") audioContext.close();
  mediaStream = null;
  audioContext = null;
  audioSource = null;
  audioProcessor = null;
  silentGain = null;
  $("micLevel").style.width = "0%";
}

function makeAudioAvailable() {
  if (!totalPcmSamples) {
    $("wordHelp").textContent = "Er zijn geen audiosamples opgeslagen. Controleer de microfoontoestemming en probeer opnieuw.";
    return;
  }
  const wavBlob = createWavBlob(pcmChunks, TARGET_SAMPLE_RATE);
  audioUrl = URL.createObjectURL(wavBlob);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  $("audioPreview").src = audioUrl;
  $("downloadWavBtn").href = audioUrl;
  $("downloadWavBtn").download = "gli-evaluatie-" + date + "-" + time + ".wav";
  $("audioPanel").hidden = false;
}

function renderLiveTranscript() {
  const finalText = liveFinalText.trim();
  const interimText = liveInterimText.trim();
  if (!finalText && !interimText) {
    $("liveTranscript").textContent = "Luisteren… Spreek duidelijk en laat de browsermicrofoon actief.";
    return;
  }
  $("liveTranscript").innerHTML = escapeHtml(finalText) + (interimText ? ' <span class="interim">' + escapeHtml(interimText) + "</span>" : "");
}

function liveMiAdvice(text) {
  const recent = text.toLowerCase().slice(-650);
  const questionCount = (recent.match(/\?/g) || []).length;
  if (/je moet|je zou moeten|u moet|probeer gewoon|het beste is/.test(recent)) {
    return ["Reparatiereflex mogelijk", "Vraag eerst toestemming vóór je advies geeft.", "Probeer: “Zou je het prettig vinden als ik een paar mogelijkheden met je deel?”"];
  }
  if (/moeilijk|lastig|geen tijd|druk|pijn|stress|lukt niet|terugval/.test(recent)) {
    return ["Hindernis gehoord", "Reflecteer eerst, los nog niets op.", "Probeer: “Je wilt dit wel, en tegelijk maakt dit het erg lastig.”"];
  }
  if (/ik wil|ik ga|ik kan|voor mij belangrijk|mijn doel|ik probeer|ik blijf|gelukt|trots/.test(recent)) {
    return ["Verandertaal gehoord", "Verdiep de eigen reden en bekrachtig die.", "Vraag: “Wat maakt dit voor jou belangrijk?”"];
  }
  if (questionCount >= 3) {
    return ["Veel vragen kort na elkaar", "Vertraag: geef een reflectie en stel daarna één open vraag.", "Probeer samen te vatten wat je zojuist hebt gehoord."];
  }
  if (/misschien|twijfel|weet niet|aan de ene kant|maar ook/.test(recent)) {
    return ["Ambivalentie gehoord", "Geef beide kanten zonder oordeel terug.", "Probeer: “Een deel van je wil veranderen, en een ander deel ziet bezwaren.”"];
  }
  return ["Blijf bij OARS", "Luister naar betekenis en autonomie.", "Gebruik nu een open vraag, reflectie of korte samenvatting."];
}

function renderLiveMiFeedback() {
  if (!isRecording && !liveFinalText) return;
  if (isRecording && !liveFinalText && Date.now() - lastSpeechAt > 15000) {
    $("liveGuidance").innerHTML = '<span class="signal-label">Technisch signaal</span><strong>Nog geen live tekst ontvangen.</strong><p>Controleer of de browser microfoontoegang én live spraakherkenning toestaat. De WAV-opname kan wel doorlopen.</p>';
    return;
  }
  const [signal, action, example] = liveMiAdvice(liveFinalText + " " + liveInterimText);
  $("liveGuidance").innerHTML = '<span class="signal-label">Voorlopige signalering</span><strong>' + escapeHtml(signal) + "</strong><p>" + escapeHtml(action) + "</p><small>" + escapeHtml(example) + "</small>";
}

function startRecognition() {
  if (!SpeechRecognition) {
    $("speechSupport").textContent = "Live spraakherkenning is in deze browser niet beschikbaar. De lokale WAV-opname loopt wel door; gebruik Word na afloop.";
    $("liveTranscriptStatus").textContent = "Niet beschikbaar";
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "nl-NL";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    lastSpeechAt = Date.now();
    $("speechSupport").textContent = "Live herkenning actief. Dit transcript is voorlopig; Word bepaalt na afloop de sprekers.";
    $("liveTranscriptStatus").textContent = "Live";
  };
  recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (event.results[index].isFinal) {
        liveFinalText += (liveFinalText ? " " : "") + transcript;
        lastSpeechAt = Date.now();
      } else {
        interim += (interim ? " " : "") + transcript;
      }
    }
    liveInterimText = interim;
    renderLiveTranscript();
    renderLiveMiFeedback();
  };
  recognition.onerror = (event) => {
    const blocked = event.error === "not-allowed" || event.error === "service-not-allowed";
    $("speechSupport").textContent = blocked
      ? "Live tekst is geblokkeerd door de browser. De WAV-opname loopt door; gebruik Word na afloop."
      : "Live herkenning is tijdelijk onderbroken (" + event.error + "). De WAV-opname loopt door.";
    $("liveTranscriptStatus").textContent = "WAV loopt";
  };
  recognition.onend = () => {
    liveInterimText = "";
    renderLiveTranscript();
    if (isRecording && recognition) {
      window.setTimeout(() => {
        if (isRecording && recognition) {
          try { recognition.start(); } catch {}
        }
      }, 300);
    }
  };
  try {
    recognition.start();
  } catch {
    $("speechSupport").textContent = "Live tekst kon niet starten. De WAV-opname loopt wel door.";
  }
}

function stopRecognition() {
  const activeRecognition = recognition;
  recognition = null;
  if (activeRecognition) {
    try { activeRecognition.stop(); } catch {}
  }
  liveInterimText = "";
  renderLiveTranscript();
  $("liveTranscriptStatus").textContent = liveFinalText ? "Voorlopig klaar" : "Geen live tekst";
}

async function startSession() {
  if (isRecording) {
    stopSession();
    return;
  }
  if (isStarting) return;
  if (!measurementsAreValid()) {
    $("wordHelp").textContent = "Vul eerst een geldige lengte, gewicht en buikomvang in.";
    $("height").focus();
    return;
  }
  if (!$("consentCheck").checked) {
    $("wordHelp").textContent = "Bevestig eerst dat de deelnemer toestemming heeft gegeven.";
    $("consentCheck").focus();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    $("wordHelp").textContent = "Deze browser kan geen microfoonopname starten. Gebruik een actuele versie van Chrome of Edge.";
    return;
  }

  isStarting = true;
  $("startBtn").disabled = true;
  $("wordHelp").textContent = "Microfoon wordt gestart…";
  resetLocalSession();
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    isRecording = true;
    await startAudioCapture(mediaStream);
    startTimer();
    startRecognition();
    updateRecordingUi(true);
    $("wordHelp").textContent = "Gesprek wordt als WAV opgenomen. Klik op dezelfde knop om te stoppen.";
    renderLiveMiFeedback();
  } catch (error) {
    isRecording = false;
    stopAudioCapture();
    $("sessionStatus").textContent = "Start mislukt";
    $("wordHelp").textContent = error?.name === "NotAllowedError"
      ? "Microfoontoegang is geweigerd. Sta de microfoon toe in de browser en probeer opnieuw."
      : "De opname kon niet starten: " + (error?.message || "onbekende fout") + ".";
    $("liveTranscriptStatus").textContent = "Niet gestart";
  } finally {
    isStarting = false;
    $("startBtn").disabled = false;
  }
}

function stopSession() {
  if (!isRecording) return;
  isRecording = false;
  stopTimer();
  stopRecognition();
  stopAudioCapture();
  makeAudioAvailable();
  updateRecordingUi(false);
  renderLiveMiFeedback();
  $("wordHelp").textContent = "Download de WAV, upload die in Word Transcribe en plak daarna het transcript met Speaker 1/2.";
  $("audioPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
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
      currentSpeaker = "Speaker " + match[2];
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
      if (content) turns.push({ speaker: "Speaker " + match[2], text: content });
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
  return sentences.length ? sentences.map((sentence) => "- " + sentence).join("\n") : "- " + fallback;
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
    ["Spreekverhouding", participantShare + "% deelnemer", participantShare >= 55 ? "Ruimte voor het verhaal van de deelnemer." : "Overweeg meer open vragen en reflecties."],
    ["Coachvragen", String(coachQuestions), "Controleer of vragen open en niet-sturend zijn."],
    ["Verandertaal", String(changeTalk.length), changeTalk[0] || "Nog weinig expliciete verandertaal gevonden."],
    ["Hindernissen", String(barriers.length), barriers[0] || "Geen duidelijke hindernis herkend."]
  ];
  $("analysisOutput").className = "analysis-grid";
  $("analysisOutput").innerHTML = cards.map(([label, result, note]) => '<div class="analysis-item"><span>' + escapeHtml(label) + "</span><strong>" + escapeHtml(result) + "</strong><small>" + escapeHtml(note) + "</small></div>").join("");
}

function measurementText() {
  const data = calculateMeasurements();
  return [
    "- Lengte: " + (value("height") || "niet ingevuld") + " cm",
    "- Gewicht: " + (value("currentWeight") || "niet ingevuld") + " kg",
    "- Buikomvang: " + (value("currentWaist") || "niet ingevuld") + " cm",
    "- BMI: " + (data.bmi ? data.bmi.toFixed(1) : "niet berekend") + (data.bmi ? " (" + bmiClassification(data.bmi).toLowerCase() + ")" : "")
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
  const sections = template.sections.map(([title, key]) => title + "\n" + sectionContent(key, parsedConversation)).join("\n\n");
  lastReport = template.label + "\nDatum evaluatie: " + date + "\n\n" + sections;
  $("reportOutput").className = "report-output";
  $("reportOutput").textContent = lastReport;
  $("copyBtn").disabled = false;
  $("generateBtn").disabled = false;
}

function processTranscript(options = {}) {
  const rawText = value("transcriptInput");
  const parsed = parseWordTranscript(rawText);
  if (parsed.speakers.length < 2 || parsed.turns.length < 2) {
    if (!options.silent) {
      $("transcriptStatus").textContent = "Niet herkend";
      $("speakerResult").className = "speaker-result error-state";
      $("speakerResult").textContent = "Er zijn geen twee Word-sprekers herkend. Kopieer het volledige transcript inclusief de labels Speaker 1 en Speaker 2.";
    }
    return false;
  }
  const roles = inferRoles(parsed.turns, parsed.speakers);
  parsedConversation = { ...parsed, roles };
  $("transcriptStatus").textContent = parsed.turns.length + " gespreksdelen";
  $("speakerResult").className = "speaker-result";
  $("speakerResult").innerHTML = "<div><span>Waarschijnlijk coach</span><strong>" + escapeHtml(roles.coach) + "</strong></div><div><span>Waarschijnlijk deelnemer</span><strong>" + escapeHtml(roles.participant) + "</strong></div><p>De rol wordt bepaald op basis van vraagstelling en gespreksverdeling. Controleer dit voor gebruik in het dossier.</p>";
  buildAnalysis(parsedConversation);
  generateReport();
  if (!options.noScroll) $("reportOutput").scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function scheduleTranscriptProcessing() {
  if (transcriptDebounce) window.clearTimeout(transcriptDebounce);
  $("transcriptStatus").textContent = value("transcriptInput") ? "Invoer ontvangen" : "Nog leeg";
  transcriptDebounce = window.setTimeout(() => {
    if (processTranscript({ silent: true, noScroll: true })) {
      $("wordHelp").textContent = "Definitief Word-transcript verwerkt; de rapportage staat klaar.";
    }
  }, 650);
}

async function importTranscriptFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  $("transcriptInput").value = await file.text();
  $("transcriptStatus").textContent = "Bestand geladen";
  processTranscript();
}

function clearConversation() {
  if (isRecording) stopSession();
  resetLocalSession();
  $("liveTranscript").textContent = "Hier verschijnt tijdens het gesprek de voorlopige tekst. Sprekers worden hier nog niet betrouwbaar onderscheiden.";
  $("liveTranscriptStatus").textContent = "Wacht op gesprek";
  $("sessionStatus").textContent = "Niet gestart";
  $("miStatus").textContent = "Voor gesprek";
  $("liveGuidance").innerHTML = '<span class="signal-label">Live feedback</span><strong>Start het gesprek voor live MI-signalen.</strong><p>De signalering is voorlopig en schrijft niets aan een spreker toe.</p>';
  $("transcriptInput").value = "";
  $("transcriptFile").value = "";
  parsedConversation = null;
  lastReport = "";
  $("transcriptStatus").textContent = "Nog leeg";
  $("speakerResult").className = "speaker-result empty-state";
  $("speakerResult").textContent = "Na verwerking verschijnen hier de automatisch bepaalde rollen.";
  $("analysisOutput").className = "analysis-grid empty-state";
  $("analysisOutput").textContent = "Importeer eerst een definitief Word-transcript.";
  $("reportOutput").className = "report-output empty-state";
  $("reportOutput").textContent = "Het verslag verschijnt automatisch na verwerking van het definitieve transcript.";
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
$("processBtn").addEventListener("click", () => processTranscript());
$("transcriptInput").addEventListener("input", scheduleTranscriptProcessing);
$("transcriptFile").addEventListener("change", importTranscriptFile);
$("clearBtn").addEventListener("click", clearConversation);
$("generateBtn").addEventListener("click", generateReport);
$("copyBtn").addEventListener("click", copyReport);

window.addEventListener("beforeunload", () => {
  if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());
  if (audioUrl) URL.revokeObjectURL(audioUrl);
});

$("templateVersion").textContent = "Bronformat " + templates.version;
if (!SpeechRecognition) {
  $("speechSupport").textContent = "Deze browser biedt geen live spraakherkenning. De lokale WAV-opname en Word-route blijven beschikbaar.";
}
calculateMeasurements();
setEvaluationType();
