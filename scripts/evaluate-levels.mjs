import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Game } from '../src/model.js';

// These are explicit hypotheses about play styles, not estimates of real users.
export const profiles = {
  newcomer: { label:'新手', hintRate:.08, mistakeRate:.06, stopRate:.40, earlyShuffle:.08, temperature:2.4, lengthWeight:.35 },
  regular: { label:'普通', hintRate:.18, mistakeRate:.03, stopRate:.28, earlyShuffle:.035, temperature:1.5, lengthWeight:.75 },
  practiced: { label:'熟练', hintRate:.1, mistakeRate:.005, stopRate:.07, earlyShuffle:.01, temperature:.65, lengthWeight:1.4 },
};

function randomFrom(seed) {
  let state=seed>>>0;
  return () => ((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
}

function choose(items,score,temperature,random) {
  const scores=items.map(score),highest=Math.max(...scores);
  const weights=scores.map(value=>Math.exp((value-highest)/temperature));
  let roll=random()*weights.reduce((sum,value)=>sum+value,0);
  for(let i=0;i<items.length;i++){roll-=weights[i];if(roll<=0)return items[i];}
  return items.at(-1);
}

function validPairs(game) {
  const tiles=game.tiles.filter(tile=>game.selectable(tile)&&tile.group>=0);
  const pairs=[],seen=new Set();
  for(const from of tiles)for(const to of tiles){
    if(from.id===to.id||from.group!==to.group)continue;
    const path=game.extend([from.id],to.id),key=path.join(',');
    if(path.length<2||seen.has(key)||path.some(id=>game.tile(id).group!==from.group))continue;
    if(game.validateSelection(path).kind!=='valid')continue;
    pairs.push(path);seen.add(key);
  }
  return pairs;
}

function pathScore(game,path,profile) {
  const tiles=path.map(id=>game.tile(id)),group=tiles[0].group;
  const count=tiles.reduce((sum,tile)=>sum+tile.count,0);
  const distance=Math.abs(tiles[0].x-tiles.at(-1).x)+Math.abs(tiles[0].y-tiles.at(-1).y);
  const key=tiles.some(tile=>tile.restriction===5);
  let covered=0;
  for(const tile of game.tiles)if(tile.hiddenCounter){
    covered+=tiles.filter(part=>Math.abs(part.x-tile.x)+Math.abs(part.y-tile.y)===1).length;
  }
  return profile.lengthWeight*path.length + 3*count/game.totals[group]
    + (count===game.totals[group]?3:0) + (key?3:0) + Math.min(covered,3)*.35
    - distance*(profile===profiles.newcomer?.45:.1);
}

function growPath(game,path,profile,random) {
  while(path.length<9&&random()>=profile.stopRate){
    const group=game.tile(path[0]).group,options=[];
    for(const tile of game.tiles){
      if(tile.group!==group||!game.selectable(tile)||path.includes(tile.id))continue;
      const next=game.extend(path,tile.id);
      if(next.length>path.length&&next.every(id=>game.tile(id).group===group)
        &&game.validateSelection(next).kind==='valid')options.push(next);
    }
    if(!options.length)break;
    path=choose(options,next=>pathScore(game,next,profile),profile.temperature,random);
  }
  return path;
}

function wrongPath(game,random) {
  const tiles=game.tiles.filter(tile=>game.selectable(tile)&&tile.group>=0);
  for(let attempt=0;attempt<24;attempt++){
    if(tiles.length<2)break;
    const from=tiles[Math.floor(random()*tiles.length)],to=tiles[Math.floor(random()*tiles.length)];
    if(from.group===to.group)continue;
    const path=game.extend([from.id],to.id);
    if(game.validateSelection(path).kind==='wrong')return path;
  }
  return null;
}

export function play(level,profile,seed) {
  const game=new Game(level),random=randomFrom(seed);
  let hints=0,shuffles=0,wrong=0,bonuses=0,reason='';
  for(let action=0;action<300&&game.status==='playing';action++){
    const bonus=game.tiles.find(tile=>tile.restriction===7);
    if(bonus){game.collectExtra(bonus.id);bonuses++;continue;}
    const pairs=validPairs(game);
    if(!pairs.length){
      if(shuffles>=12){reason='stalled';break;}
      game.shuffle(random);shuffles++;continue;
    }
    if(pairs.length<4&&random()<profile.earlyShuffle&&shuffles<12){
      game.shuffle(random);shuffles++;continue;
    }
    if(random()<profile.mistakeRate){
      const bad=wrongPath(game,random);
      if(bad){game.submit(bad);wrong++;continue;}
    }
    let path;
    if(random()<profile.hintRate){path=game.hint();hints++;}
    if(!path?.length){
      path=choose(pairs,candidate=>pathScore(game,candidate,profile),profile.temperature,random);
      path=growPath(game,path,profile,random);
    }
    const result=game.submit(path);
    if(result.kind==='ignored')throw Error(`Simulator produced an invalid path in level ${level.id}`);
  }
  if(game.status==='playing'&&!reason)reason='action limit';
  return { status:game.status==='playing'?'stalled':game.status,reason,turns:game.turn,
    remaining:game.moves,hints,shuffles,wrong,bonuses,completed:game.complete.size };
}

function quantile(values,fraction) {
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor((sorted.length-1)*fraction)];
}

function wilson(success,total) {
  const z=1.96,p=success/total,denominator=1+z*z/total;
  const center=(p+z*z/(2*total))/denominator;
  const half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/denominator;
  return [Math.max(0,center-half),Math.min(1,center+half)];
}

function summarize(trials) {
  const won=trials.filter(trial=>trial.status==='won'),total=trials.length;
  return { runs:total,wins:won.length,losses:trials.filter(t=>t.status==='lost').length,
    stalled:trials.filter(t=>t.status==='stalled').length,
    winRate:won.length/total,winRate95:wilson(won.length,total),
    remaining:{p10:quantile(won.map(t=>t.remaining),.1),median:quantile(won.map(t=>t.remaining),.5),p90:quantile(won.map(t=>t.remaining),.9),best:won.length?Math.max(...won.map(t=>t.remaining)):null},
    turnsMedian:quantile(won.map(t=>t.turns),.5),
    hintsMedian:quantile(trials.map(t=>t.hints),.5),
    shufflesMedian:quantile(trials.map(t=>t.shuffles),.5),
    shufflesP90:quantile(trials.map(t=>t.shuffles),.9),
    wrongMedian:quantile(trials.map(t=>t.wrong),.5) };
}

export function evaluate(levels,{runs=200,seed=20260923,levelNumbers=levels.map(l=>l.id)}={}) {
  const results={};
  for(const number of levelNumbers){
    const level=levels.find(entry=>entry.id===number);
    if(!level)throw Error(`Missing level ${number}`);
    results[number]={};
    for(const [name,profile] of Object.entries(profiles)){
      const trials=Array.from({length:runs},(_,index)=>play(level,profile,
        (seed ^ Math.imul(number,0x9e3779b1) ^ Math.imul(index+1,0x85ebca6b) ^ Math.imul(name.length,0xc2b2ae35))>>>0));
      results[number][name]={...summarize(trials),trials};
    }
  }
  return results;
}

function parseArgs(argv) {
  const options={runs:200,seed:20260923,output:'reports/difficulty-evaluation'};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(key==='--runs')options.runs=Number(argv[++i]);
    else if(key==='--seed')options.seed=Number(argv[++i]);
    else if(key==='--output')options.output=argv[++i];
    else if(key==='--baseline-rev')options.baselineRev=argv[++i];
    else throw Error(`Unknown argument ${key}`);
  }
  if(!Number.isInteger(options.runs)||options.runs<1||!Number.isInteger(options.seed))throw Error('Invalid runs or seed');
  return options;
}

function percent(value){return `${Math.round(value*100)}%`;}
function display(value){return value===null?'—':String(value);}

function markdown(report) {
  const lines=[
    '# Link&Sort 关卡模拟评估',
    '',
    `每关、每种玩家模型运行 ${report.runs} 次；随机种子 ${report.seed}。这是规则假设下的离线模拟，尚未用真实玩家数据校准。`,
    '',
    '新手更偏向短连线，普通玩家会适度规划，熟练玩家更常规划长连线。三类模型单回合使用提示的概率分别设为 8%、18%、10%，尝试误连的概率分别设为 6%、3%、0.5%；洗牌不消耗步数，最多尝试 12 次。',
    '',
    '通关率括号内是 95% Wilson 区间；剩余步数是通关局的中位数。最佳剩余步数只是搜索到的最好结果，不代表理论最优。',
  ];
  if(report.current[10]&&report.current[19]){
    const win=number=>percent(report.current[number].newcomer.winRate);
    const stalls=Object.values(report.current).reduce((sum,byProfile)=>sum+Object.values(byProfile).reduce((n,result)=>n+result.stalled,0),0);
    lines.push('',`新手假设模型：第 10 关 ${win(10)}；第 11–14 关依次为 ${[11,12,13,14].map(win).join('、')}；第 15、17、19 关依次为 ${[15,17,19].map(win).join('、')}。当前版本共观察到 ${stalls} 次无路可走的终局；随机模拟不能证明所有走法都不会卡死。`);
  }
  if(report.baseline){
    const old=number=>percent(report.baseline[number].newcomer.winRate);
    const now=number=>percent(report.current[number].newcomer.winRate);
    lines.push('',`配对比较中，第 13 关的新手假设通关率由 ${old(13)} 升至 ${now(13)}，第 14 关由 ${old(14)} 升至 ${now(14)}。`);
  }
  lines.push('','| 关卡 | 新手通关率 | 普通通关率 | 熟练通关率 | 普通中位剩余步 | 普通洗牌 P90 | 最佳剩余步 |',
    '|---:|---:|---:|---:|---:|---:|---:|');
  for(const [number,result] of Object.entries(report.current)){
    const rate=name=>{const x=result[name];return `${percent(x.winRate)} (${percent(x.winRate95[0])}–${percent(x.winRate95[1])})`;};
    const best=Math.max(...Object.values(result).map(x=>x.remaining.best??-1));
    lines.push(`| ${number} | ${rate('newcomer')} | ${rate('regular')} | ${rate('practiced')} | ${display(result.regular.remaining.median)} | ${result.regular.shufflesP90} | ${best<0?'—':best} |`);
  }
  if(report.baseline){
    lines.push('','## 第 11–14 关改版对照','','两版使用相同随机种子和同一玩家模型；“改善 / 变差”指同一个种子下旧版失败新版通关 / 旧版通关新版失败。','',
      '| 关卡 | 模型 | 旧版通关 | 新版通关 | 改善 / 变差 | 旧版中位剩步 | 新版中位剩步 |',
      '|---:|---|---:|---:|---:|---:|---:|');
    for(const number of [11,12,13,14])for(const name of Object.keys(profiles)){
      const old=report.baseline[number][name],now=report.current[number][name];
      let improved=0,worsened=0;
      old.trials.forEach((trial,index)=>{if(trial.status!=='won'&&now.trials[index].status==='won')improved++;if(trial.status==='won'&&now.trials[index].status!=='won')worsened++;});
      lines.push(`| ${number} | ${profiles[name].label} | ${percent(old.winRate)} | ${percent(now.winRate)} | ${improved} / ${worsened} | ${display(old.remaining.median)} | ${display(now.remaining.median)} |`);
    }
  }
  lines.push('','局限：模型的误连、停止连线和提示使用概率都是设定值；免费洗牌使通关率偏高，随机走法也不能证明没有死局。正式定难度还需真实试玩的失败、重开、提示和洗牌数据。','');
  return lines.join('\n');
}

function compact(results) {
  return Object.fromEntries(Object.entries(results).map(([level,byProfile])=>[
    level,Object.fromEntries(Object.entries(byProfile).map(([name,{trials,...summary}])=>[name,summary]))
  ]));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const options=parseArgs(process.argv.slice(2));
  const levels=JSON.parse(readFileSync(new URL('../public/levels.json',import.meta.url))).levels;
  const report={generatedAt:new Date().toISOString(),runs:options.runs,seed:options.seed,profiles,current:evaluate(levels,options)};
  if(options.baselineRev){
    const content=execFileSync('git',['show',`${options.baselineRev}:public/levels.json`],{encoding:'utf8'});
    report.baseline=evaluate(JSON.parse(content).levels,{...options,levelNumbers:[11,12,13,14]});
    report.baselineRevision=options.baselineRev;
  }
  mkdirSync(new URL(`../${options.output.slice(0,options.output.lastIndexOf('/')+1)}`,import.meta.url),{recursive:true});
  const compactReport={...report,current:compact(report.current)};
  if(report.baseline)compactReport.baseline=compact(report.baseline);
  writeFileSync(new URL(`../${options.output}.json`,import.meta.url),JSON.stringify(compactReport,null,2)+'\n');
  writeFileSync(new URL(`../${options.output}.md`,import.meta.url),markdown(report));
  console.log(`Wrote ${options.output}.md and ${options.output}.json`);
}
