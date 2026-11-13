(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = window.StringAlgorithms;
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const showChar = ch => ch === ' ' ? '␠' : ch === '\n' ? '↵' : ch === '\t' ? '⇥' : ch;
  let algorithm = 'kmp';
  let traces = {};
  let positions = { kmp: 0, rk: 0 };
  let timer = null;
  let activePreset = 'basic';

  const pseudocode = {
    kmp: [
      'LPS[0] = 0; k = 1; len = 0',
      'while k < m:',
      '  if P[k] == P[len]:',
      '    len++; LPS[k] = len; k++',
      '  else if len > 0: len = LPS[len-1]',
      '  else: LPS[k] = 0; k++',
      'i = 0; j = 0',
      'while i < n:',
      '  if T[i] == P[j]:',
      '    i++; j++',
      '    if j == m:',
      '      results.add(i-m)',
      '      j = LPS[j-1]   // 겹침 유지',
      '  else if j > 0: j = LPS[j-1]',
      '  else: i++',
      'return results'
    ],
    rk: [
      'high = b^(m-1) mod q; pHash = h = 0',
      'for j = 0 .. m-1:',
      '  pHash = (pHash*b + code(P[j])) mod q',
      '  h = (h*b + code(T[j])) mod q',
      'for start = 0 .. n-m:',
      '  if h == pHash:',
      '    equal = true',
      '    for j = 0 .. m-1:',
      '      if T[start+j] != P[j]:',
      '        equal = false; break',
      '    if equal: results.add(start)',
      '  if start < n-m:',
      '    h = mod(h - code(T[start])*high, q)',
      '    h = (h*b + code(T[start+m])) mod q',
      'return results'
    ]
  };

  function codeLines(step) {
    if (algorithm === 'kmp') {
      const map = {init:[1],lpsCompare:[3],lpsStore:step.value === 0 ? [6] : [4],lpsFallback:[5],searchStart:[7],compare:[9],match:[10],mismatch:[9],found:[11,12],fallback:[step.j === traces.kmp.pattern.length ? 13 : 14],advance:[15],done:[16]};
      return map[step.kind] || [];
    }
    const map = {init:[1],hashBuild:[3,4],hashReady:[5],hashCompare:[6],verify:[8,9],collision:[10],found:[11],roll:[12,13,14],done:[15]};
    return map[step.kind] || [];
  }

  function current() { return traces[algorithm].steps[positions[algorithm]]; }
  function stop() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    $('play').textContent = '▶ 재생';
    $('play').setAttribute('aria-pressed', 'false');
  }

  function selectAlgorithm(value) {
    stop(); algorithm = value;
    for (const name of ['kmp','rk']) {
      $('tab-' + name).setAttribute('aria-selected', String(name === value));
      $('tab-' + name).tabIndex = name === value ? 0 : -1;
    }
    $('algorithm-panel').setAttribute('aria-labelledby', 'tab-' + value);
    render();
  }

  function setPosition(index, animate = false) {
    const previous = current();
    const oldIndex = positions[algorithm];
    positions[algorithm] = Math.max(0, Math.min(index, traces[algorithm].steps.length - 1));
    render(animate && Math.abs(positions[algorithm] - oldIndex) === 1 ? previous : null);
  }

  function updateInputCounts() {
    $('text-count').textContent = Array.from($('text-input').value).length + ' / 10';
    $('pattern-count').textContent = Array.from($('pattern-input').value).length + ' / 10';
  }

  function applyInput() {
    stop();
    const text = $('text-input').value, pattern = $('pattern-input').value;
    const n = Array.from(text).length, m = Array.from(pattern).length;
    updateInputCounts();
    $('input-error').textContent = '';
    for (const id of ['text-input','pattern-input']) $(id).removeAttribute('aria-invalid');
    if (!n || !m || n > 10 || m > 10) {
      $('input-error').textContent = '텍스트와 패턴을 각각 1~10자로 입력해 주세요.';
      if (!n || n > 10) $('text-input').setAttribute('aria-invalid','true');
      if (!m || m > 10) $('pattern-input').setAttribute('aria-invalid','true');
      return false;
    }
    traces = {
      kmp: api.buildKMPTrace(text, pattern),
      rk: api.buildRabinKarpTrace(text, pattern, {base:256, mod:Number($('mod-select').value)})
    };
    positions = { kmp:0, rk:0 };
    const preset = api.presets.find(item => item.text === text && item.pattern === pattern && item.mod === Number($('mod-select').value));
    activePreset = preset ? preset.id : '';
    for (const button of $('presets').children) button.setAttribute('aria-pressed', String(button.dataset.preset === activePreset));
    $('preset-description').textContent = preset ? preset.description : '직접 입력한 문자열입니다. 입력을 적용한 시점부터 두 알고리즘을 다시 실행합니다.';
    render();
    return true;
  }

  function loadPreset(preset) {
    $('text-input').value = preset.text;
    $('pattern-input').value = preset.pattern;
    $('mod-select').value = String(preset.mod);
    applyInput();
    if (preset.id === 'collision') selectAlgorithm('rk');
  }

  function cell(char, index, classes) {
    return '<div class="char-cell ' + classes + '" aria-label="인덱스 ' + index + ', ' + esc(char === ' ' ? '공백' : char) + '"><small>' + index + '</small><span>' + esc(showChar(char)) + '</span></div>';
  }

  function boardPosition(step, trace) {
    const moving = algorithm === 'kmp' && ['match', 'advance', 'fallback'].includes(step.kind);
    const i = moving ? step.nextI : step.i;
    const j = moving ? step.nextJ : step.j;
    const start = step.phase === 'preprocess' ? 0 : Math.max(0, moving ? i - j : step.start);
    const compare = algorithm === 'kmp' && step.phase === 'search' &&
      (moving || ['compare', 'mismatch', 'searchStart'].includes(step.kind));
    return {
      start,
      i,
      j,
      compare,
      textPointer: compare && i < trace.text.length && j < trace.pattern.length ? i : null,
      patternPointer: compare && i < trace.text.length && j < trace.pattern.length ? j : null
    };
  }

  function boardMarkup(step, trace) {
    const isPre = step.phase === 'preprocess';
    const noWindow = algorithm === 'rk' && trace.text.length < trace.pattern.length;
    const position = boardPosition(step, trace);
    const { start } = position;
    const windowVisible = algorithm === 'rk' && !noWindow && step.kind === 'hashReady';
    const hashBuild = algorithm === 'rk' && step.kind === 'hashBuild';
    const pointer = (index, label) => index === null ? '' :
      '<span class="board-pointer" style="--column:' + index + '" aria-hidden="true">' + label + '</span>';
    let textCells = '';
    trace.text.forEach((ch, i) => {
      let cls = '';
      const active = position.compare ? i === position.textPointer : step.activeText.includes(i);
      const found = step.matches.some(s => i >= s && i < s + trace.pattern.length);
      if (found && (algorithm === 'kmp' || !active || step.kind === 'found')) cls += ' found';
      if (windowVisible && i >= start && i < start + trace.pattern.length) cls += ' hash-window';
      if (algorithm === 'kmp' && step.phase === 'search' && step.kind !== 'found' &&
          i >= start && i < position.i && i < start + trace.pattern.length) cls += ' reused';
      if (hashBuild && i < step.i && i < trace.pattern.length) cls += ' hash-read';
      if (active) cls += step.equal === false ? ' current mismatch' : ' current';
      textCells += cell(ch,i,cls);
    });
    let patternCells = '';
    trace.pattern.forEach((ch, j) => {
      let cls = '';
      if (hashBuild && j < step.j) cls += ' hash-read';
      const active = position.compare ? j === position.patternPointer : step.activePattern.includes(j);
      if (active) cls += step.equal === false ? ' current mismatch' : ' current';
      if (step.kind === 'found') cls += ' found';
      patternCells += cell(ch,j,cls);
    });
    let note = '';
    if (isPre && algorithm === 'kmp') note = '전처리: P 안에서만 접두사와 접미사를 비교합니다.';
    else if (noWindow) note = '패턴이 텍스트보다 길어 완전한 검색 창이 없습니다.';
    else if (step.kind === 'fallback') note = '본문 i = ' + position.i + ' 유지 · 패턴 j: ' + step.j + ' → ' + position.j;
    else if (hashBuild) note = '현재 ' + (step.j + 1) + '번째 문자 · 앞서 해시에 반영한 문자는 옅게 표시';
    else if (step.phase === 'done') note = '검색 완료 · 초록색은 발견한 결과에 포함된 문자';
    else note = '패턴 정렬 시작 위치 = ' + start + ' · 공백 문자는 ␠로 표시';
    const outline = windowVisible ?
      '<span class="window-outline" style="--column:' + start + ';--count:' + trace.pattern.length + '" aria-hidden="true"></span>' : '';
    return '<div class="board-scroll"><div class="char-row"><span class="row-label">T</span><div class="char-track">' +
      textCells + outline + pointer(position.textPointer, 'i') + '</div></div>' +
      '<div class="char-row"><span class="row-label">P</span><div class="char-track"><div class="pattern-cells" style="grid-column:' +
      (start + 1) + ' / span ' + trace.pattern.length + '">' + patternCells + pointer(position.patternPointer, 'j') +
      '</div></div></div></div><div class="board-note">' + esc(note) + '</div>';
  }

  function animateBoard(previous, step, trace) {
    if (!previous || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const before = boardPosition(previous, trace);
    const after = boardPosition(step, trace);
    const board = $('board');
    const track = board.querySelector('.char-track');
    const cellWidth = track.firstElementChild.offsetWidth;
    const pitch = cellWidth + parseFloat(getComputedStyle(track).columnGap);
    const options = { duration: 185, easing: 'cubic-bezier(.22,.7,.3,1)' };
    const slide = (element, from, to) => {
      if (element && from !== null && to !== null && from !== to) {
        element.animate([{ transform: 'translateX(' + ((from - to) * pitch) + 'px)' },
          { transform: 'translateX(0)' }], options);
      }
    };
    if (step.phase === 'search' && previous.phase === 'search') {
      slide(board.querySelector('.pattern-cells'), before.start, after.start);
      slide(board.querySelector('.char-row:first-child .board-pointer'), before.textPointer, after.textPointer);
      slide(board.querySelector('.pattern-cells .board-pointer'), before.patternPointer, after.patternPointer);
    }
  }

  function rollingFormula({ before, outgoing, high, base, incoming, mod, after }) {
    return '((' + before + ' − ' + outgoing + ' × ' + high + ') × ' + base +
      ' + ' + incoming + ') mod ' + mod + ' = ' + after;
  }

  function windowVerdict(compare, latest, chars, pattern) {
    const pair = compare.windowHash + (compare.equal ? ' = ' : ' ≠ ') + compare.patternHash;
    if (!compare.equal) return [pair + ' → 다른 문자열', '문자 검증 없이 이 창 제외'];
    if (latest.kind === 'found') return [
      pair + ' → ' + chars.map(showChar).join(', ') + ' 직접 비교',
      '모든 문자가 같아 시작 위치 ' + compare.start + ' 기록'
    ];
    if (latest.kind === 'collision') return [
      pair + ' → 해시 충돌',
      'T[' + latest.i + ']와 P[' + latest.j + ']가 달라 이 창 제외'
    ];
    if (latest.kind === 'verify') return [
      pair + ' → 실제 문자 검증',
      'T[' + latest.i + ']의 ' + showChar(chars[latest.j]) + (latest.equal ? ' = ' : ' ≠ ') +
        'P[' + latest.j + ']의 ' + showChar(pattern[latest.j])
    ];
    return [pair + ' → 해시 일치', '같은 문자열인지 실제 문자를 확인합니다.'];
  }

  function windowFlowMarkup(step, trace, index) {
    const windows = [];
    for (const [i, event] of trace.steps.entries()) {
      if (event.kind === 'hashCompare') {
        windows.push({ compare: event, index: i, latest: event });
      } else if (event.kind === 'roll') {
        windows.at(-1).roll = { event, index: i };
      } else if (i <= index && ['verify', 'found', 'collision'].includes(event.kind)) {
        windows.at(-1).latest = event;
      }
    }
    if (!windows.length) return '<p class="window-empty">패턴이 본문보다 길어 완전한 검색 창이 없습니다.</p>';
    const length = trace.pattern.length;
    const rows = windows.map(({ compare, latest, roll, index: comparedAt }) => {
      const { start, windowHash } = compare;
      const chars = trace.text.slice(start, start + length);
      const reached = comparedAt <= index || (step.kind === 'roll' && step.start === start);
      const active = step.phase === 'search' && step.start === start;
      const verdict = comparedAt <= index ? windowVerdict(compare, latest, chars, trace.pattern) :
        [reached ? '해시 갱신 완료' : '비교 대기', reached ? '다음 단계에서 패턴 해시와 비교합니다.' : ''];
      const rowClass = ['window-row', reached ? '' : 'is-pending',
        latest.kind === 'found' ? 'is-found' : '', active ? 'is-active' : ''].join(' ');
      const row = '<div class="' + rowClass + '" data-start="' + start + '"' +
        (active ? ' aria-current="step"' : '') + '><div class="window-data"><div><code>s = ' + start +
        '</code> · <strong>' + esc(chars.map(showChar).join('')) + '</strong></div>' +
        '<code>windowHash = ' + (reached ? windowHash : '—') + '</code></div>' +
        '<div class="window-verdict"><strong>' + esc(verdict[0]) + '</strong><span>' + esc(verdict[1]) + '</span></div></div>';
      if (!roll) return row;
      const visible = roll.index <= index;
      const rolling = roll.event.rolling;
      return row + '<div class="window-roll' + (roll.index === index ? ' is-active' : '') +
        (visible ? '' : ' is-pending') + '" data-from="' + start + '"><span aria-hidden="true">↓</span>' +
        (visible ? '<span>' + esc(showChar(rolling.outgoingChar)) + ' 제거 · ' + esc(showChar(rolling.incomingChar)) +
          ' 추가</span><span aria-hidden="true">→</span><code>' + esc(rollingFormula(rolling)) + '</code>' :
          '<span>다음 창으로 한 칸 이동</span>') +
        '</div>';
    });
    const summary = step.phase === 'done' ? '<p class="window-summary">해시 비교 ' + step.stats.hashComparisons +
      '회 · 실제 문자 비교 ' + step.stats.searchComparisons + '회 · 롤링 갱신 ' + step.stats.hashUpdates + '회</p>' : '';
    return '<div class="window-flow" aria-label="창마다 해시를 비교하고 갱신하는 과정">' + rows.join('') + '</div>' + summary;
  }

  function hashCalculation(label, before, char, base, mod, after) {
    const code = char.codePointAt(0);
    return '<div class="hash-calculation"><span>' + label + '</span><code>(' + before + ' × ' + base +
      ' + ' + code + ') mod ' + mod + ' = <strong>' + after + '</strong> <span class="hash-character">(' +
      esc(showChar(char)) + ' = ' + code + ')</span></code></div>';
  }

  function initialHashMarkup(step, trace, noWindow) {
    const count = step.kind === 'hashReady' ? trace.pattern.length : step.kind === 'hashBuild' ? step.j + 1 : 0;
    const heading = '<div class="mechanism-title">초기 해시 <span>' + count + ' / ' + trace.pattern.length +
      '자 · b = ' + trace.base + ' · q = ' + trace.mod + '</span></div>';
    if (step.kind === 'hashBuild') {
      const pattern = hashCalculation('패턴', step.previousPatternHash, trace.pattern[step.j], trace.base, trace.mod, step.patternHash);
      const firstWindow = noWindow ? '<div class="hash-calculation"><span>첫 창</span><span>완전한 창 없음</span></div>' :
        hashCalculation('첫 창', step.previousWindowHash, trace.text[step.j], trace.base, trace.mod, step.windowHash);
      return heading + pattern + firstWindow;
    }
    const values = '<div class="hash-values"><span>패턴 <strong>' + step.patternHash +
      '</strong></span><span>첫 창 <strong>' + (noWindow ? '—' : step.windowHash) + '</strong></span></div>';
    if (step.kind === 'hashReady') {
      return heading + values + '<div class="hash-formula">' + (noWindow ? '완전한 창이 없어 검색을 종료합니다.' : '초기 해시 계산 완료 · 다음 단계에서 첫 창과 비교합니다.') + '</div>';
    }
    return heading + values + '<div class="hash-formula">패턴과 첫 창의 해시를 0으로 시작합니다.</div>';
  }

  function highMarkup(trace) {
    const exponent = trace.pattern.length - 1;
    const { base, mod } = trace;
    let value = 1;
    const equations = [base + '^0 mod ' + mod + ' = 1'];
    for (let k = 1; k <= exponent; k++) {
      const next = (value * base) % mod;
      equations.push('(' + value + ' × ' + base + ') mod ' + mod + ' = ' + next);
      value = next;
    }
    const explanation = '길이 ' + trace.pattern.length + '인 창의 첫 문자 뒤에 ' + exponent +
      '자가 있으므로 첫 문자의 자릿값은 ' + base + '^' + exponent + '입니다.';
    return '<p>' + explanation + '</p><ol class="high-calculations">' +
      equations.map(equation => '<li><code>' + equation + '</code></li>').join('') +
      '</ol><p class="high-purpose">high = ' + trace.high +
      '를 저장합니다. 창을 옮길 때 기존 해시에서 첫 문자 코드 × high를 빼면 그 문자의 기여를 없앨 수 있습니다.</p>';
  }

  function mechanismMarkup(step, trace) {
    if (algorithm === 'kmp') {
      const cells = step.lps.map((value,i) => '<div class="lps-cell ' + (i === step.lookupIndex ? 'lookup ' : '') + (i === step.storedIndex ? 'store' : '') + '"><small>' + i + '</small>' + (i > step.lpsBuiltThrough ? '·' : value) + '</div>').join('');
      const caption = step.lookupIndex !== undefined ? '읽은 값: LPS[' + step.lookupIndex + '] = ' + step.lps[step.lookupIndex] : step.phase === 'preprocess' ? '· 아직 계산 전 / 0도 계산을 마친 값입니다.' : '일치한 부분의 접미사를 다음 후보의 접두사로 재사용합니다.';
      return '<div class="mechanism-title">LPS 배열 <span>진접두사 = 접미사인 최대 길이</span></div><div class="lps-track">' + cells + '</div><div class="lps-caption">' + esc(caption) + '</div>';
    }
    const noWindow = trace.text.length < trace.pattern.length;
    return initialHashMarkup(step, trace, noWindow);
  }

  function renderVariables(step, trace) {
    let values;
    if (algorithm === 'kmp' && step.phase === 'preprocess') {
      values = [['k',step.i],['len',step.j]];
      if (step.nextJ !== undefined) values.push(['다음 len',step.nextJ]);
    } else if (algorithm === 'kmp') {
      values = [['i',step.i],['j',step.j]];
      if (step.nextI !== undefined) values.push(['다음 i',step.nextI],['다음 j',step.nextJ]);
    } else {
      values = step.phase === 'preprocess' ? [['q',trace.mod],['high',trace.high]] :
        [['start',step.start],['검증 j',step.j],['q',trace.mod],['high',trace.high]];
    }
    $('variables').innerHTML = values.map(([name,value]) => '<span class="variable">' + esc(name) + ' = <b>' + esc(value) + '</b></span>').join('');
  }

  function renderStats(step) {
    const stats = step.stats;
    let labels = [['검색 문자 비교',stats.searchComparisons]];
    if (algorithm === 'kmp') labels.unshift(['LPS 전처리 문자 비교',stats.preprocessComparisons]);
    else labels.push(['창 해시 비교',stats.hashComparisons],['창 해시 갱신',stats.hashUpdates],['거절한 충돌 창',stats.collisions]);
    $('current-stats').innerHTML = labels.map(([label,value]) => '<div class="stat-item"><span>' + label + '</span><strong>' + value + '</strong></div>').join('');
  }

  function eventTargets(trace) {
    const find = fn => trace.steps.findIndex(fn);
    return algorithm === 'kmp' ? [
      ['검색 시작',find(s=>s.kind === 'searchStart')],
      ['불일치 후 이동',find(s=>s.kind === 'fallback' && s.j < trace.pattern.length)],
      ['첫 정답',find(s=>s.kind === 'found')],
      ['끝',trace.steps.length - 1]
    ] : [
      ['첫 해시 비교',find(s=>s.kind === 'hashCompare')],
      ['첫 해시 갱신',find(s=>s.kind === 'roll')],
      ['해시 충돌',find(s=>s.kind === 'collision')],
      ['첫 정답',find(s=>s.kind === 'found')],
      ['끝',trace.steps.length - 1]
    ];
  }

  function render(previous) {
    const trace = traces[algorithm], step = current(), index = positions[algorithm], last = trace.steps.length - 1;
    const showWindows = algorithm === 'rk' && step.phase !== 'preprocess';
    $('phase-badge').textContent = {preprocess:'전처리',search:'검색',done:'검색 완료'}[step.phase];
    $('step-label').textContent = 'STEP ' + String(index).padStart(2,'0');
    $('step-fraction').textContent = index + ' / ' + last;
    $('step-title').textContent = step.title;
    $('step-explanation').textContent = step.explanation;
    const highDetails = $('high-explanation');
    highDetails.hidden = algorithm !== 'rk' || step.kind !== 'init' || trace.text.length < trace.pattern.length;
    highDetails.innerHTML = highDetails.hidden ? '' : highMarkup(trace);
    $('focus-note').textContent = algorithm === 'kmp' ? (step.phase === 'preprocess' ? 'LPS는 패턴만 보고 미리 계산합니다. 이후 검색에서 이미 확인한 접미사를 재사용합니다.' : '이동 단계에는 현재 값과 다음 값을 함께 표시합니다. i를 뒤로 되돌리는 단계는 없습니다.') : '해시 일치는 검증할 후보라는 뜻입니다. 모든 실제 문자가 같아야 정답에 넣습니다.';
    $('visual-caption').textContent = showWindows ? '창별 해시 비교와 갱신' : step.phase === 'preprocess' ?
      (algorithm === 'kmp' ? '패턴 내부 전처리 · LPS 구성' : '패턴과 첫 창 · 초기 해시') : '텍스트와 패턴 · 현재 정렬';
    $('board-legend').hidden = showWindows;
    $('window-context').hidden = !showWindows;
    $('window-context').textContent = showWindows ? '패턴 ' + trace.pattern.map(showChar).join('') +
      ' · 패턴 해시 ' + step.patternHash + ' · b = ' + trace.base + ' · q = ' + trace.mod + ' · high = ' + trace.high : '';
    const scroll = $('board').querySelector('.board-scroll')?.scrollLeft || 0;
    $('board').classList.toggle('shows-windows', showWindows);
    $('board').innerHTML = showWindows ? windowFlowMarkup(step, trace, index) : boardMarkup(step, trace);
    if (!showWindows) {
      $('board').querySelector('.board-scroll').scrollLeft = scroll;
      animateBoard(previous, step, trace);
    }
    $('mechanism').hidden = showWindows;
    $('mechanism').innerHTML = showWindows ? '' : mechanismMarkup(step, trace);
    if (previous && step.kind === 'hashBuild' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const value of $('mechanism').querySelectorAll('.hash-calculation strong')) {
        value.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      }
    }
    $('current-matches').textContent = step.matches.length ? '[' + step.matches.join(', ') + ']' : step.phase === 'done' ? '일치 없음 []' : '아직 없음';
    $('prev').disabled = index === 0;
    $('next').disabled = index === last;
    $('reset').disabled = index === 0;
    $('timeline').max = last;
    $('timeline').value = index;
    $('timeline').setAttribute('aria-valuetext', index + '단계: ' + step.title);
    $('timeline-description').textContent = index === last ? '완료' : Math.round(index / last * 100) + '%';
    $('event-buttons').innerHTML = eventTargets(trace).map(([label,target])=>'<button type="button" data-target="' + target + '"' + (target < 0 ? ' disabled title="현재 입력에서는 발생하지 않습니다"' : '') + '>' + label + '</button>').join('');
    for (const button of $('event-buttons').children) button.addEventListener('click',()=>{stop();setPosition(Number(button.dataset.target));});
    $('code-assumption').textContent = algorithm === 'rk' ? '아래 코드는 m ≤ n 기준입니다. m > n이면 완전한 창이 없어 검색 결과는 []입니다.' : '';
    const lines = codeLines(step);
    $('pseudocode').innerHTML = pseudocode[algorithm].map((line,i)=>'<li' + (lines.includes(i+1) ? ' class="active" aria-current="step"' : '') + '>' + esc(line) + '</li>').join('');
    $('code-line-label').textContent = lines.length ? 'L' + lines.join(' · L') : '';
    // Keep the highlighted code visible without scrolling the whole document.
    const list = $('pseudocode'), selected = list.querySelector('.active');
    if (selected) list.scrollTop = Math.max(0, selected.offsetTop - list.firstElementChild.offsetTop - 40);
    renderVariables(step,trace); renderStats(step);
    if (index === last) stop();
  }

  function togglePlay() {
    if (timer !== null) {stop();return;}
    if (positions[algorithm] === traces[algorithm].steps.length - 1) setPosition(0);
    $('play').textContent = 'Ⅱ 일시정지';
    $('play').setAttribute('aria-pressed','true');
    timer = window.setInterval(()=>setPosition(positions[algorithm]+1, true),Number($('speed').value));
  }

  function download(content,type,name) {
    const url = URL.createObjectURL(new Blob([content],{type}));
    const a = document.createElement('a'); a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),5000);
  }

  function exportSVG() {
    stop();
    const step = current(), trace = traces[algorithm], position = boardPosition(step, trace);
    const width = Math.max(1060, 127 + Math.max(trace.text.length, position.start + trace.pattern.length) * 50), height = 535;
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 '+width+' '+height+'"><rect width="100%" height="100%" fill="#fafbf9"/><g font-family="Malgun Gothic,Arial,sans-serif" fill="#173a52"><text x="42" y="39" font-size="13" letter-spacing="2">STRINGS LAB / '+ (algorithm === 'kmp' ? 'KMP' : 'RABIN–KARP') +'</text><text x="42" y="79" font-size="24" font-weight="bold">STEP '+String(positions[algorithm]).padStart(2,'0')+' · '+esc(step.title)+'</text>';
    const size=45,gap=5,left=85,start=position.start;
    const row=(chars,y,offset,label)=>{
      svg+='<text x="43" y="'+(y+33)+'" font-size="20">'+label+'</text>';
      chars.forEach((ch,i)=>{
        const pointer = label === 'T' ? position.textPointer : position.patternPointer;
        const active = position.compare ? i === pointer : (label === 'T' ? step.activeText : step.activePattern).includes(i);
        const fill=active?(step.equal===false?'#fae9e3':'#e5f1fa'):'#fff';
        const x=left+(i+offset)*(size+gap);
        svg+='<rect x="'+x+'" y="'+y+'" width="'+size+'" height="52" rx="5" fill="'+fill+'" stroke="#b4c8d0"/><text x="'+(x+size/2)+'" y="'+(y+13)+'" text-anchor="middle" font-size="9" fill="#667984">'+i+'</text><text x="'+(x+size/2)+'" y="'+(y+40)+'" text-anchor="middle" font-size="22">'+esc(showChar(ch))+'</text>';
      });
    };
    row(trace.text,115,0,'T');row(trace.pattern,180,start,'P');
    const windowHash = trace.text.length < trace.pattern.length ? '—' : step.windowHash;
    const mechanism=algorithm==='kmp'?'LPS = ['+step.lps.map((v,i)=>i>step.lpsBuiltThrough?'·':v).join(', ')+']':'patternHash = '+step.patternHash+' / windowHash = '+windowHash+' / b = '+trace.base+' / q = '+trace.mod;
    svg+='<text x="42" y="272" font-size="16">'+esc(mechanism)+'</text>';
    const vars=algorithm==='kmp'?'i = '+step.i+' / j = '+step.j+(step.nextJ!==undefined?' → 다음 i = '+step.nextI+' / 다음 j = '+step.nextJ:''):'start = '+step.start+' / j = '+step.j+' / high = '+step.high;
    svg+='<text x="42" y="306" font-size="13">'+esc(vars)+'</text>';
    // Break text by code points so Korean remains legible in standalone SVGs.
    const parts=Array.from(step.explanation),perLine=66;
    for(let i=0;i<parts.length;i+=perLine) svg+='<text x="42" y="'+(345+Math.floor(i/perLine)*23)+'" font-size="13">'+esc(parts.slice(i,i+perLine).join(''))+'</text>';
    svg+='<text x="42" y="468" font-size="14">현재까지 발견한 시작 위치: ['+step.matches.join(', ')+']</text><text x="42" y="502" fill="#667984" font-size="11">인덱스는 0부터 / 단계 그림은 실행 기록의 스냅샷 / 전체 실행 시간 비교가 아닙니다.</text></g></svg>';
    download(svg,'image/svg+xml;charset=utf-8','strings-lab-'+algorithm+'-step-'+positions[algorithm]+'.svg');
  }

  $('presets').innerHTML = api.presets.map(p=>'<button type="button" class="preset-button" data-preset="'+p.id+'" aria-pressed="'+(p.id==='basic')+'">'+esc(p.label)+'</button>').join('');
  for (const button of $('presets').children) button.addEventListener('click',()=>loadPreset(api.presets.find(p=>p.id===button.dataset.preset)));
  $('input-form').addEventListener('submit',event=>{event.preventDefault();applyInput();});
  for (const id of ['text-input','pattern-input']) $(id).addEventListener('input',updateInputCounts);
  for (const name of ['kmp','rk']) $('tab-'+name).addEventListener('click',()=>selectAlgorithm(name));
  document.querySelector('.algorithm-tabs').addEventListener('keydown',event=>{
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      selectAlgorithm(event.key === 'Home' ? 'kmp' : event.key === 'End' ? 'rk' : algorithm === 'kmp' ? 'rk' : 'kmp');
      $('tab-'+algorithm).focus();
    }
  });
  $('prev').addEventListener('click',()=>{stop();setPosition(positions[algorithm]-1, true);});
  $('next').addEventListener('click',()=>{stop();setPosition(positions[algorithm]+1, true);});
  $('reset').addEventListener('click',()=>{stop();setPosition(0);});
  $('play').addEventListener('click',togglePlay);
  $('speed').addEventListener('change',()=>{if(timer!==null){stop();togglePlay();}});
  $('timeline').addEventListener('input',event=>{stop();setPosition(Number(event.target.value));});
  $('export-svg').addEventListener('click',exportSVG);
  $('export-json').addEventListener('click',()=>{stop();download(JSON.stringify({format:'strings-lab-v1',input:{text:traces.kmp.text.join(''),pattern:traces.kmp.pattern.join(''),base:traces.rk.base,mod:traces.rk.mod},currentAlgorithm:algorithm,currentStep:positions[algorithm],traces},null,2),'application/json','strings-lab-trace.json');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stop();});
  applyInput();
})();
