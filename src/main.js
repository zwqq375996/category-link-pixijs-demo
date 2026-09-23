import { Application, Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import 'pixi.js/prepare';
import { Game } from './model.js';
import { bindPointer } from './pointer.js';
import './style.css';

const icons = {
  sound:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  hint:'<path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
  shuffle:'<path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assetUrl = path => path.startsWith('/') ? `${import.meta.env.BASE_URL}${path.slice(1)}` : path;

async function boot() {
  const res = await fetch(`${import.meta.env.BASE_URL}levels.json`); if (!res.ok) throw Error('未找到关卡文件，请先运行素材准备脚本。');
  const { levels } = await res.json();
  const appRoot = document.querySelector('#app');
  appRoot.innerHTML = `<section class="game" aria-label="Category Link 连线归类游戏">
    <header class="top"><div class="brand"><div class="brand-title">CATEGORY <b>LINK</b></div><div class="level-choice"><span class="level-dot"></span><select id="level" aria-label="选择关卡">${levels.map((l,i)=>`<option value="${i}">第 ${l.id} 关</option>`).join('')}</select></div></div><div class="moves-status"><small>剩余步数</small><strong id="moves">—</strong></div><div class="tools-top"><button class="icon-btn" id="sound" aria-label="关闭声音" title="声音">${icon('sound')}</button><button class="icon-btn" id="help" aria-label="玩法说明">${icon('help')}</button></div></header>
    <div class="targets-label"><span>收集所有分类</span><span id="progress">0 / 4</span></div><div class="targets" id="targets" aria-label="分类收集进度"></div>
    <div class="upcoming"><span id="queue-label">待补入</span><div class="queue" id="queue"></div><span class="queue-count" id="queue-count"></span></div>
    <div class="board" id="board" aria-label="游戏棋盘"></div>
    <div class="message" id="message" role="status" aria-live="polite">拖动连接同类图块，松手合并</div>
    <div class="actions"><button class="action primary" id="hint">${icon('hint')}提示</button><button class="action" id="shuffle">${icon('shuffle')}洗牌</button><button class="action" id="reset">${icon('reset')}重开</button></div>
    <div class="overlay" id="overlay" hidden><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1" id="modal"></section></div>
  </section>`;
  const $ = id => document.getElementById(id);
  const board = $('board');
  const app = new Application();
  await app.init({ width:448,height:420,backgroundAlpha:0,antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true,preference:'webgl' });
  app.ticker.maxFPS=60;
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
  let game, currentLevel=0, selected=[], hint=[], hintUntil=0, gestures=null, busy=false, muted=false, modal=false, epoch=0;
  let W=448,H=420,cell=100,gap=9,left=0,bottom=0,views=new Map(),time=0,messageUntil=0,previousStatus='playing',laidOutGame=null,renderedTargetLevel=null,renderedQueueRow;
  const tweens=[]; const sounds={};
  for (const name of ['select','merge','wrong','complete','win']) { sounds[name]=new Audio(assetUrl(`/assets/${name}.wav`));sounds[name].volume=name==='select'?.16:.3; }
  function sound(name) { if(muted)return;const a=sounds[name].cloneNode();a.volume=sounds[name].volume;a.play().catch(()=>{}); }
  function say(text,kind='',seconds=2.5){const el=$('message'),className='message '+kind;if(el.textContent!==text)el.textContent=text;if(el.className!==className)el.className=className;messageUntil=seconds>0?time+seconds:0;}
  function tween(duration,step) { const token=epoch;return new Promise(resolve=>tweens.push({start:time,duration,step,resolve,token})); }
  function pos(t){return {x:left+t.x*(cell+gap)+cell/2,y:bottom-t.y*(cell+gap)-cell/2};}
  function layout(){
    const b=board.getBoundingClientRect();if(!b.width)return;
    const nextH=Math.max(250,Math.round(b.height*W/b.width));
    if(nextH===H&&laidOutGame===game)return;
    if(nextH!==H){H=nextH;app.renderer.resize(W,H);app.canvas.style.width='100%';app.canvas.style.height='100%';}
    if(!game)return;cell=Math.min(112,(W-42-(game.cols-1)*gap)/game.cols,(H-28-(game.rows-1)*gap)/game.rows);
    left=(W-(game.cols*cell+(game.cols-1)*gap))/2;bottom=(H+(game.rows*cell+(game.rows-1)*gap))/2;
    bg.clear();
    for(let y=0;y<game.rows;y++)for(let x=0;x<game.cols;x++){const p=pos({x,y});bg.roundRect(p.x-cell/2,p.y-cell/2,cell,cell,16).fill({color:0xd9d9eb,alpha:.36});}
    for(const t of game.tiles){const v=views.get(t.id);if(v){Object.assign(v.root,pos(t));drawTile(v,t);}}
    laidOutGame=game;drawLine();
  }
  function text(value,size,color){const t=new Text({text:value,style:{fontFamily:'Arial',fontSize:size,fontWeight:'bold',fill:color}});t.anchor.set(.5);return t;}
  const tileAppearance=t=>`${t.group}:${t.image}:${t.count}:${t.hiddenCounter}:${t.restriction}:${t.extraMoves}`;
  function drawTile(v,t){
    v.appearance=tileAppearance(t);
    v.base.clear().roundRect(-cell/2,-cell/2+4,cell,cell,Math.min(18,cell*.18)).fill(0xcac7df)
      .roundRect(-cell/2,-cell/2,cell,cell,Math.min(18,cell*.18)).fill(t.restriction===7?0xffe7a8:t.count>1?0xf2edff:0xffffff)
      .roundRect(-cell/2+2,-cell/2+2,cell-4,cell-4,Math.min(17,cell*.17)).stroke({width:1,color:0xffffff,alpha:.8});
    const g=game.level.groups[t.group];const source=g&&(t.count>1?g.symbol:g.images[t.image]);
    if(source){v.image.texture=Assets.get(assetUrl(source));const max=cell*(t.count>1?.57:.72);const scale=Math.min(max/v.image.texture.width,max/v.image.texture.height);v.image.scale.set(scale);v.image.y=t.count>1?-cell*.075:0;}
    v.image.visible=!!source&&!t.hiddenCounter;
    v.image.alpha=t.restriction===4?.32:1;
    v.cover.clear();v.cover.visible=!!t.hiddenCounter;v.coverCount.visible=!!t.hiddenCounter;
    if(t.hiddenCounter){v.cover.roundRect(-cell*.44,-cell*.44,cell*.88,cell*.88,Math.min(17,cell*.17)).fill(0x7764aa);v.coverCount.text=`?  ${t.hiddenCounter}`;v.coverCount.style.fontSize=Math.max(16,cell*.25);}
    v.special.visible=!t.hiddenCounter&&[4,5,7].includes(t.restriction);
    if(v.special.visible){v.special.text=t.restriction===4?'🔒':t.restriction===5?'🔑':`+${t.extraMoves}`;v.special.style.fontSize=t.restriction===7?Math.max(18,cell*.35):Math.max(21,cell*.32);v.special.style.fill=t.restriction===7?0x8a631e:0x3f3167;v.special.position.set(t.restriction===5?cell*.26:0,t.restriction===5?-cell*.27:0);}
    v.badge.visible=t.count>1&&!t.hiddenCounter;
    if(t.count>1){v.badge.text=`${t.count} / ${game.totals[t.group]}`;v.badge.style.fontSize=Math.max(11,cell*.14);v.badge.y=cell*.33;}
    v.root.label=`tile-${t.id}`;
  }
  function newView(t){const root=new Container(),base=new Graphics(),image=new Sprite(),badge=text('',14,0x8673ab),cover=new Graphics(),coverCount=text('',18,0xffffff),special=text('',22,0x3f3167),ring=new Graphics();image.anchor.set(.5);root.addChild(base,image,badge,cover,coverCount,special,ring);tileLayer.addChild(root);const v={root,base,image,badge,cover,coverCount,special,ring};drawTile(v,t);return v;}
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
    lines.clear();const ids=selected.length?selected:(time<hintUntil?hint:[]);const wrong=selected.length>1&&selected.some(id=>game.tile(id)?.group!==game.tile(selected[0])?.group);const color=wrong?0xea8798:0x70cccb;
    for(const[id,v]of views){v.ring.clear();if(ids.includes(id)){v.ring.roundRect(-cell/2,-cell/2,cell,cell,Math.min(18,cell*.18)).stroke({width:3,color:selected.length?color:0xd5b05e});}}
    if(ids.length>1){const ps=ids.map(id=>views.get(id)).filter(Boolean).map(v=>v.root.position);lines.moveTo(ps[0].x,ps[0].y);for(const p of ps.slice(1))lines.lineTo(p.x,p.y);lines.stroke({color:selected.length?color:0xd5b05e,width:Math.max(5,cell*.058),cap:'round',join:'round',alpha:selected.length?.8:.48});for(const p of ps)lines.circle(p.x,p.y,4).fill({color:0xffffff,alpha:.9});}
  }
  function updateButtons(){for(const id of ['hint','shuffle'])$(id).disabled=game.status!=='playing'||busy;}
  function updateHud(){
    $('moves').textContent=game.level.moves>0?game.moves:'∞';$('moves').parentElement.classList.toggle('danger',game.level.moves>0&&game.moves<=5);
    $('progress').textContent=`${game.complete.size} / ${game.level.groups.length}`;
    if(renderedTargetLevel!==game.level){
      $('targets').innerHTML=game.level.groups.map(g=>`<div class="target" title="${escape(g.name)}"><img src="${assetUrl(g.symbol)}" alt=""><div><div class="name">${escape(g.name)}</div><div class="number"><span class="target-value"></span><span class="dot"><i></i></span></div></div></div>`).join('');
      renderedTargetLevel=game.level;renderedQueueRow=undefined;
    }
    game.level.groups.forEach((_,i)=>{
      const done=game.complete.has(i),largest=done?game.totals[i]:Math.max(0,...game.tiles.filter(t=>t.group===i).map(t=>t.count));
      const card=$('targets').children[i],value=card.querySelector('.target-value'),bar=card.querySelector('.dot i');
      card.classList.toggle('done',done);
      const label=done?'✓':`${largest} / ${game.totals[i]}`;
      if(value.textContent!==label)value.textContent=label;
      const width=`${largest/game.totals[i]*100}%`;
      if(bar.style.width!==width)bar.style.width=width;
    });
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
  async function loadLevel(index){
    const token=++epoch;selected=[];hint=[];gestures?.cancel();busy=true;
    say(`第 ${levels[index].id} 关加载中…`,'',20);
    try { await ensureLevelReady(index); }
    catch(error){if(token===epoch){busy=false;say(`关卡素材加载失败：${error.message}`,'bad',20);}return false;}
    if(token!==epoch)return false;
    levelLoads.delete(index);
    currentLevel=index;busy=false;previousStatus='playing';
    game=new Game(levels[index]);for(const v of views.values())v.root.destroy({children:true});views.clear();effects.removeChildren().forEach(c=>c.destroy());
    $('level').value=String(index);closeModal();layout();sync();$('targets').scrollLeft=0;say('拖动连接同类图块，松手合并','',5);
    prefetchNextLevel(index,token);return true;
  }
  function hit(p){let nearest=null,distance=Infinity;for(const t of game.tiles){const v=views.get(t.id);const dx=Math.abs(p.x-v.root.x),dy=Math.abs(p.y-v.root.y);if(dx<=cell*.52&&dy<=cell*.52&&dx+dy<distance){nearest=t.id;distance=dx+dy;}}return nearest;}
  function point(e){const r=app.canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
  function begin(id){
    if(busy||modal||game.status!=='playing'||!id)return false;
    const tile=game.tile(id);
    if(tile.restriction===7){collectExtra(id);return false;}
    if(!game.selectable(tile)){say(tile.hiddenCounter?'隐藏图块暂时不能选，连相邻图块揭开它':'锁住的图块暂时不能选，先连接对应钥匙','bad');return false;}
    selected=[id];hint=[];sound('select');drawLine();return true;
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
    if(busy||modal||game.status!=='playing')return;const ids=[...selected];selected=[];hint=[];drawLine();
    const validation=game.validateSelection(ids);
    if(validation.kind==='ignored'){
      const messages={short:'至少连接 2 个同类图块',path:'连线需要经过中间图块，请重新连接',limit:'一次最多连接 9 块',changed:'图块已变化，请重新连接',restricted:'隐藏、上锁或加步图块不能直接连线',ended:'本关已结束'};
      say(messages[validation.reason]||'请重新连接图块','bad');return;
    }
    const token=epoch;busy=true;updateButtons();const valid=validation.kind==='valid';
    if(valid){const target=views.get(ids.at(-1)).root.position.clone();sound('merge');await tween(.22,p=>{const q=p*p;for(const id of ids.slice(0,-1)){const v=views.get(id);if(!v)continue;const start=pos(game.tile(id));v.root.position.set(start.x+(target.x-start.x)*q,start.y+(target.y-start.y)*q);v.root.scale.set(1-p*.45);v.root.alpha=1-p*.7;}});}
    else{sound('wrong');await tween(.28,p=>{for(const id of ids){const t=game.tile(id),v=views.get(id);if(t&&v)v.root.x=pos(t).x+Math.sin(p*Math.PI*6)*7*(1-p);}});}
    if(token!==epoch)return;const result=game.submit(ids);
    if(result.kind==='complete'){sound('complete');burst(pos(game.tile(result.target)||{x:game.cols/2-.5,y:game.rows/2-.5}));say(`${game.level.groups[result.group].name} · 收集完成！${result.unlocked.length?` 解锁 ${result.unlocked.length} 块`:''}`,'good',3);}
    else if(result.kind==='merge')say(result.unlocked.length?`合并成功 · 解锁 ${result.unlocked.length} 块`:result.revealed.length?`合并成功 · 揭开 ${result.revealed.length} 块隐藏图块`:`合并成功 · ${result.count} / ${game.totals[result.group]}`,'good');
    else if(result.kind==='wrong')say('分类不同，少了 1 步，再试试','bad');
    await sync(true);if(token!==epoch)return;busy=false;layout();updateButtons();checkStatus();
  }
  function burst(p){for(let i=0;i<20;i++){const g=new Graphics().roundRect(-3,-5,6,10,2).fill([0xb599e4,0x76ccbf,0xf1c978,0xed9dba][i%4]);g.position.set(p.x,p.y);effects.addChild(g);const angle=Math.random()*Math.PI*2,speed=40+Math.random()*110;tween(.65,q=>{g.x=p.x+Math.cos(angle)*speed*q;g.y=p.y+Math.sin(angle)*speed*q+80*q*q;g.rotation=q*8;g.alpha=1-q;}).then(()=>{if(!g.destroyed)g.destroy();});}}
  function openModal(html){modal=true;gestures?.cancel();selected=[];drawLine();$('overlay').hidden=false;$('modal').innerHTML=html;$('modal').focus();}
  function closeModal(){modal=false;$('overlay').hidden=true;}
  function checkStatus(){if(game.status===previousStatus||busy)return;previousStatus=game.status;if(game.status==='won'){sound('win');openModal(`<div class="celebrate">★ ★ ★</div><h2 id="modal-title">全部归类！</h2><p>完成 ${game.level.groups.length} 个分类，使用 ${game.turn} 步。<br>${currentLevel<levels.length-1?'下一关有更多有趣的小东西等着你。':'三十个试玩关卡全部探索完毕。'}</p><button class="action primary" id="next">${currentLevel<levels.length-1?'下一关':'回到第一关'}</button><button class="action" id="again">再玩一次</button>`);const next=(currentLevel+1)%levels.length;ensureLevelReady(next).catch(()=>{});$('next').onclick=async()=>{const button=$('next');button.disabled=true;button.textContent='正在进入…';if(!await loadLevel(next)&&button.isConnected){button.disabled=false;button.textContent='重试下一关';}};$('again').onclick=()=>loadLevel(currentLevel);}
    else if(game.status==='lost'){openModal(`<div class="big-icon">↻</div><h2 id="modal-title">再试一次</h2><p>步数用完了，还差 ${game.level.groups.length-game.complete.size} 个分类。<br>试着把同类图块一次连得更长。</p><button class="action primary" id="again">重新开始</button>`);$('again').onclick=()=>loadLevel(currentLevel);}}
  $('level').onchange=e=>loadLevel(Number(e.target.value));
  $('reset').onclick=()=>{if(busy)return;loadLevel(currentLevel);};
  $('hint').onclick=()=>{if(busy||modal)return;hint=game.hint();hintUntil=time+3.5;drawLine();say(hint.length?'沿着金色连线拖动试试':'当前没有可连的同类，试试洗牌',hint.length?'good':'');};
  $('shuffle').onclick=async()=>{if(busy||modal)return;busy=true;selected=[];hint=[];game.shuffle();say('图块换了位置，继续找同类吧');sound('merge');await sync(true);busy=false;layout();updateButtons();};
  $('sound').onclick=()=>{muted=!muted;$('sound').classList.toggle('sound-off',muted);$('sound').setAttribute('aria-label',muted?'打开声音':'关闭声音');$('sound').setAttribute('aria-pressed',String(!muted));};
  $('help').onclick=()=>{if(busy)return;openModal(`<div class="big-icon">✧</div><h2 id="modal-title">连起来，归一类</h2><dl><dt>① 拖动连线</dt><dd>按住图块，经过同一分类的其他图块，松手即可合并。往回拖可以撤回连线。</dd><dt>② 凑齐一组</dt><dd>合并后的图块显示累计数量；收齐这个分类的所有图片，就会整组消除。</dd><dt>③ 留意补行</dt><dd>棋盘空出整行后，上方预览的候补牌会按顺序入场；每次最多补两排。混合不同分类会损失一步；没有思路时可用提示和洗牌。</dd><dt>④ 特殊图块</dt><dd>隐藏图块要连周围图块逐层揭开；钥匙随有效合并解开同编号的锁；金色 +5 图块点按即可在试玩版领取步数。</dd></dl><button class="action primary" id="resume">继续游戏</button>`);$('resume').onclick=closeModal;};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(modal&&game.status==='playing')closeModal();else{selected=[];gestures?.cancel();drawLine();}}});
  app.ticker.add(ticker=>{const dt=Math.min(ticker.deltaMS/1000,.08);time+=dt;
    for(let i=tweens.length-1;i>=0;i--){const t=tweens[i];if(t.token!==epoch){tweens.splice(i,1);t.resolve();continue;}const p=Math.min(1,(time-t.start)/t.duration);t.step(p);if(p>=1){tweens.splice(i,1);t.resolve();}}
    if(game){if(hint.length&&time>=hintUntil){hint=[];drawLine();}if(messageUntil&&time>messageUntil&&!selected.length){messageUntil=0;say('拖动连接同类图块，松手合并','',0);}}});
  new ResizeObserver(()=>{if(!busy)layout();}).observe(board);
  loadLevel(0);
  // Read-only test visibility; actions still flow through DOM pointer handlers.
  if(import.meta.env.DEV)window.__demo={snapshot:()=>game.snapshot(),hint:()=>game.hint(),coords:id=>{const t=game.tile(id);if(!t)return null;const p=pos(t),r=app.canvas.getBoundingClientRect();return{x:r.left+p.x*r.width/W,y:r.top+p.y*r.height/H};},isBusy:()=>busy};
}
boot().catch(error=>{console.error(error);document.querySelector('#app').innerHTML=`<div class="error"><h2>加载没有完成</h2><p>${escape(error.message)}</p><button onclick="location.reload()">重新加载</button></div>`;});
