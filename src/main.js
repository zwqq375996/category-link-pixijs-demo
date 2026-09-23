import { Application, Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import 'pixi.js/prepare';
import { Game } from './model.js';
import { bindPointer } from './pointer.js';
import { homeMarkup } from './home.js';
import './style.css';
import './theme.css';
import './home.css';

const appleTouchDevice=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
document.documentElement.classList.toggle('ios-device',appleTouchDevice);

const icons = {
  sound:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  hint:'<path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
  shuffle:'<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-7h6v7"/>',
  settings:'<path d="M12 3v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M3 12h2m14 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2.4"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assetUrl = path => path.startsWith('/') ? `${import.meta.env.BASE_URL}${path.slice(1)}` : path;

async function boot() {
  const res = await fetch(`${import.meta.env.BASE_URL}levels.json`); if (!res.ok) throw Error('未找到关卡文件，请先运行素材准备脚本。');
  const { levels } = await res.json();
  const mechanics=[
    {icon:'?',title:'隐藏图块',description:'带 ? 的图块暂时不能连线。连接它上下左右相邻的图块，逐层揭开；数字归零后才能选中。',appears:t=>t.hiddenCounter>0},
    {icon:'🔑',title:'钥匙与锁',description:'带 🔒 的图块暂时不能连线。把带 🔑 的图块与同类图块连线合并，钥匙就会飞向对应的锁并将它打开。',appears:t=>t.restriction===4||t.restriction===5},
    {icon:'+5',title:'加步图块',description:'金色 +5 图块不用连线，直接点按就能增加 5 步。它可能出现在后续待补入的牌中。',appears:t=>t.restriction===7}
  ];
  const firstMechanicByLevel=new Map();
  for(const mechanic of mechanics){
    const index=levels.findIndex(level=>[...level.tiles,...level.pending.flat()].some(mechanic.appears));
    if(index>=0)firstMechanicByLevel.set(index,[...(firstMechanicByLevel.get(index)||[]),mechanic]);
  }
  const storageKey='link-sort-last-level-v1';
  let savedIndex=0;
  try{const value=Number(localStorage.getItem(storageKey));if(Number.isInteger(value)&&value>=0&&value<levels.length)savedIndex=value;}catch{}
  const appRoot = document.querySelector('#app');
  appRoot.innerHTML = `<section class="game" aria-label="Link&amp;Sort 连线归类游戏">
    <header class="top"><div class="level-choice"><span class="level-dot" aria-hidden="true"></span><select id="level" aria-label="选择关卡">${levels.map((l,i)=>`<option value="${i}">第 ${l.id} 关</option>`).join('')}</select></div><div class="moves-status"><small>剩余步数</small><strong id="moves">—</strong></div><div class="tools-top"><button class="icon-btn" id="settings" aria-label="设置" title="设置">${icon('settings')}</button></div></header>
    <div class="targets-section"><button class="targets-label targets-toggle" id="targets-toggle" type="button" aria-controls="targets-drawer" aria-expanded="false"><span>收集所有分类</span><span class="targets-toggle-end"><span id="progress">0 / 4</span><svg class="targets-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></button><div class="targets-drawer" id="targets-drawer" aria-hidden="true" inert><div class="targets" id="targets" aria-label="分类收集进度"></div></div></div>
    <div class="upcoming"><span id="queue-label">待补入</span><div class="queue" id="queue"></div><span class="queue-count" id="queue-count"></span></div>
    <div class="board" id="board" aria-label="游戏棋盘"></div>
    <div class="message" id="message" role="status" aria-live="polite">拖动连接同类图块，松手合并</div>
    <div class="actions"><button class="action primary" id="hint">${icon('hint')}提示</button><button class="action" id="shuffle">${icon('shuffle')}洗牌</button><button class="action" id="reset">${icon('reset')}重开</button></div>
    <div class="overlay" id="overlay" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" id="modal"></section></div>
    ${homeMarkup(levels,firstMechanicByLevel,assetUrl,escape)}
  </section>`;
  const $ = id => document.getElementById(id);
  const gamePanels=[...document.querySelector('.game').children].filter(el=>el.id!=='home'&&el.id!=='overlay');
  gamePanels.forEach(el=>{el.inert=true;});
  let targetsOpen=false;
  function setTargetsOpen(open){
    targetsOpen=open;
    $('targets-toggle').setAttribute('aria-expanded',String(open));
    $('targets-drawer').setAttribute('aria-hidden',String(!open));
    $('targets-drawer').inert=!open;
    $('targets-drawer').classList.toggle('open',open);
  }
  $('targets-toggle').onclick=()=>setTargetsOpen(!targetsOpen);
  document.addEventListener('pointerdown',e=>{
    if(targetsOpen&&e.target instanceof Element&&!e.target.closest('.targets-section'))setTargetsOpen(false);
  });
  const board = $('board');
  const app = new Application();
  await app.init({ width:448,height:420,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true,preference:'webgl',autoStart:false });
  app.ticker.maxFPS=60;
  let renderQueued=false;
  function requestRender(){
    if(renderQueued||app.ticker.started)return;
    renderQueued=true;
    requestAnimationFrame(()=>{renderQueued=false;if(!app.ticker.started)app.render();});
  }
  board.appendChild(app.canvas);app.canvas.style.width='100%';app.canvas.style.height='100%';app.canvas.setAttribute('aria-label','拖动连接同类图片，松手合并');
  app.canvas.setAttribute('role','img');
  const pathsForLevel = level => [...new Set(level.groups.flatMap(g=>[g.symbol,...g.images]).filter(Boolean).map(assetUrl))];
  async function prepareLevel(level){
    const paths=new Set(level.groups.map(g=>g.symbol).filter(Boolean));
    for(const t of [...level.tiles,...level.pending.slice(0,2).flat()]){
      const path=level.groups[t.group]?.images[t.image];if(path)paths.add(path);
    }
    await app.renderer.prepare.upload([...paths].map(path=>Assets.get(assetUrl(path))));
  }
  const levelLoads=new Map();
  function ensureLevelReady(index){
    if(!levelLoads.has(index)){
      const loading=Assets.load(pathsForLevel(levels[index])).then(()=>prepareLevel(levels[index]));
      levelLoads.set(index,loading);
      loading.catch(()=>{if(levelLoads.get(index)===loading)levelLoads.delete(index);});
    }
    return levelLoads.get(index);
  }
  await Assets.load(pathsForLevel(levels[0]));
  const bg = new Graphics(), tileLayer = new Container(), lines = new Graphics(), effects = new Container();
  app.stage.addChild(bg,tileLayer,lines,effects);
  let game, currentLevel=savedIndex, selected=[], hint=[], hintTimer=0, messageTimer=0, gestures=null, busy=false, muted=false, modal=false, epoch=0, hasEntered=false, homeWorking=false;
  let W=448,H=420,cell=100,gap=9,left=0,bottom=0,views=new Map(),highlighted=new Map(),previousStatus='playing',laidOutGame=null,renderedTargetLevel=null,renderedTargetCards=[],renderedCompletionKey=null,renderedQueueRow;
  const tweens=[]; const sounds={};
  for (const name of ['select','merge','wrong','complete','win']) { sounds[name]=new Audio(assetUrl(`/assets/${name}.wav`));sounds[name].volume=name==='select'?.16:.3; }
  function sound(name) { if(muted)return;const a=sounds[name].cloneNode();a.volume=sounds[name].volume;a.play().catch(()=>{}); }
  function say(text,kind='',seconds=2.5){
    const el=$('message'),className='message '+kind;
    if(el.textContent!==text)el.textContent=text;
    if(el.className!==className)el.className=className;
    clearTimeout(messageTimer);
    if(seconds>0)messageTimer=setTimeout(()=>{messageTimer=0;if(!selected.length)say('拖动连接同类图块，松手合并','',0);},seconds*1000);
  }
  function clearHint(){clearTimeout(hintTimer);hintTimer=0;hint=[];}
  function tween(duration,step) {
    const token=epoch;
    return new Promise(resolve=>{tweens.push({start:performance.now()/1000,duration,step,resolve,token});app.ticker.start();});
  }
  function pos(t){return {x:left+t.x*(cell+gap)+cell/2,y:bottom-t.y*(cell+gap)-cell/2};}
  function layout(){
    const b=board.getBoundingClientRect();if(!b.width)return;
    const nextH=Math.max(250,Math.round(b.height*W/b.width));
    if(nextH===H&&laidOutGame===game)return;
    if(nextH!==H){H=nextH;app.renderer.resize(W,H);app.canvas.style.width='100%';app.canvas.style.height='100%';}
    if(!game)return;cell=Math.min(112,(W-42-(game.cols-1)*gap)/game.cols,(H-28-(game.rows-1)*gap)/game.rows);
    left=(W-(game.cols*cell+(game.cols-1)*gap))/2;bottom=(H+(game.rows*cell+(game.rows-1)*gap))/2;
    bg.clear();
    for(let y=0;y<game.rows;y++)for(let x=0;x<game.cols;x++){
      const p=pos({x,y}),r=Math.min(17,cell*.18);
      bg.roundRect(p.x-cell/2,p.y-cell/2,cell,cell,r).fill({color:0xffffff,alpha:.055})
        .roundRect(p.x-cell/2+.5,p.y-cell/2+.5,cell-1,cell-1,r).stroke({width:1,color:0xd9c8ee,alpha:.16});
    }
    for(const t of game.tiles){const v=views.get(t.id);if(v){Object.assign(v.root,pos(t));drawTile(v,t);}}
    laidOutGame=game;highlighted.clear();drawLine();
  }
  function text(value,size,color){const t=new Text({text:value,style:{fontFamily:'Arial',fontSize:size,fontWeight:'bold',fill:color}});t.anchor.set(.5);return t;}
  const tileAppearance=t=>`${t.group}:${t.image}:${t.count}:${t.hiddenCounter}:${t.restriction}:${t.extraMoves}`;
  function drawTile(v,t){
    v.appearance=tileAppearance(t);
    const r=Math.min(17,cell*.18),bonus=t.restriction===7,stack=t.count>1;
    v.base.clear().roundRect(-cell/2,-cell/2+5,cell,cell,r).fill({color:0x19152d,alpha:.37})
      .roundRect(-cell/2,-cell/2,cell,cell,r).fill(bonus?0xffe3a4:stack?0xf0eafa:0xfffdf7)
      .roundRect(-cell/2+1.5,-cell/2+1.5,cell-3,cell-3,r-1).stroke({width:Math.max(1.5,cell*.025),color:bonus?0xe7b85c:stack?0xb5a0d9:0xe9d7bf,alpha:.95})
      .roundRect(-cell/2+4,-cell/2+4,cell-8,cell-8,r-3).stroke({width:1,color:0xffffff,alpha:.9});
    if(cell>55)v.base.circle(-cell*.31,-cell*.31,Math.max(1.5,cell*.024)).fill({color:bonus?0xdca85a:0xd2bbd2,alpha:.85});
    const g=game.level.groups[t.group];const source=g&&(t.count>1?g.symbol:g.images[t.image]);
    if(source){v.image.texture=Assets.get(assetUrl(source));const max=cell*(stack?.55:.72);const scale=Math.min(max/v.image.texture.width,max/v.image.texture.height);v.image.scale.set(scale);v.image.y=stack?-cell*.09:0;}
    v.image.visible=!!source&&!t.hiddenCounter;
    v.image.alpha=t.restriction===4?.32:1;
    v.cover.clear();v.cover.visible=!!t.hiddenCounter;v.coverCount.visible=!!t.hiddenCounter;
    if(t.hiddenCounter){
      v.cover.roundRect(-cell*.45,-cell*.45,cell*.9,cell*.9,r-2).fill(0x5c4b89)
        .roundRect(-cell*.39,-cell*.39,cell*.78,cell*.78,r-4).stroke({width:1.2,color:0xd9c6f2,alpha:.6});
      if(cell>55)v.cover.circle(-cell*.28,-cell*.28,cell*.025).circle(cell*.28,-cell*.28,cell*.025).circle(-cell*.28,cell*.28,cell*.025).circle(cell*.28,cell*.28,cell*.025).fill({color:0xf5d490,alpha:.8});
      v.coverCount.text=`? ${t.hiddenCounter}`;v.coverCount.style.fontSize=Math.max(16,cell*.25);
    }
    v.special.visible=!t.hiddenCounter&&[4,5,7].includes(t.restriction);
    if(v.special.visible){v.special.text=t.restriction===4?'🔒':t.restriction===5?'🔑':`+${t.extraMoves}`;v.special.style.fontSize=t.restriction===7?Math.max(18,cell*.35):Math.max(21,cell*.32);v.special.style.fill=t.restriction===7?0x8a631e:0x3f3167;v.special.position.set(t.restriction===5?cell*.26:0,t.restriction===5?-cell*.27:0);}
    v.badgeBack.clear();v.badgeBack.visible=stack&&!t.hiddenCounter;
    if(stack){v.badgeBack.roundRect(-cell*.33,cell*.225,cell*.66,cell*.225,cell*.1).fill(0x7962aa);}
    v.badge.visible=t.count>1&&!t.hiddenCounter;
    if(stack){v.badge.text=`${t.count} / ${game.totals[t.group]}`;v.badge.style.fontSize=Math.max(10,cell*.13);v.badge.style.fill=0xffffff;v.badge.y=cell*.335;}
    v.root.label=`tile-${t.id}`;
  }
  function newView(t){const root=new Container(),base=new Graphics(),image=new Sprite(),badgeBack=new Graphics(),badge=text('',14,0xffffff),cover=new Graphics(),coverCount=text('',18,0xffffff),special=text('',22,0x3f3167),ring=new Graphics();image.anchor.set(.5);root.addChild(base,image,badgeBack,badge,cover,coverCount,special,ring);tileLayer.addChild(root);const v={root,base,image,badgeBack,badge,cover,coverCount,special,ring};drawTile(v,t);return v;}
  function sync(animate=false){
    const valid=new Set(game.tiles.map(t=>t.id));for(const[id,v]of views)if(!valid.has(id)){v.root.destroy({children:true});views.delete(id);}
    const jobs=[];
    for(const t of game.tiles){let v=views.get(t.id),fresh=!v;if(!v){v=newView(t);views.set(t.id,v);}else if(v.appearance!==tileAppearance(t))drawTile(v,t);
      const target=pos(t);const origin=fresh?{x:target.x,y:target.y-cell*.4}:{x:v.root.x,y:v.root.y};
      if(animate&&(fresh||Math.abs(origin.x-target.x)>.5||Math.abs(origin.y-target.y)>.5)){v.root.alpha=fresh?0:1;v.root.scale.set(1);jobs.push(tween(.24,p=>{const q=1-(1-p)**3;v.root.position.set(origin.x+(target.x-origin.x)*q,origin.y+(target.y-origin.y)*q);v.root.alpha=fresh?q:1;}));}
      else{v.root.position.set(target.x,target.y);v.root.alpha=1;v.root.scale.set(1);}
    }
    drawLine();updateHud();return Promise.all(jobs);
  }
  function drawLine(){
    lines.clear();const ids=selected.length?selected:hint;const wrong=selected.length>1&&selected.some(id=>game.tile(id)?.group!==game.tile(selected[0])?.group);const color=wrong?0xea8798:0x70cccb;
    const ringColor=selected.length?color:0xf4cb78,nextHighlighted=new Map(ids.map(id=>[id,ringColor]));
    for(const id of highlighted.keys())if(!nextHighlighted.has(id))views.get(id)?.ring.clear();
    for(const [id,currentColor] of nextHighlighted)if(highlighted.get(id)!==currentColor){
      const ring=views.get(id)?.ring;if(!ring)continue;
      ring.clear().roundRect(-cell/2,-cell/2,cell,cell,Math.min(18,cell*.18)).stroke({width:Math.max(3,cell*.045),color:currentColor});
    }
    highlighted=nextHighlighted;
    if(ids.length>1){const ps=ids.map(id=>views.get(id)).filter(Boolean).map(v=>v.root.position);lines.moveTo(ps[0].x,ps[0].y);for(const p of ps.slice(1))lines.lineTo(p.x,p.y);lines.stroke({color:selected.length?color:0xf4cb78,width:Math.max(9,cell*.11),cap:'round',join:'round',alpha:.21});lines.moveTo(ps[0].x,ps[0].y);for(const p of ps.slice(1))lines.lineTo(p.x,p.y);lines.stroke({color:selected.length?color:0xf4cb78,width:Math.max(4,cell*.052),cap:'round',join:'round',alpha:.93});for(const p of ps)lines.circle(p.x,p.y,3.5).fill({color:0xffffff,alpha:.95});}
    requestRender();
  }
  function updateButtons(){for(const id of ['hint','shuffle'])$(id).disabled=game.status!=='playing'||busy;}
  function updateHud(){
    $('moves').textContent=game.level.moves>0?game.moves:'∞';$('moves').parentElement.classList.toggle('danger',game.level.moves>0&&game.moves<=5);
    $('progress').textContent=`${game.complete.size} / ${game.level.groups.length}`;
    if(renderedTargetLevel!==game.level){
      $('targets').innerHTML=game.level.groups.map(g=>`<div class="target" title="${escape(g.name)}"><img src="${assetUrl(g.symbol)}" alt=""><div><div class="name">${escape(g.name)}</div><div class="number"><span class="target-value"></span><span class="dot"><i></i></span></div></div></div>`).join('');
      renderedTargetLevel=game.level;renderedTargetCards=[...$('targets').children];renderedCompletionKey=null;renderedQueueRow=undefined;
    }
    game.level.groups.forEach((_,i)=>{
      const done=game.complete.has(i),largest=done?game.totals[i]:Math.max(0,...game.tiles.filter(t=>t.group===i).map(t=>t.count));
      const card=renderedTargetCards[i],value=card.querySelector('.target-value'),bar=card.querySelector('.dot i');
      card.classList.toggle('done',done);
      const label=done?'✓':`${largest} / ${game.totals[i]}`;
      if(value.textContent!==label)value.textContent=label;
      const width=`${largest/game.totals[i]*100}%`;
      if(bar.style.width!==width)bar.style.width=width;
    });
    const completionKey=[...game.complete].sort((a,b)=>a-b).join(',');
    if(completionKey!==renderedCompletionKey){
      const targets=$('targets');
      targets.append(...renderedTargetCards.filter((_,i)=>!game.complete.has(i)),...renderedTargetCards.filter((_,i)=>game.complete.has(i)));
      targets.scrollLeft=0;
      renderedCompletionKey=completionKey;
    }
    const row=game.pending[0]||null;
    if(renderedQueueRow!==row){
      $('queue').innerHTML=(row||[]).map(t=>t.hiddenCounter?`<span class="queue-hidden" aria-label="隐藏图块">?</span>`:t.restriction===7?`<span class="queue-extra" aria-label="加 ${t.extraMoves} 步">+${t.extraMoves}</span>`:`<img src="${assetUrl(game.level.groups[t.group].images[t.image])}" alt="${escape(game.level.groups[t.group].name)}">`).join('');
      renderedQueueRow=row;
    }
    $('queue-label').textContent=row?'待补入':'所有图块已入场';$('queue-count').textContent=row?`剩余 ${game.pending.length} 排`:'';
    updateButtons();
  }
  function prefetchNextLevel(index,token){
    const next=(index+1)%levels.length;
    const start=()=>{if(token===epoch&&currentLevel===index)Assets.backgroundLoad(pathsForLevel(levels[next])).catch(()=>{});};
    if('requestIdleCallback' in window)requestIdleCallback(start,{timeout:1500});else setTimeout(start,800);
  }
  async function loadLevel(index,showIntro=true){
    const token=++epoch;selected=[];clearHint();setTargetsOpen(false);gestures?.cancel();busy=true;
    say(`第 ${levels[index].id} 关加载中…`,'',20);
    try { await ensureLevelReady(index); }
    catch(error){if(token===epoch){busy=false;say(`关卡素材加载失败：${error.message}`,'bad',20);}return false;}
    if(token!==epoch)return false;
    levelLoads.delete(index);
    currentLevel=index;busy=false;previousStatus='playing';
    game=new Game(levels[index]);for(const v of views.values())v.root.destroy({children:true});views.clear();effects.removeChildren().forEach(c=>c.destroy());
    $('level').value=String(index);closeModal();layout();sync();$('targets').scrollLeft=0;say('拖动连接同类图块，松手合并','',5);
    try{localStorage.setItem(storageKey,String(index));}catch{}
    updateHome();
    if(showIntro)showMechanicIntro(index);
    prefetchNextLevel(index,token);return true;
  }
  function hit(p){let nearest=null,distance=Infinity;for(const t of game.tiles){const v=views.get(t.id);const dx=Math.abs(p.x-v.root.x),dy=Math.abs(p.y-v.root.y);if(dx<=cell*.52&&dy<=cell*.52&&dx+dy<distance){nearest=t.id;distance=dx+dy;}}return nearest;}
  function point(e){const r=app.canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
  function begin(id){
    if(busy||modal||game.status!=='playing'||!id)return false;
    const tile=game.tile(id);
    if(tile.restriction===7){collectExtra(id);return false;}
    if(!game.selectable(tile)){say(tile.hiddenCounter?'隐藏图块暂时不能选，连相邻图块揭开它':'锁住的图块暂时不能选，先连接对应钥匙','bad');return false;}
    selected=[id];clearHint();sound('select');drawLine();return true;
  }
  async function collectExtra(id){
    busy=true;const token=epoch,result=game.collectExtra(id);
    if(result.kind!=='extraMoves'){busy=false;return;}
    sound('complete');say(`领取 +${result.amount} 步`,'good',3);
    await sync(true);if(token!==epoch)return;busy=false;layout();updateButtons();checkStatus();
  }
  function extend(id){
    if(!id||!selected.length)return;
    const next=game.extend(selected,id);
    if(next.join(',')===selected.join(',')){
      if(!selected.includes(id)){
        const addition=game.connection(selected.at(-1),id);
        say(addition.some(x=>!game.selectable(game.tile(x)))?'连线经过隐藏、上锁或加步图块，先解除限制':selected.length+addition.length>9?'一次最多连接 9 块，先松手合并':'这段连线经过了已选图块，请往回拖动撤回','bad',2.5);
      }
      return;
    }
    selected=next;sound('select');drawLine();
    const sum=selected.reduce((n,id)=>n+game.tile(id).count,0),g=game.tile(selected[0]).group;
    const wrong=game.validateSelection(selected).kind==='wrong';
    say(wrong?'这条连线里混入了其他分类':'松手合并 · '+game.level.groups[g].name+' '+sum+'/'+game.totals[g],wrong?'bad':'good',99);
  }
  gestures=bindPointer(app.canvas,window,{
    begin:e=>begin(hit(point(e))),
    move:e=>extend(hit(point(e))),
    release:(e,recovered=false)=>{
      // A release on an earlier tile must not undo the already previewed chain.
      // Deliberate backtracking remains available while the pointer is moving.
      const id=hit(point(e));
      if(!recovered&&id&&!selected.includes(id))extend(id);
      commit();
    },
    cancel:()=>{selected=[];drawLine();say('连线已取消，请重新拖动');}
  });
  async function commit(){
    if(busy||modal||game.status!=='playing')return;const ids=[...selected];selected=[];clearHint();drawLine();
    const validation=game.validateSelection(ids);
    if(validation.kind==='ignored'){
      const messages={short:'至少连接 2 个同类图块',path:'连线需要经过中间图块，请重新连接',limit:'一次最多连接 9 块',changed:'图块已变化，请重新连接',restricted:'隐藏、上锁或加步图块不能直接连线',ended:'本关已结束'};
      say(messages[validation.reason]||'请重新连接图块','bad');return;
    }
    const token=epoch;busy=true;updateButtons();const valid=validation.kind==='valid';
    const mergePoint=valid?views.get(ids.at(-1)).root.position.clone():null;
    const lockPoints=valid?new Map(game.tiles.filter(t=>t.restriction===4).map(t=>[t.id,pos(t)])):null;
    if(valid){sound('merge');await tween(.22,p=>{const q=p*p;for(const id of ids.slice(0,-1)){const v=views.get(id);if(!v)continue;const start=pos(game.tile(id));v.root.position.set(start.x+(mergePoint.x-start.x)*q,start.y+(mergePoint.y-start.y)*q);v.root.scale.set(1-p*.45);v.root.alpha=1-p*.7;}});}
    else{sound('wrong');await tween(.28,p=>{for(const id of ids){const t=game.tile(id),v=views.get(id);if(t&&v)v.root.x=pos(t).x+Math.sin(p*Math.PI*6)*7*(1-p);}});}
    if(token!==epoch)return;const result=game.submit(ids);
    if(result.kind==='complete'){sound('complete');burst(pos(game.tile(result.target)||{x:game.cols/2-.5,y:game.rows/2-.5}));say(`${game.level.groups[result.group].name} · 收集完成！${result.unlocked.length?` 解锁 ${result.unlocked.length} 块`:''}`,'good',3);}
    else if(result.kind==='merge')say(result.unlocked.length?`合并成功 · 解锁 ${result.unlocked.length} 块`:result.revealed.length?`合并成功 · 揭开 ${result.revealed.length} 块隐藏图块`:`合并成功 · ${result.count} / ${game.totals[result.group]}`,'good');
    else if(result.kind==='wrong')say('分类不同，少了 1 步，再试试','bad');
    if(result.unlocked?.length){await flyKeys(mergePoint,result.unlocked.map(id=>lockPoints.get(id)).filter(Boolean));if(token!==epoch)return;}
    await sync(true);if(token!==epoch)return;busy=false;layout();updateButtons();checkStatus();
  }
  async function flyKeys(from,targets){
    const token=epoch,scale=Math.max(.75,cell/90);
    await Promise.all(targets.map(to=>{
      const key=new Container();
      const art=new Graphics().circle(0,0,23).fill({color:0xffe09a,alpha:.32})
        .circle(-10,0,7).stroke({width:4,color:0xf6bd43})
        .moveTo(-2,0).lineTo(16,0).stroke({width:5,color:0xf6bd43,cap:'round'})
        .rect(7,1,4,7).rect(13,1,4,6).fill(0xf6bd43);
      key.addChild(art);key.position.set(from.x,from.y);key.scale.set(scale);effects.addChild(key);
      const control={x:(from.x+to.x)/2,y:Math.min(from.y,to.y)-Math.max(30,cell*.55)};
      return tween(.48,p=>{
        const q=1-(1-p)**2,r=1-q;
        key.position.set(r*r*from.x+2*r*q*control.x+q*q*to.x,r*r*from.y+2*r*q*control.y+q*q*to.y);
        key.scale.set(scale*(1+.2*Math.sin(p*Math.PI)));key.rotation=Math.sin(p*Math.PI)*-.25;
      }).then(()=>{
        if(!key.destroyed)key.destroy({children:true});
        if(token!==epoch)return;
        const flash=new Graphics().circle(0,0,cell*.32).stroke({width:4,color:0xffd56b,alpha:.9});
        flash.position.set(to.x,to.y);effects.addChild(flash);
        tween(.25,p=>{flash.alpha=1-p;flash.scale.set(1+p*.5);}).then(()=>{if(!flash.destroyed)flash.destroy();});
      });
    }));
  }
  function burst(p){for(let i=0;i<20;i++){const g=new Graphics().roundRect(-3,-5,6,10,2).fill([0xb599e4,0x76ccbf,0xf1c978,0xed9dba][i%4]);g.position.set(p.x,p.y);effects.addChild(g);const angle=Math.random()*Math.PI*2,speed=40+Math.random()*110;tween(.65,q=>{g.x=p.x+Math.cos(angle)*speed*q;g.y=p.y+Math.sin(angle)*speed*q+80*q*q;g.rotation=q*8;g.alpha=1-q;}).then(()=>{if(!g.destroyed)g.destroy();});}}
  function openModal(html){modal=true;setTargetsOpen(false);gestures?.cancel();selected=[];drawLine();$('overlay').hidden=false;$('modal').innerHTML=html;$('modal').focus();}
  function closeModal(){modal=false;$('overlay').hidden=true;}
  function showSettings(){
    if(busy)return;
    openModal(`<div class="settings-heading-icon">${icon('settings')}</div><h2 id="modal-title">设置</h2><div class="settings-options"><button class="settings-option" id="settings-home">${icon('home')}<span>返回主页</span><span class="settings-value">›</span></button><button class="settings-option" id="settings-sound" aria-pressed="${!muted}">${icon('sound')}<span>音效</span><strong class="settings-value">${muted?'已关闭':'已开启'}</strong></button><button class="settings-option" id="settings-help">${icon('help')}<span>玩法说明</span><span class="settings-value">›</span></button></div><button class="action primary" id="resume">继续游戏</button>`);
    $('settings-home').onclick=showHome;
    $('settings-sound').onclick=()=>{
      muted=!muted;
      $('settings-sound').setAttribute('aria-pressed',String(!muted));
      $('settings-sound').querySelector('.settings-value').textContent=muted?'已关闭':'已开启';
    };
    $('settings-help').onclick=showHelp;
    $('resume').onclick=closeModal;
  }
  function showHelp(){
    openModal(`<div class="big-icon">✧</div><h2 id="modal-title">连起来，归一类</h2><dl><dt>① 拖动连线</dt><dd>按住图块，经过同一分类的其他图块，松手即可合并。往回拖可以撤回连线。</dd><dt>② 凑齐一组</dt><dd>合并后的图块显示累计数量；收齐这个分类的所有图片，就会整组消除。</dd><dt>③ 留意补行</dt><dd>棋盘空出整行后，上方预览的候补牌会按顺序入场；每次最多补两排。混合不同分类会损失一步；没有思路时可用提示和洗牌。</dd><dt>④ 特殊图块</dt><dd>隐藏图块要连周围图块逐层揭开；钥匙随有效合并解开同编号的锁；金色 +5 图块点按即可在试玩版领取步数。</dd></dl><button class="action primary" id="settings-back">返回设置</button><button class="modal-link" id="resume">继续游戏</button>`);
    $('settings-back').onclick=showSettings;
    $('resume').onclick=closeModal;
  }
  function updateHome(){
    const next=game?.status==='won'?(currentLevel+1)%levels.length:currentLevel;
    let title='开始游戏',note='从第 1 关开始';
    if(game?.status==='won'){title=next?'前往下一关':'回到第一关';note=`第 ${levels[next].id} 关等着你`;}
    else if(game?.status==='lost'){title='再试一次';note=`重新挑战第 ${levels[currentLevel].id} 关`;}
    else if(hasEntered){title='继续游戏';note=`第 ${levels[currentLevel].id} 关进行中`;}
    else if(currentLevel>0){title=`继续第 ${levels[currentLevel].id} 关`;note='从本关重新开始';}
    $('home-start-title').textContent=title;$('home-start-note').textContent=note;
    for(const button of $('home-levels').querySelectorAll('[data-home-level]'))button.classList.toggle('current',Number(button.dataset.homeLevel)===next);
  }
  function showHome(){
    if(busy||!game)return;
    closeModal();setTargetsOpen(false);selected=[];clearHint();drawLine();
    $('home-levels').hidden=true;$('home-content').inert=false;$('home').hidden=false;
    gamePanels.forEach(el=>{el.inert=true;});
    updateHome();$('home-start').focus({preventScroll:true});
  }
  function enterGame(showIntro=false){
    $('home').hidden=true;$('home-levels').hidden=true;$('home-content').inert=false;
    gamePanels.forEach(el=>{el.inert=false;});
    hasEntered=true;
    if(showIntro)showMechanicIntro(currentLevel);
    else $('settings').focus({preventScroll:true});
  }
  function showMechanicIntro(index){
    const guides=firstMechanicByLevel.get(index);if(!guides?.length)return;
    const content=guides.map(guide=>`<div class="big-icon">${guide.icon}</div><h3>${guide.title}</h3><p>${guide.description}</p>`).join('');
    openModal(`<div class="mechanic-tag">第 ${levels[index].id} 关 · 新机制</div><h2 id="modal-title">新规则登场</h2>${content}<button class="action primary" id="resume">开始挑战</button>`);
    $('resume').onclick=closeModal;
  }
  function checkStatus(){
    if(game.status===previousStatus||busy)return;
    previousStatus=game.status;updateHome();
    if(game.status==='won'){
      sound('win');
      openModal(`<div class="celebrate">★ ★ ★</div><h2 id="modal-title">全部归类！</h2><p>完成 ${game.level.groups.length} 个分类，使用 ${game.turn} 步。<br>${currentLevel<levels.length-1?'下一关有更多有趣的小东西等着你。':'三十个试玩关卡全部探索完毕。'}</p><button class="action primary" id="next">${currentLevel<levels.length-1?'下一关':'回到第一关'}</button><button class="action" id="again">再玩一次</button><button class="modal-link" id="to-home">返回首页</button>`);
      const next=(currentLevel+1)%levels.length;ensureLevelReady(next).catch(()=>{});
      $('next').onclick=async()=>{const button=$('next');button.disabled=true;button.textContent='正在进入…';if(!await loadLevel(next)&&button.isConnected){button.disabled=false;button.textContent='重试下一关';}};
      $('again').onclick=()=>loadLevel(currentLevel,false);
    }else if(game.status==='lost'){
      openModal(`<div class="big-icon">↻</div><h2 id="modal-title">再试一次</h2><p>步数用完了，还差 ${game.level.groups.length-game.complete.size} 个分类。<br>试着把同类图块一次连得更长。</p><button class="action primary" id="again">重新开始</button><button class="modal-link" id="to-home">返回首页</button>`);
      $('again').onclick=()=>loadLevel(currentLevel,false);
    }
    if($('to-home'))$('to-home').onclick=showHome;
  }
  async function openHomeLevel(index){
    if(homeWorking)return;
    homeWorking=true;
    $('home-levels-intro').textContent=`第 ${levels[index].id} 关加载中…`;
    try{
      if(await loadLevel(index,false)){
        enterGame(true);
        $('home-levels-intro').textContent='想玩哪一关？所有关卡都可以直接进入。';
      }else $('home-levels-intro').textContent='关卡暂时没有加载成功，请再试一次。';
    }catch(error){$('home-levels-intro').textContent=`关卡加载失败：${error.message}`;}
    finally{homeWorking=false;}
  }
  $('level').onchange=e=>loadLevel(Number(e.target.value));
  $('reset').onclick=()=>{if(busy)return;loadLevel(currentLevel,false);};
  $('settings').onclick=showSettings;
  $('home-choose').onclick=()=>{$('home-content').inert=true;$('home-levels').hidden=false;$('home-back').focus({preventScroll:true});};
  $('home-back').onclick=()=>{if(homeWorking)return;$('home-levels').hidden=true;$('home-content').inert=false;$('home-choose').focus({preventScroll:true});};
  $('home-levels').onclick=e=>{const button=e.target instanceof Element?e.target.closest('[data-home-level]'):null;if(button)openHomeLevel(Number(button.dataset.homeLevel));};
  $('hint').onclick=()=>{if(busy||modal)return;clearHint();hint=game.hint();hintTimer=setTimeout(()=>{clearHint();drawLine();},3500);drawLine();say(hint.length?'沿着金色连线拖动试试':'当前没有可连的同类，试试洗牌',hint.length?'good':'');};
  $('shuffle').onclick=async()=>{if(busy||modal)return;busy=true;selected=[];clearHint();game.shuffle();say('图块换了位置，继续找同类吧');sound('merge');await sync(true);busy=false;layout();updateButtons();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){
    if(!$('home').hidden){if(!$('home-levels').hidden&&!homeWorking){$('home-levels').hidden=true;$('home-content').inert=false;$('home-choose').focus({preventScroll:true});}return;}
    if(targetsOpen){setTargetsOpen(false);$('targets-toggle').focus({preventScroll:true});return;}
    if(modal&&game.status==='playing')closeModal();else{selected=[];gestures?.cancel();drawLine();}
  }});
  app.ticker.add(()=>{
    const now=performance.now()/1000;
    for(let i=tweens.length-1;i>=0;i--){
      const t=tweens[i];
      if(t.token!==epoch){tweens.splice(i,1);t.resolve();continue;}
      const p=Math.min(1,(now-t.start)/t.duration);
      t.step(p);
      if(p>=1){tweens.splice(i,1);t.resolve();}
    }
    if(!tweens.length){app.ticker.stop();requestRender();}
  });
  new ResizeObserver(()=>{if(!busy)layout();}).observe(board);
  const initialLevelLoad=loadLevel(savedIndex,false);
  $('home-start').onclick=async()=>{
    if(homeWorking)return;
    homeWorking=true;$('home-start').disabled=true;$('home-status').textContent='正在准备关卡…';
    try{
      if(!game)await initialLevelLoad;
      if(!game)throw Error('关卡暂时没有加载成功，请再试一次。');
      let intro=!hasEntered;
      if(game.status==='won'){
        const next=(currentLevel+1)%levels.length;
        if(!await loadLevel(next,false))throw Error('下一关暂时没有加载成功，请再试一次。');
        intro=true;
      }else if(game.status==='lost'){
        if(!await loadLevel(currentLevel,false))throw Error('关卡暂时没有加载成功，请再试一次。');
        intro=false;
      }
      enterGame(intro);$('home-status').textContent='';
    }catch(error){$('home-status').textContent=error.message;}
    finally{homeWorking=false;$('home-start').disabled=false;}
  };
  // Read-only test visibility; actions still flow through DOM pointer handlers.
  if(import.meta.env.DEV)window.__demo={snapshot:()=>game.snapshot(),hint:()=>game.hint(),coords:id=>{const t=game.tile(id);if(!t)return null;const p=pos(t),r=app.canvas.getBoundingClientRect();return{x:r.left+p.x*r.width/W,y:r.top+p.y*r.height/H};},isBusy:()=>busy};
}
boot().catch(error=>{console.error(error);document.querySelector('#app').innerHTML=`<div class="error"><h2>加载没有完成</h2><p>${escape(error.message)}</p><button onclick="location.reload()">重新加载</button></div>`;});
