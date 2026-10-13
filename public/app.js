const state = { preguntas: [], textos: [], index: 0, seleccion: {}, resultados: {}, ejes: new Set() };
const $ = (id) => document.getElementById(id);

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud');
  return data;
}

async function checkHealth() {
  try {
    await api('/api/health');
    $('api-status').textContent = 'Base de datos conectada';
    $('api-status').classList.add('ok');
  } catch {
    $('api-status').textContent = 'Sin conexión con la base de datos';
  }
}

async function loadQuestions() {
  const params = new URLSearchParams();
  if ($('materia').value) params.set('materia', $('materia').value);
  if ($('eje').value) params.set('eje', $('eje').value);
  if ($('dificultad').value) params.set('dificultad', $('dificultad').value);
  $('question-area').innerHTML = '<div class="empty"><div class="loader"></div><p>Cargando preguntas…</p></div>';
  try {
    const data = await api('/api/preguntas?' + params.toString());
    state.preguntas = data.preguntas;
    state.index = 0;
    $('count').textContent = `${data.total} preguntas`;
    renderQuestion();
  } catch (error) {
    $('question-area').innerHTML = `<div class="empty">${escapeHtml(error.message)}<br><small>Comprueba que el servidor esté conectado a MongoDB y que hayas ejecutado npm run seed.</small></div>`;
  }
}

function updateAxes() {
  const materia = $('materia').value;
  const current = $('eje').value;
  const axes = [...new Set(state.ejes.size ? [...state.ejes] : [])];
  const visible = state.allQuestions.filter(q => !materia || q.materia === materia).map(q => q.eje);
  const unique = [...new Set(visible)].sort((a,b) => a.localeCompare(b, 'es'));
  $('eje').innerHTML = '<option value="">Todos</option>' + unique.map(e => `<option value="${escapeAttr(e)}">${escapeHtml(e)}</option>`).join('');
  if (unique.includes(current)) $('eje').value = current;
}

function updateDifficultyOptions() {
  const materia = $('materia').value;
  const eje = $('eje').value;
  const current = $('dificultad').value;
  const matches = (state.allQuestions || []).filter(q =>
    (!materia || q.materia === materia) && (!eje || q.eje === eje)
  );
  const levels = [
    { value: '1', label: 'Inicial' },
    { value: '2', label: 'Intermedia' },
    { value: '3', label: 'Avanzado' }
  ];
  const available = levels.filter(level => matches.some(q => String(q.dificultad) === level.value));
  $('dificultad').innerHTML = '<option value="">Todas</option>' +
    available.map(level => {
      const count = matches.filter(q => String(q.dificultad) === level.value).length;
      return `<option value="${level.value}">${level.label} (${count})</option>`;
    }).join('');
  if (available.some(level => level.value === current)) $('dificultad').value = current;
  else $('dificultad').value = '';
}

function renderQuestion() {
  const q = state.preguntas[state.index];
  $('answered').textContent = `${Object.keys(state.resultados).length} respondidas`;
  $('question-number').textContent = state.preguntas.length ? `${state.index + 1} / ${state.preguntas.length}` : '0 / 0';
  $('prev-btn').disabled = !state.preguntas.length || state.index === 0;
  $('next-btn').disabled = !state.preguntas.length || state.index >= state.preguntas.length - 1;
  if (!q) {
    $('question-area').innerHTML = '<div class="empty">No hay preguntas con estos filtros. Prueba otra asignatura o dificultad.</div>';
    return;
  }
  const result = state.resultados[q._id];
  const selected = state.seleccion[q._id] || '';
  // Las preguntas de Competencia Lectora referencian el texto mediante textoId (T1, T2, etc.).
  // Mostrar el texto antes del enunciado para que el estudiante tenga el contexto necesario.
  const textoRelacionado = q.textoId ? state.textos.find(t => String(t._id) === String(q.textoId)) : null;
  const bloqueLectura = q.materia === 'lenguaje'
    ? (textoRelacionado
      ? `<article class="reading-passage"><span class="type">${escapeHtml(textoRelacionado.tipo || 'Texto de lectura')}</span><h3>${escapeHtml(textoRelacionado.titulo || 'Texto asociado')}</h3><p>${escapeHtml(textoRelacionado.contenido)}</p></article>`
      : `<div class="feedback bad"><strong>No se encontró el texto asociado.</strong> Esta pregunta referencia “${escapeHtml(q.textoId || 'sin textoId')}”. Revisa la relación en textos.json y MongoDB.</div>`)
    : '';
  const materiaLabel = ({ matematica: 'MATEMÁTICA M1', lenguaje: 'COMPETENCIA LECTORA', historia: 'HISTORIA Y CIENCIAS SOCIALES', ciencias: 'CIENCIAS' })[q.materia] || String(q.materia || 'PRÁCTICA').toUpperCase();
  $('question-area').innerHTML = `
    <p class="meta">${escapeHtml(materiaLabel)} · ${escapeHtml(q.eje)} · Nivel ${['','Inicial','Intermedio','Avanzado'][q.dificultad] || 'sin clasificar'}</p>
    <div class="question-alignment"><span><b>Habilidad:</b> ${escapeHtml(q.habilidadDEMRE || q.eje || 'Por clasificar')}</span><span><b>Contenido:</b> ${escapeHtml(q.contenidoDEMRE || 'Por revisar')}</span></div>
    ${bloqueLectura}
    <p class="question-text">${escapeHtml(q.enunciado)}</p>
    <div class="options">${q.alternativas.map(a => `<button class="option ${selected === a.letra ? 'selected' : ''}" data-option="${escapeAttr(a.letra)}" ${result ? 'disabled' : ''}><span class="letter">${escapeHtml(a.letra)}</span><span>${escapeHtml(a.texto)}</span></button>`).join('')}</div>
    ${result ? `<div class="feedback ${result.correcta ? 'good' : 'bad'}"><strong>${result.correcta ? '¡Muy bien! Respuesta correcta.' : 'Todavía puedes aprender de este error.'}</strong>Alternativa correcta: ${escapeHtml(result.alternativaCorrecta)}<br><b>Pista:</b> ${escapeHtml(result.pista || 'No hay pista registrada para esta pregunta.')}<br><b>Explicación:</b> ${escapeHtml(result.explicacion || 'No hay explicación registrada.')}</div>` : `<div class="answer-actions"><button class="primary" id="check-answer" ${selected ? '' : 'disabled'}>Comprobar respuesta</button><span class="muted">Intenta resolverla antes de ver la explicación.</span></div>`}
  `;
  document.querySelectorAll('[data-option]').forEach(button => button.addEventListener('click', () => {
    state.seleccion[q._id] = button.dataset.option;
    document.querySelectorAll('[data-option]').forEach(b => b.classList.toggle('selected', b.dataset.option === button.dataset.option));
    const check = $('check-answer'); if (check) check.disabled = false;
  }));
  const check = $('check-answer');
  if (check) check.addEventListener('click', () => submitAnswer(q));
}

async function submitAnswer(q) {
  const respuesta = state.seleccion[q._id];
  if (!respuesta) return;
  const button = $('check-answer'); if (button) button.disabled = true;
  try {
    state.resultados[q._id] = await api(`/api/preguntas/${encodeURIComponent(q._id)}/responder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respuesta })
    });
    renderQuestion();
    showMotivation(state.resultados[q._id], q);
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = error.message; }
  }
}


function showMotivation(result, question) {
  const modal = $('motivation-modal');
  if (!modal) return;
  const isCorrect = Boolean(result.correcta);
  $('motivation-emoji').textContent = isCorrect ? '🎉' : '💪';
  $('motivation-title').textContent = isCorrect ? '¡Lo lograste!' : '¡Cada intento te enseña!';
  $('motivation-message').textContent = isCorrect
    ? '¡Respuesta correcta! Estás avanzando paso a paso. Cada pregunta que resuelves te acerca a tu meta PAES.'
    : 'No te rindas. Equivocarse también es parte de aprender. Revisa la explicación, identifica la idea clave y vuelve a intentarlo en la próxima.';
  $('motivation-tip').textContent = isCorrect
    ? 'Este es uno de tus primeros desafíos superados. ¿Seguimos? ¡Tú puedes!'
    : `Tu próximo paso es aprender de esta pregunta${question && question.contenidoDEMRE ? ` sobre ${question.contenidoDEMRE}` : ''}. Vas construyendo tu preparación.`;
  $('motivation-continue').textContent = state.index < state.preguntas.length - 1 ? '¡Vamos con otra!' : 'Seguir practicando';
  modal.classList.toggle('celebration', isCorrect);
  modal.hidden = false;
  document.body.classList.add('modal-open');
  if (isCorrect) launchConfetti();
  $('motivation-continue').focus();
}

function closeMotivation(goNext = false) {
  const modal = $('motivation-modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('modal-open');
  document.querySelectorAll('.confetti-piece').forEach(piece => piece.remove());
  if (goNext && state.index < state.preguntas.length - 1) {
    state.index++;
    renderQuestion();
    $('question-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function launchConfetti() {
  const layer = $('confetti-layer');
  if (!layer) return;
  layer.replaceChildren();
  const symbols = ['✦', '●', '◆', '★', '✿'];
  for (let i = 0; i < 46; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.textContent = symbols[i % symbols.length];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    piece.style.setProperty('--drift', `${Math.round(Math.random() * 180 - 90)}px`);
    layer.appendChild(piece);
  }
}

async function loadTexts() {
  try {
    const data = await api('/api/textos');
    state.textos = data.textos;
    $('text-count').textContent = `${data.total} textos`;
    $('texts-area').innerHTML = data.textos.map(t => `<article class="text-card"><span class="type">${escapeHtml(t.tipo)}</span><h3>${escapeHtml(t.titulo)}</h3><details><summary>Leer texto</summary><p>${escapeHtml(t.contenido)}</p></details></article>`).join('');
  } catch (error) { $('texts-area').innerHTML = `<p class="muted">No se pudieron cargar los textos: ${escapeHtml(error.message)}</p>`; }
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(value) { return escapeHtml(value); }

async function init() {
  $('load-btn').addEventListener('click', loadQuestions);
  $('materia').addEventListener('change', async () => {
    if (state.allQuestions) {
      updateAxes();
      updateDifficultyOptions();
      await loadQuestions();
    }
  });
  $('eje').addEventListener('change', async () => {
    updateDifficultyOptions();
    await loadQuestions();
  });
  $('dificultad').addEventListener('change', loadQuestions);
  $('motivation-continue').addEventListener('click', () => closeMotivation(true));
  $('motivation-close').addEventListener('click', () => closeMotivation(false));
  $('motivation-modal').addEventListener('click', event => { if (event.target === $('motivation-modal')) closeMotivation(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('motivation-modal').hidden) closeMotivation(false); });
  $('prev-btn').addEventListener('click', () => { if (state.index > 0) { state.index--; renderQuestion(); } });
  $('next-btn').addEventListener('click', () => { if (state.index < state.preguntas.length - 1) { state.index++; renderQuestion(); } });
  await checkHealth();
  try {
    const data = await api('/api/preguntas');
    state.allQuestions = data.preguntas;
    state.ejes = new Set(state.allQuestions.map(q => q.eje));
    await loadTexts();
    updateAxes();
    updateDifficultyOptions();
    await loadQuestions();
  } catch (error) {
    $('question-area').innerHTML = `<div class="empty">${escapeHtml(error.message)}<br>Configura MongoDB y ejecuta el seed.</div>`;
  }
}
init();
