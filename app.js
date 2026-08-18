const $ = (id) => document.getElementById(id);
const sections = document.querySelectorAll('[data-section]');
const panels = document.querySelectorAll('[data-panel]');

sections.forEach((button) => button.addEventListener('click', () => {
  sections.forEach((b) => b.classList.toggle('active', b === button));
  panels.forEach((p) => p.classList.toggle('active-panel', p.dataset.panel === button.dataset.section));
}));

const value = (id) => $(id).value.trim();
const num = (id) => Number.parseFloat($(id).value);

function calculate() {
  const height = num('height') / 100, start = num('startWeight'), current = num('currentWeight');
  const bmi = height > 0 && current > 0 ? current / (height * height) : null;
  const delta = start > 0 && current > 0 ? current - start : null;
  const pct = delta !== null ? (delta / start) * 100 : null;
  $('metrics').innerHTML = [
    ['BMI', bmi ? bmi.toFixed(1) : '—'],
    ['Gewichtsverandering', delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg` : '—'],
    ['Verandering %', pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—']
  ].map(([label, result]) => `<div class="metric"><span>${label}</span><strong>${result}</strong></div>`).join('');
  return {bmi, delta, pct};
}
['height','startWeight','currentWeight'].forEach((id) => $(id).addEventListener('input', calculate));

function analyze() {
  const c = calculate();
  const sections = [
    ['Sterke punten', value('nutrition') || value('movement') ? 'Er zijn concrete leefstijlgegevens vastgelegd voor voeding en/of beweging.' : 'Nog onvoldoende informatie vastgelegd.'],
    ['Aandachtspunten', value('sleepStress') || value('behavior') ? `${value('sleepStress') || ''}${value('sleepStress') && value('behavior') ? ' ' : ''}${value('behavior') || ''}` : 'Nog te bespreken in het evaluatiegesprek.'],
    ['Voortgang metingen', c.delta !== null ? `Het gewicht veranderde met ${c.delta.toFixed(1)} kg (${c.pct.toFixed(1)}%). Het huidige BMI is ${c.bmi.toFixed(1)}.` : 'Gewichtsmetingen zijn nog niet volledig ingevuld.'],
    ['Vervolg', 'Bespreek één haalbare gedragsverandering, leg de afspraak concreet vast en plan een volgend meetmoment.']
  ];
  $('analysisOutput').classList.remove('empty');
  $('analysisOutput').innerHTML = sections.map(([h, t]) => `<div class="analysis-block"><h3>${h}</h3><div>${t}</div></div>`).join('');
}
$('analyzeBtn').addEventListener('click', () => { analyze(); document.querySelector('[data-section="analysis"]').click(); });

function report() {
  const c = calculate();
  const weight = c.delta !== null ? `${c.delta.toFixed(1)} kg (${c.pct.toFixed(1)}%)` : 'niet berekend';
  $('reportOutput').textContent = `GLI traject evaluatie\n\nDeelnemer: ${value('name') || 'onbekend'}\nDatum: ${value('evaluationDate') || 'niet ingevuld'}\n\nKorte samenvatting voor verwijzer\nDe deelnemer heeft het GLI-traject geëvalueerd. De voortgang, leefstijlgewoonten, ervaren barrières en vervolgstappen zijn besproken.\n\nVoortgang\n- Gewichtsverandering: ${weight}\n- Huidig BMI: ${c.bmi ? c.bmi.toFixed(1) : 'niet berekend'}\n- Beweging: ${value('movement') || 'niet beschreven'}\n\nLeefstijl en gedrag\n- Voeding: ${value('nutrition') || 'niet beschreven'}\n- Slaap en stress: ${value('sleepStress') || 'niet beschreven'}\n- Gedrag en motivatie: ${value('behavior') || 'niet beschreven'}\n\nGemaakte afspraken\n${value('agreements') || 'Nog niet ingevuld.'}\n\nNieuwe doelen\n${value('goals') || 'Nog niet ingevuld.'}\n\nActies begeleider\n${value('coachActions') || 'Nog niet ingevuld.'}`;
}
$('reportBtn').addEventListener('click', report);

const modeTexts = {conversation:'De tool verzamelt informatie en analyseert pas na een expliciet commando.',analysis:'De tool structureert voortgang, sterke punten, knelpunten en doelen.',report:'De tool zet de analyse om in een professioneel GLI-verslag.',calculation:'De tool berekent BMI en veranderingen op basis van ingevulde meetwaarden.'};
$('modeSelect').addEventListener('change', (e) => { const mode = e.target.value; $('modeLabel').textContent = e.target.options[e.target.selectedIndex].text.split(' —')[0]; $('modeHelp').textContent = modeTexts[mode]; });
