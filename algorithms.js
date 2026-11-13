(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StringAlgorithms = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function inputArrays(text, pattern) {
    if (typeof text !== 'string' || typeof pattern !== 'string') {
      throw new TypeError('텍스트와 패턴은 문자열이어야 합니다.');
    }
    const t = Array.from(text);
    const p = Array.from(pattern);
    if (t.length === 0 || p.length === 0) throw new RangeError('텍스트와 패턴을 모두 입력하세요.');
    return [t, p];
  }

  function emptyStats() {
    return { preprocessComparisons: 0, searchComparisons: 0, hashComparisons: 0, hashUpdates: 0, collisions: 0 };
  }

  function buildKMPTrace(text, pattern) {
    const [t, p] = inputArrays(text, pattern);
    const lps = new Array(p.length).fill(0);
    const stats = emptyStats();
    const matches = [];
    const steps = [];
    let builtThrough = 0;
    function add(phase, kind, title, explanation, details) {
      steps.push(Object.assign({
        phase, kind, title, explanation,
        i: 0, j: 0, start: 0,
        activeText: [], activePattern: [],
        lps: lps.slice(), lpsBuiltThrough: builtThrough,
        matches: matches.slice(), stats: Object.assign({}, stats)
      }, details || {}));
    }

    add('preprocess', 'init', 'LPS 표 만들기',
      'LPS[j]는 P[0..j]의 접두사이면서 접미사인 가장 긴 문자열의 길이입니다. 문자열 전체는 제외하므로 LPS[0] = 0입니다.',
      { i: 1, j: 0, activePattern: [0] });
    let k = 1;
    let len = 0;
    while (k < p.length) {
      const equal = p[k] === p[len];
      let outcome = '재사용할 접두사가 없으므로 0을 저장합니다.';
      if (equal) outcome = '같으므로 공통 길이를 늘릴 수 있습니다.';
      else if (len > 0) outcome = '다르므로 더 짧은 접두사를 확인합니다.';
      stats.preprocessComparisons += 1;
      add('preprocess', 'lpsCompare', '접두사와 접미사 비교',
        `P[${k}] = '${p[k]}'와 P[${len}] = '${p[len]}'를 비교합니다. ${outcome}`,
        { i: k, j: len, equal, activePattern: [k, len] });
      if (equal) {
        len += 1;
        lps[k] = len;
        builtThrough = k;
        add('preprocess', 'lpsStore', `LPS[${k}] = ${len}`,
          `공통 접두사·접미사의 길이가 ${len}이므로 저장한 뒤 다음 칸으로 이동합니다.`,
          { i: k, j: len - 1, storedIndex: k, value: len, nextI: k + 1, nextJ: len, activePattern: [k] });
        k += 1;
      } else if (len > 0) {
        const oldLen = len;
        len = lps[len - 1];
        add('preprocess', 'lpsFallback', '더 짧은 접두사 재사용',
          `len = LPS[${oldLen - 1}] = ${len}으로 바꿉니다. 현재 위치 ${k}는 그대로 두고 다시 비교합니다.`,
          { i: k, j: oldLen, nextI: k, nextJ: len, lookupIndex: oldLen - 1, activePattern: [k, len] });
      } else {
        lps[k] = 0;
        builtThrough = k;
        add('preprocess', 'lpsStore', `LPS[${k}] = 0`,
          '재사용할 공통 접두사가 없으므로 0을 저장하고 다음 칸으로 이동합니다.',
          { i: k, j: 0, storedIndex: k, value: 0, nextI: k + 1, nextJ: 0, activePattern: [k] });
        k += 1;
      }
    }

    let i = 0;
    let j = 0;
    add('search', 'searchStart', '텍스트 검색 시작',
      'i는 텍스트 위치, j는 패턴 위치입니다. 불일치가 나도 i를 뒤로 돌리지 않고 LPS로 j를 바꿉니다.');
    while (i < t.length) {
      const equal = t[i] === p[j];
      stats.searchComparisons += 1;
      add('search', 'compare', '현재 문자 비교',
        `T[${i}] = '${t[i]}'와 P[${j}] = '${p[j]}'를 비교합니다.`,
        { i, j, start: i - j, equal, activeText: [i], activePattern: [j] });
      if (equal) {
        add('search', 'match', '문자 일치 → 둘 다 전진',
          `문자가 같으므로 i는 ${i + 1}, j는 ${j + 1}로 이동합니다.`,
          { i, j, start: i - j, equal: true, nextI: i + 1, nextJ: j + 1, activeText: [i], activePattern: [j] });
        i += 1;
        j += 1;
        if (j === p.length) {
          const start = i - j;
          matches.push(start);
          add('search', 'found', `패턴 발견 · 위치 ${start}`,
            `T[${start}..${i - 1}]가 패턴 전체와 같습니다. 겹치는 다음 일치도 검색합니다.`,
            { i: i - 1, j: j - 1, start, nextI: i, nextJ: lps[j - 1], activeText: Array.from({ length: p.length }, (_, x) => start + x), activePattern: Array.from({ length: p.length }, (_, x) => x) });
          const oldJ = j;
          j = lps[j - 1];
          add('search', 'fallback', '겹치는 접두사 유지',
            `j = LPS[${oldJ - 1}] = ${j}로 바꾸고 i = ${i}를 유지합니다. 이미 일치한 접미사를 다음 후보의 접두사로 재사용합니다.`,
            { i, j: oldJ, start: i - j, nextI: i, nextJ: j, lookupIndex: oldJ - 1 });
        }
      } else {
        add('search', 'mismatch', '문자 불일치',
          j > 0 ? '앞에서 일치한 부분이 있으므로 LPS를 이용해 패턴 위치만 바꿉니다.' : '일치한 접두사가 없으므로 텍스트의 다음 문자를 확인합니다.',
          { i, j, start: i - j, equal: false, activeText: [i], activePattern: [j] });
        if (j > 0) {
          const oldJ = j;
          j = lps[j - 1];
          add('search', 'fallback', 'i 유지 · j만 되돌리기',
            `j = LPS[${oldJ - 1}] = ${j}. T[${i}]는 아직 처리하지 않았으므로 i = ${i}를 유지한 채 다시 비교합니다.`,
            { i, j: oldJ, start: i - j, nextI: i, nextJ: j, lookupIndex: oldJ - 1, activeText: [i], activePattern: [j] });
        } else {
          add('search', 'advance', '다음 텍스트 문자로',
            `j = 0이므로 재사용할 접두사가 없습니다. i를 ${i + 1}로 이동합니다.`,
            { i, j, start: i, nextI: i + 1, nextJ: 0, activeText: [i] });
          i += 1;
        }
      }
    }
    add('done', 'done', 'KMP 검색 완료',
      matches.length ? `모든 일치 시작 위치: ${matches.join(', ')}. 인덱스는 0부터 셉니다.` : '텍스트 안에 패턴과 같은 부분 문자열이 없습니다.',
      { i: t.length, j, start: t.length - j });
    return { algorithm: 'kmp', text: t, pattern: p, steps, matches: matches.slice(), stats: Object.assign({}, stats), lps: lps.slice() };
  }

  function buildRabinKarpTrace(text, pattern, options) {
    const [t, p] = inputArrays(text, pattern);
    const { base = 256, mod = 101 } = options || {};
    if (!Number.isSafeInteger(base) || !Number.isSafeInteger(mod) || base < 2 || mod < 2 || base > 1000000 || mod > 1000000) {
      throw new RangeError('base와 mod는 2 이상 1,000,000 이하의 정수여야 합니다.');
    }
    const stats = emptyStats();
    const matches = [];
    const steps = [];
    const m = p.length;
    const code = ch => ch.codePointAt(0);
    const norm = value => ((value % mod) + mod) % mod;
    let patternHash = 0;
    let windowHash = 0;
    let high = 1;
    for (let k = 1; k < m; k += 1) high = (high * base) % mod;
    function add(phase, kind, title, explanation, details) {
      steps.push(Object.assign({
        phase, kind, title, explanation,
        i: 0, j: 0, start: 0,
        activeText: [], activePattern: [],
        patternHash, windowHash, base, mod, high,
        matches: matches.slice(), stats: Object.assign({}, stats)
      }, details || {}));
    }
    add('preprocess', 'init', '문자열을 숫자 지문으로',
      `유니코드 코드 포인트 값을 사용해 h = (h × ${base} + 문자 값) mod ${mod}로 해시를 만듭니다. high = ${base}^${m - 1} mod ${mod} = ${high}입니다.`);
    for (let k = 0; k < m; k += 1) {
      const previousPattern = patternHash;
      const previousWindow = windowHash;
      patternHash = (patternHash * base + code(p[k])) % mod;
      if (k < t.length) windowHash = (windowHash * base + code(t[k])) % mod;
      add('preprocess', 'hashBuild', `초기 해시 · ${k + 1}/${m}`,
        `패턴: (${previousPattern} × ${base} + ${code(p[k])}) mod ${mod} = ${patternHash}. ` +
        (k < t.length ? `텍스트: (${previousWindow} × ${base} + ${code(t[k])}) mod ${mod} = ${windowHash}.` : '텍스트가 패턴보다 짧아 완전한 검색 창을 만들 수 없습니다.'),
        { i: k, j: k, activeText: k < t.length ? [k] : [], activePattern: [k], previousPatternHash: previousPattern, previousWindowHash: previousWindow });
    }
    add('preprocess', 'hashReady', '초기 해시 준비 완료',
      t.length >= m ? `패턴 해시 = ${patternHash}, 첫 검색 창 해시 = ${windowHash}. 이제 길이 ${m}의 창을 한 칸씩 이동합니다.` : '텍스트보다 패턴이 길기 때문에 일치할 수 없습니다.');
    if (t.length >= m) {
      for (let start = 0; start <= t.length - m; start += 1) {
        const equal = patternHash === windowHash;
        stats.hashComparisons += 1;
        add('search', 'hashCompare', equal ? '해시 일치 → 문자 검증' : '해시 불일치 → 후보 제외',
          equal ? `${windowHash} = ${patternHash}. 해시가 같아도 문자열이 다를 수 있으므로 직접 비교합니다.` : `${windowHash} ≠ ${patternHash}. 문자열이 같으면 해시도 같으므로 이 창은 제외합니다.`,
          { i: start, j: 0, start, equal, activeText: Array.from({ length: m }, (_, x) => start + x) });
        if (equal) {
          let verified = true;
          for (let j = 0; j < m; j += 1) {
            const sameChar = t[start + j] === p[j];
            stats.searchComparisons += 1;
            add('search', 'verify', sameChar ? '실제 문자 검증 · 일치' : '실제 문자 검증 · 불일치',
              `T[${start + j}] = '${t[start + j]}'와 P[${j}] = '${p[j]}'를 직접 비교합니다.`,
              { i: start + j, j, start, equal: sameChar, activeText: [start + j], activePattern: [j] });
            if (!sameChar) {
              verified = false;
              stats.collisions += 1;
              add('search', 'collision', '해시 충돌 · 일치에서 제외',
                `해시는 ${patternHash}로 같지만 실제 문자는 다릅니다. 검증 덕분에 잘못된 검색 결과를 막았습니다.`,
                { i: start + j, j, start, equal: false, activeText: [start + j], activePattern: [j] });
              break;
            }
          }
          if (verified) {
            matches.push(start);
            add('search', 'found', `패턴 발견 · 위치 ${start}`,
              `모든 ${m}개 문자가 같음을 확인했습니다. 다음 창도 검사하여 겹치는 일치를 찾습니다.`,
              { i: start + m - 1, j: m - 1, start, activeText: Array.from({ length: m }, (_, x) => start + x), activePattern: Array.from({ length: m }, (_, x) => x) });
          }
        }
        if (start < t.length - m) {
          const before = windowHash;
          const outgoing = code(t[start]);
          const incoming = code(t[start + m]);
          const removed = norm(before - outgoing * high);
          windowHash = (removed * base + incoming) % mod;
          stats.hashUpdates += 1;
          const rolling = { before, outgoing, outgoingChar: t[start], incoming, incomingChar: t[start + m], high, removed, after: windowHash, base, mod };
          add('search', 'roll', '한 칸 이동 · 해시 재사용',
            `앞 문자 '${t[start]}'의 기여를 빼고 뒤 문자 '${t[start + m]}'를 더합니다. ((${before} - ${outgoing} × ${high}) × ${base} + ${incoming}) mod ${mod} = ${windowHash}. mod는 음수를 0 이상으로 정규화합니다.`,
            { i: start + m, j: 0, start: start + 1, previousStart: start, nextI: start + 1, rolling, activeText: [start, start + m] });
        }
      }
    }
    add('done', 'done', 'Rabin–Karp 검색 완료',
      matches.length ? `모든 일치 시작 위치: ${matches.join(', ')}. 해시 충돌 ${stats.collisions}건은 실제 문자 검증으로 제외했습니다.` : `일치하는 부분 문자열이 없습니다. 해시 충돌 ${stats.collisions}건은 실제 문자 검증으로 제외했습니다.`,
      { i: t.length, j: 0, start: Math.max(0, t.length - m) });
    return { algorithm: 'rk', text: t, pattern: p, steps, matches: matches.slice(), stats: Object.assign({}, stats), base, mod, high, patternHash };
  }

  const presets = [
    { id: 'basic', label: '기본 · LPS 재사용', text: 'ABABCABAB', pattern: 'ABAB', base: 256, mod: 101, description: '위치 0과 5에서 발견합니다. KMP의 불일치와 LPS 이동을 관찰하세요.' },
    { id: 'repeat', label: '반복 문자', text: 'AAAAAAAAAB', pattern: 'AAAAB', base: 256, mod: 101, description: '반복되는 A 뒤의 B를 찾습니다. KMP가 i를 유지한 채 j를 바꾸는 이유를 살펴보세요.' },
    { id: 'overlap', label: '겹치는 일치', text: 'ABABABABA', pattern: 'ABA', base: 256, mod: 101, description: '위치 0, 2, 4, 6의 겹치는 일치를 모두 찾습니다.' },
    { id: 'collision', label: '해시 충돌 실험', text: 'AGAB', pattern: 'AB', base: 256, mod: 5, description: 'q = 5에서는 AG, GA, AB의 해시가 모두 1입니다. 실제 문자 검증으로 AG와 GA를 제외하고 위치 2의 AB만 기록합니다.' },
    { id: 'missing', label: '일치 없음', text: 'ABCDEABCDE', pattern: 'XYZ', base: 256, mod: 101, description: '문자열에 없는 패턴을 끝까지 검색합니다.' },
    { id: 'unicode', label: '한글 문자열', text: '가나다가나', pattern: '가나', base: 256, mod: 101, description: '한글도 코드 포인트 단위로 비교합니다. 위치 0과 3에서 발견합니다.' }
  ];

  return { buildKMPTrace, buildRabinKarpTrace, presets };
});
