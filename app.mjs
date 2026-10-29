import { buildTrace } from './core.mjs';

const $ = id => document.getElementById(id);
const algorithms = ['brute', 'backtrack'];
const palette = { brute: { main:'#b56740', bright:'#f3b183', light:'#f3e9df' }, backtrack: { main:'#6956a3', bright:'#b8a1ec', light:'#eee9f6' } };
const names = { start:'탐색 준비', place:'후보 배치', check:'충돌 검사', commit:'안전한 후보 확정', reject:'후보 제외', remove:'되돌리기', solution:'해 발견', done:'탐색 완료' };
const arrayNames = ['q', 'usedCols', 'diagDown', 'diagUp'];
const cache = new Map();
let traces = {}, children = {}, cursor = 0, maxCursor = 0, n = 4, view = '3d', playing = false, lastTime = 0, budget = 0, toastTimer;
let focusedAlgorithm = 'brute', cursors = { brute:0, backtrack:0 };
let selected = {}, pngBusy = false;

// Keep the main state visible; longer prose and the small-screen diagram are optional.
for(const a of algorithms){
  const panel=$(`panel-${a}`),box=panel.querySelector('.event-box'),details=document.createElement('details'),summary=document.createElement('summary');
  details.className='event-box';summary.textContent='이 단계의 동작과 이유';details.append(summary,...box.childNodes);box.replaceWith(details);
  const state=panel.querySelector('.state-section');state.append(panel.querySelector('.panel-metrics'));
  const tree=panel.querySelector('.tree-section'),treeDetails=document.createElement('details'),treeSummary=document.createElement('summary');
  treeDetails.className='tree-wrapper';treeDetails.open=innerWidth>1050;treeSummary.textContent='현재 분기의 탐색 트리 보기';tree.replaceWith(treeDetails);treeDetails.append(treeSummary,tree);
  panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`focus-${a}`);
}
matchMedia('(min-width:1051px)').addEventListener('change',e=>{document.querySelectorAll('.tree-wrapper').forEach(details=>details.open=e.matches)});

function toast(text) {
  $('toast').textContent=text; $('toast').style.opacity='1';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.opacity='0',3000);
}
function setPlaying(value) {
  playing=value;lastTime=0;budget=0;
  $('autoplay').textContent=value?'Ⅱ 일시 정지':'▶ 애니메이션';
  $('autoplay').setAttribute('aria-pressed',String(value));
  $('play-status').textContent=value?'자동 재생 중 · 언제든 멈추고 이전 단계로 돌아갈 수 있습니다.':cursor===0?'멈춘 상태에서 시작합니다. ‘다음 단계’를 눌러보세요.':cursor===maxCursor?'전체 탐색 완료 · 이전 단계나 주요 장면을 다시 살펴보세요.':'일시 정지 · 선택한 단계의 모든 값이 복원되어 있습니다.';
}
function loadProblem() {
  setPlaying(false);n=+$('board-size').value;
  if(!cache.has(n))cache.set(n,Object.fromEntries(algorithms.map(algorithm=>[algorithm,buildTrace({algorithm,n})])));
  traces=cache.get(n);children={};
  for(const a of algorithms){children[a]=new Map();for(const node of traces[a].nodes){if(node.parentId===null)continue;const list=children[a].get(node.parentId)||[];list.push(node);children[a].set(node.parentId,list)}buildCode(a)}
  cursors={brute:0,backtrack:0};cursor=0;maxCursor=traces[focusedAlgorithm].events.length-1;
  $('timeline').max=maxCursor;
  renderTotals();render();setPlaying(false);
}
function goTo(index, manual=true) {
  cursor=Math.max(0,Math.min(maxCursor,Math.round(index)));
  cursors[focusedAlgorithm]=cursor;
  if(manual)setPlaying(false);
  render();
  if(cursor===maxCursor)setPlaying(false);
}
function focusAlgorithm(a){
  setPlaying(false);focusedAlgorithm=a;cursor=cursors[a];maxCursor=traces[a].events.length-1;$('timeline').max=maxCursor;render();setPlaying(false);
}
function buildCode(a) {
  for(const [prefix,lines] of [['code',traces[a].codeLines],['helper',traces[a].helperLines]]){
    $(`${prefix}-${a}`).replaceChildren(...lines.map(text=>{const li=document.createElement('li');li.textContent=text||' ';if(text.trim().startsWith('//'))li.className='comment';return li}));
  }
}
function render() {
  $('timeline').value=cursor;
  $('cursor-label').innerHTML=`${String(cursor).padStart(4,'0')} <small>/ ${maxCursor}</small>`;
  $('prev').disabled=cursor===0;$('next').disabled=cursor===maxCursor;
  for(const a of algorithms){const trace=traces[a],event=trace.events[cursors[a]];selected[a]=event;$(`panel-${a}`).hidden=a!==focusedAlgorithm;$(`focus-${a}`).classList.toggle('active',a===focusedAlgorithm);$(`focus-${a}`).setAttribute('aria-selected',String(a===focusedAlgorithm));$(`focus-${a}`).tabIndex=a===focusedAlgorithm?0:-1;if(a===focusedAlgorithm)renderPanel(a,event)}
  $('current-action').textContent=selected[focusedAlgorithm].title;
  if(!playing)$('play-status').textContent=cursor===0?'멈춘 상태에서 시작합니다. ‘다음 단계’를 눌러보세요.':cursor===maxCursor?'전체 탐색 완료 · 이전 단계나 주요 장면을 다시 살펴보세요.':'일시 정지 · 선택한 단계의 모든 값이 복원되어 있습니다.';
}
function renderPanel(a,e) {
  const trace=traces[a];
  $(`event-number-${a}`).textContent=`STEP ${e.index}`;
  $(`event-total-${a}`).textContent=`/ ${trace.events.length-1}`;
  $(`progress-${a}`).style.width=`${100*e.index/(trace.events.length-1)}%`;
  $(`type-${a}`).textContent=a==='backtrack'&&e.type==='reject'?'가지치기':names[e.type];
  $(`location-${a}`).textContent=e.row<0?'전체 탐색':`r = ${e.row} / c = ${e.col}`;
  $(`title-${a}`).textContent=e.title;$(`explain-${a}`).textContent=e.explanation;$(`reason-${a}`).textContent=e.reason;
  $(`boards-${a}`).textContent=e.stats.fullCandidates.toLocaleString();$(`skipped-${a}`).textContent=e.stats.skippedCandidates.toLocaleString();$(`solutions-${a}`).textContent=e.stats.solutions;
  $(`variables-${a}`).textContent=`r=${e.row<0?'−':e.row} · c=${e.col<0?'−':e.col} · depth=${e.stack.length-1}`;
  $(`panel-${a}`).querySelector('.strategy-tag').textContent=`시도 ${e.stats.attempts} · 해 ${e.stats.solutions}`;
  const changed=new Set(e.changes.map(change=>`${change.array}:${change.index}`));
  $(`arrays-${a}`).replaceChildren(...arrayNames.map(name=>{
    const row=document.createElement('div');row.className='array-row';const label=document.createElement('span');label.className='array-name';label.textContent=name;const cells=document.createElement('div');cells.className='array-cells';
    cells.replaceChildren(...e[name].map((value,i)=>{const cell=document.createElement('span');cell.className='array-cell';cell.classList.toggle('occupied',name==='q'?value>=0:value);cell.classList.toggle('changed',changed.has(`${name}:${i}`));cell.setAttribute('aria-label',`${name}[${i}] = ${formatValue(value)}${changed.has(`${name}:${i}`)?', 이 단계에서 변경':''}`);const index=document.createElement('small');index.textContent=i;const strong=document.createElement('strong');strong.textContent=formatValue(value);cell.append(index,strong);return cell}));row.append(label,cells);return row;
  }));
  $(`changes-${a}`).replaceChildren();
  if(e.changes.length){const lead=document.createElement('span');lead.textContent='이 단계의 변경';$(`changes-${a}`).append(lead,...e.changes.map(change=>{const item=document.createElement('code');item.textContent=`${change.array}[${change.index}]: ${formatValue(change.before)} → ${formatValue(change.after)}`;return item}))}else $(`changes-${a}`).textContent=e.type==='check'?'배열 변경 없음 · 값을 읽고 안전성을 검사합니다.':e.type==='reject'?(a==='backtrack'&&e.row<n-1?'배열 변경 없음 · 하위 후보 생략 수를 갱신합니다.':'배열 변경 없음 · 충돌한 완성 후보로 판정합니다.'):'이 단계에서는 배열 값이 바뀌지 않습니다.';
  const active=new Set([e.codeLine]);
  if(e.type==='commit'){active.add(e.codeLine+1);active.add(e.codeLine+2)}
  if(e.type==='reject'&&a==='backtrack')active.add(e.codeLine+1);
  if(e.type==='remove'&&a==='backtrack'&&e.changes.some(c=>c.array!=='q'))for(const statement of ['usedCols[col] = false;','diagDown[row - col + n - 1] = false;','diagUp[row + col] = false;'])active.add(trace.codeLines.findIndex(line=>line.includes(statement))+1);
  [...$(`code-${a}`).children].forEach((li,i)=>li.classList.toggle('active',active.has(i+1)));
  [...$(`helper-${a}`).children].forEach((li,i)=>li.classList.toggle('active',i+1===e.helperLine||(a==='brute'&&e.helperLine&&i===e.helperLine)));
  $(`code-location-${a}`).textContent=`L${e.codeLine}${e.helperLine?` · 검사 함수 L${e.helperLine}`:''}`;
  keepActiveCodeVisible(a,e);
  drawBoard(a);drawTree(a);
}
function keepActiveCodeVisible(a,e){const codeLine=$(`code-${a}`).children[e.codeLine-1],window=codeLine.parentElement.parentElement;if(codeLine.offsetTop<window.scrollTop+12||codeLine.offsetTop>window.scrollTop+window.clientHeight-40)window.scrollTop=Math.max(0,codeLine.offsetTop-window.clientHeight*.35)}
function formatValue(value){return typeof value==='boolean'?(value?'1':'0'):value===-1?'−':String(value)}
function fitCanvas(canvas) {
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w:rect.width,h:rect.height};
}
function polygon(ctx,points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.7;ctx.stroke()}}
function queen(ctx,x,y,size,fill,outline,active=false) {
  ctx.save();ctx.translate(x,y);ctx.scale(size/30,size/30);
  ctx.fillStyle='#0005';ctx.beginPath();ctx.ellipse(0,2,11,3.5,0,0,2*Math.PI);ctx.fill();
  ctx.fillStyle=fill;ctx.strokeStyle=outline;ctx.lineWidth=1.2;
  ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(-9,-4);ctx.lineTo(-5,-5);ctx.lineTo(-3,-16);ctx.lineTo(-7,-21);ctx.lineTo(-10,-29);ctx.lineTo(-4,-25);ctx.lineTo(0,-33);ctx.lineTo(4,-25);ctx.lineTo(10,-29);ctx.lineTo(7,-21);ctx.lineTo(3,-16);ctx.lineTo(5,-5);ctx.lineTo(9,-4);ctx.lineTo(10,0);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-5,-16);ctx.lineTo(5,-16);ctx.moveTo(-8,-4);ctx.lineTo(8,-4);ctx.strokeStyle=outline+'aa';ctx.stroke();
  ctx.fillStyle=outline;for(const [cx,cy]of[[-10,-30],[0,-34],[10,-30]]){ctx.beginPath();ctx.arc(cx,cy,1.6,0,2*Math.PI);ctx.fill()}
  if(active){ctx.strokeStyle='#f2cf75';ctx.lineWidth=1.5;ctx.setLineDash([3,3]);ctx.beginPath();ctx.ellipse(0,1,13,5,0,0,2*Math.PI);ctx.stroke()}
  ctx.restore();
}
function drawBoard(a) {
  const e=selected[a];if(!e||$(`panel-${a}`).hidden)return;
  const canvas=$(`board-${a}`),{ctx,w,h}=fitCanvas(canvas),color=palette[a];ctx.clearRect(0,0,w,h);ctx.fillStyle='#152229';ctx.fillRect(0,0,w,h);
  const grid3d=view==='3d',u=grid3d?Math.min((w-68)/(2*n),(h-78)/(n+1.4),36):Math.min((w-76)/n,(h-75)/n,51);
  const ox=grid3d?w/2:(w-n*u)/2,oy=grid3d?(h-30-n*u)/2+22:(h-30-n*u)/2;
  const project=(r,c)=>grid3d?[ox+(c-r)*u,oy+(c+r)*u*.5]:[ox+c*u,oy+r*u];
  const center=(r,c)=>project(r+.5,c+.5);
  if(grid3d){const b0=project(n,0),b1=project(n,n),b2=project(0,n);polygon(ctx,[b0,b1,[b1[0],b1[1]+7],[b0[0],b0[1]+7]],'#43515b');polygon(ctx,[b1,b2,[b2[0],b2[1]+7],[b1[0],b1[1]+7]],'#283b46')}
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    const isCurrent=r===e.row&&c===e.col&&e.q[r]===c,base=(r+c)%2===0?'#b4b9ac':'#647580';
    const points=[project(r,c),project(r,c+1),project(r+1,c+1),project(r+1,c)];polygon(ctx,points,isCurrent?'#b7a771':base,'#192f3d33');
    if(!grid3d&&r===e.row&&c===e.col){ctx.strokeStyle='#f4d77b';ctx.lineWidth=2;ctx.strokeRect(points[0][0]+2,points[0][1]+2,u-4,u-4)}
  }
  if(e.row>=0&&e.q[e.row]>=0&&e.type==='check'&&a==='backtrack'){
    const r=e.row,c=e.col;ctx.save();ctx.strokeStyle='#edc87580';ctx.lineWidth=1.2;ctx.setLineDash([4,4]);
    for(let rr=0;rr<n;rr++)for(let cc=0;cc<n;cc++)if(cc===c||rr-cc===r-c||rr+cc===r+c){const p=center(rr,cc);ctx.beginPath();ctx.arc(...p,grid3d?u*.16:u*.12,0,Math.PI*2);ctx.stroke()}
    ctx.restore();
  }
  for(const conflict of e.conflicts){const p=center(conflict.fromRow,e.q[conflict.fromRow]),q=center(conflict.toRow,e.q[conflict.toRow]);ctx.strokeStyle='#f47775';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke()}
  const queens=e.q.map((c,r)=>({r,c})).filter(q=>q.c>=0).sort((p,q)=>grid3d?(p.r+p.c)-(q.r+q.c):p.r-q.r);
  const conflictRows=new Set(e.conflicts.flatMap(c=>[c.fromRow,c.toRow]));
  for(const {r,c}of queens){const [x,y]=center(r,c);const tentative=a==='backtrack'&&r===e.row&&['place','check','reject'].includes(e.type),conflicted=conflictRows.has(r);queen(ctx,x,y+(grid3d?u*.16:u*.3),Math.min(grid3d?u*.9:u*.85,37),conflicted?'#dc7978':tentative?'#b49b56':a==='brute'?'#c98a5d':'#9d84ce',conflicted?'#ffd0c1':tentative?'#f4d993':color.bright,tentative)}
  ctx.font='9px "IBM Plex Mono",monospace';ctx.fillStyle='#a7b7bd';ctx.textBaseline='middle';ctx.textAlign='center';
  for(let i=0;i<n;i++){
    const rowLabel=grid3d?project(i+.5,-.32):[ox-16,oy+(i+.5)*u],colLabel=grid3d?project(-.35,i+.5):[ox+(i+.5)*u,oy-14];ctx.fillText(i,...rowLabel);ctx.fillText(i,...colLabel);
  }
  ctx.textAlign='left';ctx.font='8px "IBM Plex Mono",monospace';ctx.fillStyle='#6e8691';ctx.fillText('r / c : 0-BASED',16,18);
  ctx.textAlign='right';ctx.fillText(`${n} × ${n} / ${e.type==='done'?'COMPLETE':e.type.toUpperCase()}`,w-16,18);
  canvas.setAttribute('aria-label',`${a==='brute'?'완전탐색':'백트래킹'} ${n}퀸, 단계 ${e.index}, q=[${e.q.map(formatValue).join(', ')}]${e.conflicts.length?`, 충돌 ${e.conflicts.length}쌍`:''}`);
}
function roundBox(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
function nodeStatus(node,index){if(!node||node.createdAt>index)return'future';if(node.solutionAt<=index)return'solution';if(node.rejectedAt<=index)return'rejected';if(node.acceptedAt<=index)return'safe';return'visited'}
function drawTree(a) {
  const e=selected[a];if(!e||$(`panel-${a}`).hidden||!$(`panel-${a}`).querySelector('.tree-wrapper').open)return;
  const trace=traces[a],current=trace.nodes[e.nodeId];
  const parent=e.type==='remove'?current:current.parentId===null?current:trace.nodes[current.parentId];
  const level=parent.row+1,candidates=children[a].get(parent.id)||[],currentCol=e.row===level?e.col:-1;
  const path=parent.q.slice(0,level);$(`tree-path-${a}`).textContent=`prefix [${path.join(', ')}]`;
  const canvas=$(`tree-${a}`),{ctx,w,h}=fitCanvas(canvas),color=palette[a];ctx.clearRect(0,0,w,h);ctx.fillStyle='#f2f4ed';ctx.fillRect(0,0,w,h);
  const title=path.length?`상위 배치 [${path.join(', ')}]`:'시작 · 아직 퀸이 없음';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='9px "Noto Sans KR",sans-serif';roundBox(ctx,w/2-80,5,160,24,4,'#fdfdf7','#ccd8c2');ctx.fillStyle='#63745c';ctx.fillText(title,w/2,17);
  const spacing=(w-24)/n,box=Math.min(55,spacing-10),y=Math.max(48,h*.49);
  for(let c=0;c<n;c++){
    const x=12+spacing*(c+.5),node=candidates.find(node=>node.col===c),status=nodeStatus(node,e.index),active=c===currentCol;
    ctx.beginPath();ctx.moveTo(w/2,29);ctx.lineTo(x,y-4);ctx.strokeStyle=active?color.main:'#c8d2bf';ctx.lineWidth=active?1.8:1;ctx.setLineDash(status==='future'?[3,3]:[]);ctx.stroke();ctx.setLineDash([]);
    const fill=status==='rejected'?'#f6e3de':status==='solution'?'#dde9cf':active?color.light:'#fafbf5',stroke=status==='rejected'?'#c98676':status==='solution'?'#7d9b63':active?color.main:'#d1d9c7';
    roundBox(ctx,x-box/2,y,box,25,4,fill,stroke);ctx.fillStyle=status==='future'?'#a7b29c':status==='rejected'?'#af6c5a':active?color.main:'#6b7e60';ctx.font='10px "IBM Plex Mono",monospace';ctx.fillText(`c=${c}`,x,y+12);
    ctx.font='7px "Noto Sans KR",sans-serif';ctx.fillStyle='#8d9b80';const label=status==='future'?'미탐색':status==='rejected'?(a==='brute'?'해 아님':'가지치기'):status==='solution'?'해':status==='safe'?'확정':'방문';ctx.fillText(label,x,y+35);
    if(status==='rejected'&&a==='backtrack'){ctx.strokeStyle='#c98676';ctx.beginPath();ctx.moveTo(x-4,y+42);ctx.lineTo(x+4,y+49);ctx.moveTo(x+4,y+42);ctx.lineTo(x-4,y+49);ctx.stroke()}
    else if(level<n-1){ctx.strokeStyle='#cbd4c1';ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(x,y+42);ctx.lineTo(x-5,y+50);ctx.moveTo(x,y+42);ctx.lineTo(x+5,y+50);ctx.stroke();ctx.setLineDash([])}
  }
  let note;
  if(e.type==='reject'&&a==='backtrack')note=e.row<n-1?`이 분기를 더 내려가지 않습니다. ${n}^${n-e.row-1} = ${(n**(n-e.row-1)).toLocaleString()}개 완성 후보를 만들지 않고 생략합니다.`:'이미 끝 행까지 임시 배치했으나 충돌한 후보입니다. 이 후보는 실제 생성 수에 포함하며, 더 아래에 생략할 행은 없습니다.';
  else if(e.type==='remove')note='하위 탐색을 마치고 상위 배치로 돌아왔습니다. 같은 상위 배치에서 다음 열을 선택합니다.';
  else if(e.type==='done')note='모든 분기를 확인했습니다. 이전 단계로 이동하면 당시의 방문·확정·가지치기 상태도 복원됩니다.';
  else note=a==='brute'?'현재 행의 열 선택을 보여줍니다. 충돌 여부로 아래 가지를 생략하지 않고 끝 행까지 배치합니다.':'현재 행의 열 선택을 보여줍니다. 회색은 아직 시도하지 않은 후보, 붉은 ×는 생략한 하위 분기입니다.';
  $(`tree-note-${a}`).textContent=note;canvas.setAttribute('aria-label',`${a==='brute'?'완전탐색':'백트래킹'} 현재 분기, 상위 배치 [${path.join(',')}], 다음 행 ${level}, 선택 열 ${currentCol}. ${note}`);
}
function renderTotals() {
  const b=traces.brute.totals,t=traces.backtrack.totals;
  const cards=[['전체 완성 후보',b.totalCandidates.toLocaleString(),'개',`${n}개 행에서 각각 ${n}개 열을 선택합니다.`],['완전탐색 · 끝 행까지 배치',b.fullCandidates.toLocaleString(),'개','충돌한 배치도 끝까지 만든 뒤 검사합니다.'],['백트래킹 · 생성하지 않고 생략',t.skippedCandidates.toLocaleString(),'개',`끝 행까지 임시 배치한 후보는 ${t.fullCandidates}개, 그중 해는 ${t.solutions}개입니다.`]];
  $('final-summary').replaceChildren(...cards.map(([title,value,unit,note])=>{const card=document.createElement('article');card.className='summary-card';card.innerHTML=`<span>${title}</span><h3>${value}<small>${unit}</small></h3><p>${note}</p>`;return card}));
  $('candidate-count').textContent=`${n}^${n} = ${b.totalCandidates.toLocaleString()}`;
  $('coverage-brute').textContent=`생성 ${b.fullCandidates.toLocaleString()} / 생략 0`;
  $('coverage-backtrack').textContent=`생성 ${t.fullCandidates} / 생략 ${t.skippedCandidates.toLocaleString()}`;
  $('backtrack-built').style.width=`${100*t.fullCandidates/b.totalCandidates}%`;$('backtrack-pruned').style.width=`${100*t.skippedCandidates/b.totalCandidates}%`;
  $('totals-table').innerHTML=`<table><thead><tr><th>지표</th><th>완전탐색</th><th>백트래킹</th></tr></thead><tbody>${[['퀸 후보 배치 시도','attempts'],['검사 호출¹','checks'],['완성 보드의 퀸 쌍 검사²','pairChecks'],['끝 행까지 임시 배치한 후보','fullCandidates'],['생성하지 않고 생략한 후보','skippedCandidates'],['찾은 해','solutions'],['시각화 단계³','eventCount']].map(([label,key])=>`<tr><th>${label}</th><td>${b[key].toLocaleString()}</td><td>${t[key].toLocaleString()}</td></tr>`).join('')}</tbody></table><p class="chart-note">¹ 완전탐색은 완성 보드 검사, 백트래킹은 후보 하나의 점유 검사이므로 호출 비용이 다릅니다.<br>² 백트래킹은 세 점유 값을 검사합니다. 0은 작업이 없다는 뜻이 아닙니다.<br>³ 기록된 시작·배치·검사·확정·가지치기·복귀·해·종료 사건 수이며 실행 시간이 아닙니다.</p>`;
  for(const label of document.querySelectorAll('.panel-metrics>div:first-child>span'))label.textContent='끝 행까지 배치한 후보';
}
function jump(a,target) {
  const event=target==='done'?traces[a].events.at(-1):traces[a].events.find(e=>target==='solution'?e.type==='solution':a==='backtrack'?e.type==='reject':e.type==='check'&&e.conflicts.length>0);
  if(event){focusAlgorithm(a);goTo(event.index);toast(`${a==='brute'?'완전탐색':'백트래킹'}의 ${target==='done'?'완료':target==='solution'?'첫 해':'첫 충돌'} 단계로 이동했습니다.`)}
}
function fitImage(ctx,canvas,x,y,width,height){const scale=Math.min(width/canvas.width,height/canvas.height),w=canvas.width*scale,h=canvas.height*scale;ctx.drawImage(canvas,x+(width-w)/2,y+(height-h)/2,w,h)}
function wrap(ctx,text,x,y,width,lineHeight){let line='';for(const char of text){if(ctx.measureText(line+char).width>width){ctx.fillText(line,x,y);line=char;y+=lineHeight}else line+=char}if(line)ctx.fillText(line,x,y);return y+lineHeight}
async function saveSnapshot() {
  if(pngBusy)return;pngBusy=true;setPlaying(false);$('save-step').disabled=true;
  try{
    await document.fonts.ready;
    const a=focusedAlgorithm,e=selected[a],color=palette[a],trace=traces[a];
    const out=document.createElement('canvas');out.width=1800;out.height=1300;const ctx=out.getContext('2d');
    ctx.fillStyle='#f4f3ee';ctx.fillRect(0,0,1800,1300);ctx.fillStyle='#1b292e';ctx.font='700 37px "Noto Sans KR",sans-serif';ctx.fillText(`QUEENS LAB · 4-Queens · ${a==='brute'?'완전탐색':'백트래킹'}`,45,66);
    ctx.font='21px "Noto Sans KR",sans-serif';ctx.fillStyle='#75806f';ctx.fillText(`STEP ${e.index} / ${trace.events.length-1} · 좌표와 배열은 0부터 · ${view.toUpperCase()} 보기`,45,108);
    ctx.fillStyle='#152229';ctx.fillRect(45,150,530,350);fitImage(ctx,$(`board-${a}`),45,150,530,350);
    ctx.fillStyle=color.main;ctx.font='600 23px "Noto Sans KR",sans-serif';ctx.fillText('배열과 변수',615,174);ctx.fillStyle='#718064';ctx.font='17px "IBM Plex Mono",monospace';ctx.fillText(`r=${e.row<0?'−':e.row}  c=${e.col<0?'−':e.col}  depth=${e.stack.length-1}`,615,208);
    let y=260;for(const name of arrayNames){ctx.font='20px "IBM Plex Mono",monospace';ctx.fillStyle='#56674e';ctx.fillText(name,615,y);ctx.fillStyle=color.main;ctx.fillText(`[${e[name].map(formatValue).join(', ')}]`,765,y);y+=52}
    ctx.font='16px "Noto Sans KR",sans-serif';ctx.fillStyle='#7c8b70';wrap(ctx,e.changes.length?e.changes.map(c=>`${c.array}[${c.index}] ${formatValue(c.before)} → ${formatValue(c.after)}`).join(' · '):'이 단계에서는 배열 값이 바뀌지 않습니다.',615,455,540,26);
    const current=trace.nodes[e.nodeId],parent=e.type==='remove'?current:current.parentId===null?current:trace.nodes[current.parentId],level=parent.row+1,path=parent.q.slice(0,level),candidates=children[a].get(parent.id)||[];
    ctx.fillStyle='#e9eee0';ctx.fillRect(1200,150,555,350);ctx.fillStyle='#556b49';ctx.font='600 22px "Noto Sans KR",sans-serif';ctx.fillText('탐색 트리 · 현재 분기',1225,185);ctx.font='17px "IBM Plex Mono",monospace';ctx.textAlign='center';ctx.fillText(`prefix [${path.join(', ')}]`,1477,245);
    for(let c=0;c<n;c++){const x=1265+c*140,node=candidates.find(node=>node.col===c),status=nodeStatus(node,e.index);ctx.strokeStyle=status==='rejected'?'#c98676':'#bbc9ae';ctx.beginPath();ctx.moveTo(1477,265);ctx.lineTo(x,335);ctx.stroke();roundBox(ctx,x-45,335,90,43,5,status==='rejected'?'#f1dfd8':color.light,status==='rejected'?'#c98676':color.main);ctx.fillStyle=status==='future'?'#9ba78f':color.main;ctx.font='19px "IBM Plex Mono",monospace';ctx.fillText(`c=${c}`,x,362);ctx.font='14px "Noto Sans KR",sans-serif';ctx.fillStyle='#80916f';ctx.fillText(status==='future'?'미탐색':status==='rejected'?'후보 제외':status==='solution'?'해':'방문',x,408)}ctx.textAlign='left';
    ctx.fillStyle='#1b292e';ctx.font='700 28px "Noto Sans KR",sans-serif';let yy=wrap(ctx,e.title,45,555,1710,42);ctx.font='21px "Noto Sans KR",sans-serif';ctx.fillStyle='#617359';yy=wrap(ctx,e.explanation,45,yy+10,1710,34);wrap(ctx,`이유: ${e.reason}`,45,yy+10,1710,34);
    ctx.fillStyle='#1d2930';ctx.fillRect(45,755,1710,350);ctx.font='18px "IBM Plex Mono",monospace';const source=trace.codeLines,begin=Math.max(0,e.codeLine-5),end=Math.min(source.length,begin+12);ctx.save();ctx.beginPath();ctx.rect(50,755,1700,350);ctx.clip();
    for(let line=begin;line<end;line++){const cy=786+(line-begin)*27;if(line+1===e.codeLine||(e.type==='commit'&&line+1>e.codeLine&&line+1<e.codeLine+3)||(e.type==='reject'&&a==='backtrack'&&line===e.codeLine)){ctx.fillStyle='#d2c45735';ctx.fillRect(50,cy-20,1700,26)}ctx.fillStyle=line+1===e.codeLine?'#fff8bd':'#bdcbd0';ctx.fillText(`${String(line+1).padStart(2,' ')}  ${source[line]}`,60,cy)}ctx.restore();
    ctx.fillStyle='#65765b';ctx.font='21px "Noto Sans KR",sans-serif';ctx.fillText(`끝 행까지 배치 ${e.stats.fullCandidates} · 생성하지 않고 생략 ${e.stats.skippedCandidates} · 찾은 해 ${e.stats.solutions}`,45,1164);ctx.font='17px "Noto Sans KR",sans-serif';ctx.fillStyle='#89957e';ctx.fillText('선택한 알고리즘의 저장된 한 단계입니다. 단계 수는 실행 시간이나 두 알고리즘의 동일한 작업량을 뜻하지 않습니다.',45,1235);
    out.toBlob(blob=>{if(blob){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`queens-lab-${a}-step-${cursor}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('선택한 단계의 체스판·배열·트리·코드를 저장했습니다.')}},'image/png');
  }finally{pngBusy=false;$('save-step').disabled=false}
}
function frame(time){if(playing){if(!lastTime)lastTime=time;budget+=Math.min(150,time-lastTime)*+$('speed').value/1000;lastTime=time;const count=Math.floor(budget);if(count){budget-=count;goTo(cursor+count,false)}}requestAnimationFrame(frame)}
$('prev').addEventListener('click',()=>goTo(cursor-1));$('next').addEventListener('click',()=>goTo(cursor+1));
$('reset').addEventListener('click',()=>goTo(0));$('timeline').addEventListener('input',e=>goTo(+e.target.value));
$('autoplay').addEventListener('click',()=>{if(cursor===maxCursor)goTo(0);setPlaying(!playing)});
$('speed').addEventListener('input',()=>{$('speed-value').textContent=`${$('speed').value} 단계/초`});
$('board-size').addEventListener('change',loadProblem);
for(const a of algorithms){$(`focus-${a}`).addEventListener('click',()=>focusAlgorithm(a));$(`focus-${a}`).addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();const other=a==='brute'?'backtrack':'brute';focusAlgorithm(other);$(`focus-${other}`).focus()}})}
document.querySelectorAll('.tree-wrapper').forEach(details=>details.addEventListener('toggle',()=>drawTree(focusedAlgorithm)));
for(const mode of ['2d','3d'])$(`view-${mode}`).addEventListener('click',()=>{view=mode;for(const m of ['2d','3d']){$(`view-${m}`).classList.toggle('active',m===mode);$(`view-${m}`).setAttribute('aria-pressed',String(m===mode))}for(const label of document.querySelectorAll('.view-note'))label.textContent=view==='3d'?'3D PROJECTION':'2D BOARD';algorithms.forEach(drawBoard)});
document.querySelectorAll('[data-jump]').forEach(button=>button.addEventListener('click',()=>jump(button.dataset.algorithm,button.dataset.jump)));
$('show-results').addEventListener('click',()=>{for(const a of algorithms)cursors[a]=traces[a].events.length-1;goTo(maxCursor);toast('두 알고리즘을 모두 완료 상태로 이동했습니다.')});
$('save-step').addEventListener('click',saveSnapshot);
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='ArrowLeft'){e.preventDefault();goTo(cursor-1)}if(e.key==='ArrowRight'){e.preventDefault();goTo(cursor+1)}});
new ResizeObserver(()=>{for(const a of algorithms)if(selected[a]){drawBoard(a);drawTree(a);if(a===focusedAlgorithm)keepActiveCodeVisible(a,selected[a])}}).observe($('explorer'));
loadProblem();requestAnimationFrame(frame);
