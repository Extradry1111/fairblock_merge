// Fairblock Merge — match-3 with Firebase leaderboard (anti-spam submit)
const SIZE = 8;
const TYPES = ['cube','spark','shield','node','link','orb'];
const TIME_LIMIT = 60;

// UI refs
const gridEl = document.getElementById('grid');
const scoreEl = document.getElementById('score');
const timerEl = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const hintBtn = document.getElementById('hintBtn');
const muteBtn = document.getElementById('muteBtn');
const leaderBtn = document.getElementById('leaderBtn');

const modal = document.getElementById('modal');
const finalScoreEl = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const scoreForm = document.getElementById('scoreForm');
const playerNameInput = document.getElementById('playerName');
const submitBtn = document.getElementById('submitScoreBtn');
const submitMsg = document.getElementById('submitMsg');

const leaderModal = document.getElementById('leaderModal');
const leaderList = document.getElementById('leaderList');
const closeLeaderBtn = document.getElementById('closeLeaderBtn');

const tileTpl = document.getElementById('tileTpl');

// State
let board = [];
let score = 0;
let timer = null;
let timeLeft = TIME_LIMIT;
let firstPick = null;
let muted = false;

// anti-spam: один сабмит на игру
let scoreSubmitted = false;
// доп. безопасность: уникальный id текущей игры
let currentGameId = null;

// Firebase (у тебя уже подключены compat-скрипты в index.html)
const firebaseConfig = {
  apiKey: "AIzaSyBPwPYj3xlCLj5SbV16jNhYpF3hvTnU8jI",
  authDomain: "fairblock-merge.firebaseapp.com",
  projectId: "fairblock-merge",
  storageBucket: "fairblock-merge.firebasestorage.app",
  messagingSenderId: "220100442149",
  appId: "1:220100442149:web:6b68ba9d94beffa9cb67cc",
  measurementId: "G-77FL5EQHJZ"
};

let app, analytics, auth, db;
window.addEventListener('DOMContentLoaded', async () => {
  app = firebase.initializeApp(firebaseConfig);
  try { analytics = firebase.analytics(); } catch(e){}
  auth = firebase.auth();
  db = firebase.firestore();
  try { await auth.signInAnonymously(); } catch(e){ console.warn(e) }
});

// ----------- SFX -----------
const SFX = {
  blip() { if (muted) return; const o=new (window.AudioContext||window.webkitAudioContext)(); const g=o.createGain(); g.gain.value=.03; const osc=o.createOscillator(); osc.type='triangle'; osc.frequency.value=520; osc.connect(g); g.connect(o.destination); osc.start(); setTimeout(()=>{osc.stop(); o.close()},100) },
  match() { if (muted) return; const o=new (window.AudioContext||window.webkitAudioContext)(); const g=o.createGain(); g.gain.value=.06; const osc=o.createOscillator(); osc.type='sine'; osc.frequency.value=380; osc.connect(g); g.connect(o.destination); osc.start(); setTimeout(()=>{osc.stop(); o.close()},180) },
  tick() { if (muted) return; const o=new (window.AudioContext||window.webkitAudioContext)(); const g=o.createGain(); g.gain.value=.02; const osc=o.createOscillator(); osc.type='square'; osc.frequency.value=720; osc.connect(g); g.connect(o.destination); osc.start(); setTimeout(()=>{osc.stop(); o.close()},50) },
};

// ----------- Utils -----------
function randType(){ return TYPES[Math.floor(Math.random()*TYPES.length)] }
function idx(r,c){ return r*SIZE+c }
function inBounds(r,c){ return r>=0 && r<SIZE && c>=0 && c<SIZE }
function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36) }

function createTile(r,c,type){
  const node = tileTpl.content.firstElementChild.cloneNode(true);
  node.dataset.r = r; node.dataset.c = c; node.dataset.type = type;
  node.querySelector('img').src = `assets/icons/${type}.png`;
  node.addEventListener('click', onTileClick);
  node.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' ') onTileClick(e) })
  node.setAttribute('aria-label', `tile ${type}`);
  return node;
}

function drawBoard(){
  gridEl.innerHTML='';
  gridEl.style.pointerEvents = 'auto';
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const t = createTile(r,c, board[idx(r,c)]);
      gridEl.appendChild(t);
    }
  }
}

function preventStartingMatches(){
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      let current = board[idx(r,c)];
      if(c>=2 && board[idx(r,c-1)]===current && board[idx(r,c-2)]===current){
        board[idx(r,c)] = randType(); c=-1;
      }
      if(r>=2 && board[idx(r-1,c)]===current && board[idx(r-2,c)]===current){
        board[idx(r,c)] = randType(); c=-1;
      }
    }
  }
}

// ----------- Game Flow -----------
function newGame(){
  // reset state
  currentGameId = uid();
  scoreSubmitted = false;
  score = 0; scoreEl.textContent = score;
  timeLeft = TIME_LIMIT; timerEl.textContent = timeLeft;
  firstPick = null;
  if (submitBtn){ submitBtn.disabled = false; }
  if (submitMsg){ submitMsg.textContent = ''; }
  if (playerNameInput){ playerNameInput.value = ''; }

  // (re)build board
  board = Array.from({length: SIZE*SIZE}, randType);
  preventStartingMatches();
  drawBoard();

  // timer
  if (timer) clearInterval(timer);
  timer = setInterval(()=>{
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 10) SFX.tick();
    if (timeLeft <= 0){
      clearInterval(timer);
      endGame();
    }
  }, 1000);
}

function endGame(){
  gridEl.style.pointerEvents = 'none';
  finalScoreEl.textContent = score;
  // при открытии модалки сабмит ещё не делали
  if (submitBtn) submitBtn.disabled = false;
  modal.classList.remove('hidden');
}

function onTileClick(e){
  const cell = e.currentTarget;
  const r = +cell.dataset.r, c = +cell.dataset.c;
  if(!firstPick){
    firstPick = cell;
    cell.classList.add('focus');
    SFX.blip();
    return;
  }
  if(firstPick === cell){ firstPick.classList.remove('focus'); firstPick=null; return; }

  const r2 = +firstPick.dataset.r, c2 = +firstPick.dataset.c;
  // must be adjacent
  if(Math.abs(r-r2)+Math.abs(c-c2)!==1){
    firstPick.classList.remove('focus'); firstPick=null; SFX.blip(); return;
  }
  swapTiles(r,c,r2,c2,true);
}

function swapTiles(r1,c1,r2,c2,requireMatch){
  const i1 = idx(r1,c1), i2=idx(r2,c2);
  const t1 = board[i1], t2 = board[i2];
  board[i1]=t2; board[i2]=t1;
  const a = gridEl.children[i1], b = gridEl.children[i2];
  a.dataset.type=t2; a.querySelector('img').src=`assets/icons/${t2}.png`;
  b.dataset.type=t1; b.querySelector('img').src=`assets/icons/${t1}.png`;
  a.classList.add('swap'); b.classList.add('swap');
  setTimeout(()=>{ a.classList.remove('swap'); b.classList.remove('swap'); },180);

  if(requireMatch){
    const matches = findMatches();
    if(matches.length===0){
      board[i1]=t1; board[i2]=t2;
      a.dataset.type=t1; a.querySelector('img').src=`assets/icons/${t1}.png`;
      b.dataset.type=t2; b.querySelector('img').src=`assets/icons/${t2}.png`;
      firstPick.classList.remove('focus'); firstPick=null;
      return;
    }
  }
  if(firstPick){ firstPick.classList.remove('focus'); firstPick=null; }
  resolveBoard();
}

function findMatches(){
  const matched = [];
  // rows
  for(let r=0;r<SIZE;r++){
    let run=1;
    for(let c=1;c<SIZE;c++){
      if(board[idx(r,c)]===board[idx(r,c-1)]) run++; else{
        if(run>=3){ for(let k=c-run;k<c;k++) matched.push(idx(r,k)); }
        run=1;
      }
    }
    if(run>=3){ for(let k=SIZE-run;k<SIZE;k++) matched.push(idx(r,k)); }
  }
  // cols
  for(let c=0;c<SIZE;c++){
    let run=1;
    for(let r=1;r<SIZE;r++){
      if(board[idx(r,c)]===board[idx(r-1,c)]) run++; else{
        if(run>=3){ for(let k=r-run;k<r;k++) matched.push(idx(k,c)); }
        run=1;
      }
    }
    if(run>=3){ for(let k=SIZE-run;k<SIZE;k++) matched.push(idx(k,c)); }
  }
  return Array.from(new Set(matched));
}

async function resolveBoard(){
  let chain = 0;
  while(true){
    const matches = findMatches();
    if(matches.length===0) break;
    chain++;
    matches.forEach(i=>{
      const el = gridEl.children[i];
      el.classList.add('matching');
      setTimeout(()=>{ el.classList.add('clearing') },120);
    });
    await wait(260);
    matches.forEach(i=>{
      board[i] = null;
      const el = gridEl.children[i];
      el.classList.remove('matching','clearing');
      el.querySelector('img').src='';
    });
    const gained = matches.length * 10 * chain;
    score += gained;
    scoreEl.textContent = score;
    SFX.match();

    // gravity
    for(let c=0;c<SIZE;c++){
      let write = SIZE-1;
      for(let r=SIZE-1;r>=0;r--){
        const i = idx(r,c);
        if(board[i]!=null){
          board[idx(write,c)] = board[i];
          write--;
        }
      }
      while(write>=0){
        board[idx(write,c)] = randType();
        write--;
      }
    }
    // redraw
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const i = idx(r,c);
        const el = gridEl.children[i];
        el.dataset.r=r; el.dataset.c=c; el.dataset.type=board[i];
        el.querySelector('img').src = `assets/icons/${board[i]}.png`;
      }
    }
    await wait(90);
  }
}

function wait(ms){ return new Promise(res=>setTimeout(res,ms)) }

function hint(){
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
      for(const [dr,dc] of dirs){
        const nr=r+dr, nc=c+dc;
        if(!inBounds(nr,nc)) continue;
        const i1=idx(r,c), i2=idx(nr,nc);
        [board[i1],board[i2]]=[board[i2],board[i1]];
        const m = findMatches().length>0;
        [board[i1],board[i2]]=[board[i2],board[i1]];
        if(m){
          const el1 = gridEl.children[i1];
          const el2 = gridEl.children[i2];
          el1.classList.add('focus');
          setTimeout(()=>el1.classList.remove('focus'),700);
          el2.classList.add('focus');
          setTimeout(()=>el2.classList.remove('focus'),700);
          return;
        }
      }
    }
  }
}

// ----------- Leaderboard (Firestore) -----------
async function submitScore(name, score){
  if(!db) { submitMsg.textContent = 'DB not ready, try again.'; return; }
  try{
    await db.collection('scores').add({
      name: (name||'anon').toString().substring(0,20),
      score,
      gameId: currentGameId, // для отладки/аналитики
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    submitMsg.textContent = 'Saved! Open Leaderboard to see your rank.';
  }catch(e){
    console.error(e);
    submitMsg.textContent = 'Failed to save score. Try again later.';
  }
}

async function loadLeaderboard(limit=20){
  if(!db) return [];
  const snap = await db.collection('scores')
    .orderBy('score','desc')
    .limit(limit)
    .get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

async function showLeaderboard(){
  leaderList.innerHTML = '<li>Loading…</li>';
  const rows = await loadLeaderboard(20);
  if(rows.length===0){ leaderList.innerHTML = '<li>No scores yet — be the first!</li>'; return; }
  leaderList.innerHTML = '';
  rows.forEach((r,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>#${i+1} — <strong>${escapeHtml(r.name||'anon')}</strong></span><span>${r.score}</span>`;
    leaderList.appendChild(li);
  });
}

function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])) }

// ----------- Events -----------
startBtn.addEventListener('click', ()=>{ modal.classList.add('hidden'); newGame() });
restartBtn?.addEventListener('click', ()=>{ modal.classList.add('hidden'); newGame() });
closeModalBtn?.addEventListener('click', ()=> modal.classList.add('hidden'));
hintBtn.addEventListener('click', hint);
muteBtn.addEventListener('click', ()=>{ muted=!muted; muteBtn.textContent = muted ? '🔇' : '🔈' });
leaderBtn.addEventListener('click', ()=>{ leaderModal.classList.remove('hidden'); showLeaderboard() });
closeLeaderBtn.addEventListener('click', ()=> leaderModal.classList.add('hidden'));

// Анти-спам: обрабатываем только один сабмит за игру, затем закрываем модалку
scoreForm.addEventListener('submit', async (e)=>{
  e.preventDefault();

  if (scoreSubmitted) {
    // уже внесли результат в этой игре
    return;
  }

  scoreSubmitted = true;           // блокируем повторные нажатия
  if (submitBtn) submitBtn.disabled = true;

  const name = playerNameInput.value.trim() || 'anon';
  await submitScore(name, score);

  // закрываем окно сразу после сохранения
  modal.classList.add('hidden');
});

// ----------- No autostart on load -----------
