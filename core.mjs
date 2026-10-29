/** N-Queens search and immutable, reversible execution traces. */

export function validateFullBoard(q) {
  let pairChecks = 0;
  let valid = true;
  for (let a = 0; a < q.length; a += 1) {
    for (let b = a + 1; b < q.length; b += 1) {
      pairChecks += 1;
      if (q[a] === q[b] || Math.abs(q[a] - q[b]) === b - a) valid = false;
    }
  }
  return { valid, pairChecks };
}

export function isSafe(row, col, usedCols, diagDown, diagUp, n) {
  return !usedCols[col] && !diagDown[row - col + n - 1] && !diagUp[row + col];
}

// observe records execution; it never changes the search decisions.
export function bruteForceSearch(n, observe = () => {}) {
  const q = Array(n).fill(-1);
  const stats = { attempts: 0, checks: 0, pairChecks: 0, fullBoards: 0, fullCandidates: 0, skippedCandidates: 0, solutions: 0, prunedLeaves: 0 };
  function search(row) {
    if (row === n) {
      stats.fullBoards += 1;
      const result = validateFullBoard(q);
      stats.checks += 1;
      stats.pairChecks += result.pairChecks;
      observe('check', { q, stats, row: n - 1, col: q[n - 1], result });
      if (result.valid) {
        stats.solutions += 1;
        observe('solution', { q, stats, row: n - 1, col: q[n - 1] });
      } else {
        observe('reject', { q, stats, row: n - 1, col: q[n - 1], result });
      }
      return;
    }
    for (let col = 0; col < n; col += 1) {
      q[row] = col;
      stats.attempts += 1;
      if (row === n - 1) stats.fullCandidates += 1;
      observe('place', { q, stats, row, col });
      search(row + 1);
      q[row] = -1;
      observe('remove', { q, stats, row, col });
    }
  }
  observe('start', { q, stats, row: -1, col: -1 });
  search(0);
  observe('done', { q, stats, row: -1, col: -1 });
  return stats;
}

export function backtrackingSearch(n, observe = () => {}) {
  const q = Array(n).fill(-1);
  const usedCols = Array(n).fill(false);
  const diagDown = Array(2 * n - 1).fill(false);
  const diagUp = Array(2 * n - 1).fill(false);
  const stats = { attempts: 0, checks: 0, pairChecks: 0, fullBoards: 0, fullCandidates: 0, skippedCandidates: 0, solutions: 0, prunedLeaves: 0 };
  function emit(type, row, col, safe) {
    observe(type, { q, usedCols, diagDown, diagUp, stats, row, col, safe });
  }
  function search(row) {
    if (row === n) {
      stats.fullBoards += 1;
      stats.solutions += 1;
      emit('solution', n - 1, q[n - 1]);
      return;
    }
    for (let col = 0; col < n; col += 1) {
      q[row] = col;
      stats.attempts += 1;
      if (row === n - 1) stats.fullCandidates += 1;
      emit('place', row, col);
      const safe = isSafe(row, col, usedCols, diagDown, diagUp, n);
      stats.checks += 1;
      emit('check', row, col, safe);
      if (safe) {
        usedCols[col] = true;
        diagDown[row - col + n - 1] = true;
        diagUp[row + col] = true;
        emit('commit', row, col, safe);
        search(row + 1);
        usedCols[col] = false;
        diagDown[row - col + n - 1] = false;
        diagUp[row + col] = false;
      } else {
        stats.prunedLeaves += n ** (n - row - 1);
        if (row < n - 1) stats.skippedCandidates += n ** (n - row - 1);
        emit('reject', row, col, safe);
      }
      q[row] = -1;
      emit('remove', row, col, safe);
    }
  }
  emit('start', -1, -1);
  search(0);
  emit('done', -1, -1);
  return stats;
}

const freezeItems = array => Object.freeze(array.map(item => Object.freeze(item)));
const emptyStats = () => ({ attempts: 0, checks: 0, pairChecks: 0, fullBoards: 0, fullCandidates: 0, skippedCandidates: 0, solutions: 0, prunedLeaves: 0 });

function deriveOccupancy(q, n) {
  const usedCols = Array(n).fill(false);
  const diagDown = Array(2 * n - 1).fill(false);
  const diagUp = Array(2 * n - 1).fill(false);
  q.forEach((col, row) => {
    if (col >= 0) {
      usedCols[col] = true;
      diagDown[row - col + n - 1] = true;
      diagUp[row + col] = true;
    }
  });
  return { usedCols, diagDown, diagUp };
}

function candidateConflicts(q, row) {
  const conflicts = [];
  for (let fromRow = 0; fromRow < row; fromRow += 1) {
    if (q[fromRow] < 0) continue;
    if (q[fromRow] === q[row]) conflicts.push({ fromRow, toRow: row, kind: 'column' });
    else if (Math.abs(q[fromRow] - q[row]) === row - fromRow) conflicts.push({ fromRow, toRow: row, kind: 'diagonal' });
  }
  return conflicts;
}

// Diagnostic-only conflict links: these are not part of either search's work.
function fullBoardConflicts(q) {
  return q.flatMap((_, row) => candidateConflicts(q, row));
}

export function buildTrace({ algorithm = 'backtrack', n = 4 } = {}) {
  if (!['brute', 'backtrack'].includes(algorithm)) throw new RangeError('algorithm must be brute or backtrack');
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new RangeError('n must be an integer from 1 to 5');
  const search = algorithm === 'brute' ? bruteForceSearch : backtrackingSearch;
  const helper = algorithm === 'brute' ? validateFullBoard : isSafe;
  const codeLines = search.toString().split('\n');
  const helperLines = helper.toString().split('\n');
  const line = text => {
    const index = codeLines.findIndex(sourceLine => sourceLine.includes(text));
    if (index < 0) throw new Error(`Unmapped source statement: ${text}`);
    return index + 1;
  };
  const helperLine = text => helperLines.findIndex(sourceLine => sourceLine.includes(text)) + 1;
  const codeMap = algorithm === 'brute' ? {
    start: line('const q ='), place: line('q[row] = col;'), check: line('const result = validateFullBoard(q);'),
    reject: line("observe('reject'"), remove: line('q[row] = -1;'),
    solution: line('stats.solutions += 1;'), done: line("observe('done'"),
  } : {
    start: line('const q ='), place: line('q[row] = col;'), check: line('const safe = isSafe('),
    commit: line('usedCols[col] = true;'), reject: line('stats.prunedLeaves +='),
    remove: line('q[row] = -1;'), solution: line('stats.solutions += 1;'), done: line("emit('done'"),
  };
  const events = [];
  const nodes = [{ id: 0, parentId: null, row: -1, col: -1, q: Array(n).fill(-1), status: 'safe', createdAt: 0, acceptedAt: 0 }];
  const path = [0];
  let previous = null;
  const observe = (type, data) => {
    const index = events.length;
    const { row, col } = data;
    if (type === 'place') {
      const id = nodes.length;
      nodes.push({ id, parentId: path.at(-1), row, col, q: [...data.q], status: 'candidate', createdAt: index });
      path.push(id);
    }
    if (type === 'commit') {
      nodes[path.at(-1)].status = 'safe';
      nodes[path.at(-1)].acceptedAt = index;
    }
    if (type === 'reject') {
      nodes[path.at(-1)].status = algorithm === 'brute' ? 'invalid' : 'rejected';
      nodes[path.at(-1)].rejectedAt = index;
    }
    if (type === 'solution') {
      nodes[path.at(-1)].status = 'solution';
      nodes[path.at(-1)].solutionAt = index;
    }
    if (type === 'remove') {
      nodes[path.at(-1)].settledAt = index;
      path.pop();
    }
    if (type === 'done') nodes[0].settledAt = index;
    const q = [...data.q];
    const occupancy = algorithm === 'brute' ? deriveOccupancy(q, n) : data;
    const arrays = {
      q,
      usedCols: [...occupancy.usedCols],
      diagDown: [...occupancy.diagDown],
      diagUp: [...occupancy.diagUp],
    };
    const changes = [];
    if (previous) {
      for (const array of ['q', 'usedCols', 'diagDown', 'diagUp']) {
        arrays[array].forEach((after, itemIndex) => {
          const before = previous[array][itemIndex];
          if (before !== after) changes.push({ array, index: itemIndex, before, after });
        });
      }
    }
    let conflicts = [];
    if (type === 'check' || type === 'reject') {
      conflicts = algorithm === 'brute' ? fullBoardConflicts(q) : candidateConflicts(q, row);
    }
    const square = row >= 0 ? `행 ${row}, 열 ${col}` : '';
    let title = '';
    let explanation = '';
    let reason = '';
    if (type === 'start') {
      title = `${n}×${n} 탐색 시작`;
      explanation = '각 행에 퀸 하나를 놓고, 열 후보를 왼쪽부터 차례로 확인합니다.';
      reason = algorithm === 'brute'
        ? `행마다 ${n}개 열을 모두 선택해 ${n ** n}개 완성 배치를 전부 검사합니다. 보조 점유 배열은 배치에서 계산한 표시이며 탐색에는 쓰지 않습니다.`
        : '열·두 대각선 점유 배열을 이용해 현재 후보의 안전성을 확인하고, 충돌하면 바로 하위 탐색을 생략합니다.';
    } else if (type === 'place') {
      title = `${square}에 후보 퀸 배치`;
      explanation = `q[${row}] = ${col}. 보드의 행·열 좌표와 배열 인덱스는 모두 0부터 셉니다.`;
      reason = algorithm === 'brute'
        ? '중간 충돌 여부와 관계없이 다음 행까지 탐색합니다. 점유 배열은 현재 배치의 보조 표시입니다.'
        : '아직 안전성이 확인되지 않은 후보입니다. q만 바꾸고 점유 배열은 이전에 확정한 퀸들만 표시합니다.';
    } else if (type === 'check' && algorithm === 'brute') {
      title = `완성 배치 #${data.stats.fullBoards} 검사`;
      explanation = `${n * (n - 1) / 2}개 퀸 쌍을 모두 비교했습니다. 충돌 쌍은 ${conflicts.length}개입니다.`;
      reason = '충돌을 일찍 발견해도 중단하지 않습니다. 이 기준 구현은 완성 배치마다 모든 퀸 쌍을 검사합니다.';
    } else if (type === 'check') {
      title = `${square} 안전성 검사`;
      explanation = `usedCols[${col}], diagDown[${row - col + n - 1}], diagUp[${row + col}]를 확인합니다. 결과: ${data.safe ? '안전' : '충돌'}.`;
      reason = '세 점유 위치만 확인하므로 후보 한 개의 검사는 O(1)입니다. 빨간 연결선은 이해를 돕기 위한 충돌 표시입니다.';
    } else if (type === 'commit') {
      title = `${square} 후보 확정`;
      explanation = `열 ${col}, ↘ 대각선 ${row - col + n - 1}, ↙ 대각선 ${row + col}의 점유를 true로 바꿉니다.`;
      reason = '안전한 퀸을 확정했으므로 다음 행을 재귀적으로 탐색합니다.';
    } else if (type === 'reject') {
      title = algorithm === 'brute' ? '충돌한 완성 배치 폐기'
        : row === n - 1 ? `${square}의 완성 후보 제외` : `${square}에서 가지치기`;
      explanation = algorithm === 'brute'
        ? `충돌 쌍 ${conflicts.length}개가 있어 해가 아닙니다. 이 배치의 모든 쌍 검사는 이미 끝났습니다.`
        : row === n - 1
          ? '이미 모든 행까지 임시 배치한 후보입니다. 충돌하므로 해에서 제외하며, 추가 하위 생략은 0개입니다.'
          : `이미 놓인 퀸과 충돌합니다. 아직 놓지 않은 ${n - row - 1}개 행의 완성 후보 ${n ** (n - row - 1)}개를 만들지 않고 생략합니다.`;
      reason = algorithm === 'brute' ? '중간 가지치기는 하지 않았으며, 다음 완성 배치를 탐색합니다.'
        : row === n - 1 ? '이 후보는 이미 실제 완성 후보 수에 포함되었습니다. 남은 행이 없어 생략할 추가 후보는 없으며 점유 배열은 바꾸지 않습니다.'
        : '이 후보 아래에 퀸을 더 놓아도 이미 생긴 충돌은 사라지지 않습니다. 점유 배열은 바꾸지 않습니다.';
    } else if (type === 'remove') {
      title = `${square} 후보 되돌리기`;
      explanation = `q[${row}]를 -1로 복원하고 다음 열 후보를 준비합니다.`;
      reason = algorithm === 'brute' ? '해당 후보의 하위 탐색을 마쳤습니다. 보조 점유 표시도 현재 배치에서 다시 계산합니다.'
        : data.safe ? '하위 탐색을 마쳤으므로 확정했던 열과 두 대각선 점유도 false로 되돌립니다.' : '거절된 후보의 q만 되돌립니다. 확정하지 않았으므로 점유 배열 변화는 없습니다.';
    } else if (type === 'solution') {
      title = `해 #${data.stats.solutions} 발견`;
      explanation = `q = [${q.join(', ')}]. 모든 행의 퀸이 서로 공격하지 않습니다.`;
      reason = '모든 해를 비교하기 위해 탐색을 멈추지 않고 다음 후보로 계속 진행합니다.';
    } else if (type === 'done') {
      title = `탐색 완료 · 해 ${data.stats.solutions}개`;
      explanation = algorithm === 'brute'
        ? `모든 행까지 배치한 후보 ${data.stats.fullCandidates}개와 퀸 쌍 ${data.stats.pairChecks}개를 검사했습니다.`
        : `모든 행까지 임시 배치한 후보 ${data.stats.fullCandidates}개를 검사했고, 더 이른 충돌로 완성 후보 ${data.stats.skippedCandidates}개를 만들지 않고 생략했습니다.`;
      reason = '배열을 모두 초기 상태로 복원했습니다. 저장된 이전·다음 단계로 같은 실행을 정확히 다시 볼 수 있습니다.';
    }
    const event = {
      index, type, title, explanation, reason, row, col,
      q: Object.freeze(arrays.q), usedCols: Object.freeze(arrays.usedCols),
      diagDown: Object.freeze(arrays.diagDown), diagUp: Object.freeze(arrays.diagUp),
      changes: freezeItems(changes), codeLine: codeMap[type], nodeId: path.at(-1),
      conflicts: freezeItems(conflicts), stats: Object.freeze({ ...data.stats }), stack: Object.freeze([...path]),
    };
    if (type === 'check') event.helperLine = algorithm === 'brute' ? helperLine('pairChecks += 1;') : helperLine('return !usedCols');
    previous = Object.freeze(event);
    events.push(previous);
  };
  const totals = search(n, observe);
  return Object.freeze({
    algorithm, n, events: Object.freeze(events),
    nodes: Object.freeze(nodes.map(node => Object.freeze({ ...node, q: Object.freeze(node.q) }))),
    codeLines: Object.freeze(codeLines), helperLines: Object.freeze(helperLines),
    totals: Object.freeze({ ...emptyStats(), ...totals, totalCandidates: n ** n, nodeCount: nodes.length, eventCount: events.length }),
  });
}
