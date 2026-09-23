export function homeMarkup(levels, firstMechanicByLevel, assetUrl, escape) {
  const cards=levels[0].groups.slice(0,4).map((group,index)=>
    `<div class="home-card home-card-${index+1}"><img src="${escape(assetUrl(group.symbol))}" alt=""></div>`
  ).join('');
  const levelButtons=levels.map((level,index)=>
    `<button type="button" class="home-level-button${firstMechanicByLevel.has(index)?' new-mechanic':''}" data-home-level="${index}" aria-label="进入第 ${escape(level.id)} 关"><span>${escape(level.id)}</span></button>`
  ).join('');
  return `<section class="home" id="home" aria-label="Link&Sort 游戏首页">
    <div class="home-topline"><span class="home-topline-mark">✦</span><span>LINK &amp; SORT</span><span class="home-topline-number">VOL. 01</span></div>
    <div class="home-content" id="home-content">
      <div class="home-title-block"><p class="home-eyebrow">连线分类 · 填满图鉴</p><h1>Link<span>&amp;</span>Sort</h1><p class="home-subtitle">把相同的故事连在一起</p></div>
      <div class="home-hero" aria-hidden="true">
        <div class="home-hero-orbit"></div>
        <svg class="home-thread" viewBox="0 0 320 260" fill="none"><path d="M74 72 C130 26 192 36 248 78 S270 172 220 195 S111 230 75 177 S25 109 74 72" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 13"/></svg>
        <span class="home-spark home-spark-a">✦</span><span class="home-spark home-spark-b">✧</span><span class="home-spark home-spark-c">✦</span>
        ${cards}
        <div class="home-seal"><span>COLLECT</span><strong>4 / 4</strong></div>
      </div>
      <div class="home-actions">
        <button type="button" class="home-start" id="home-start"><span class="home-start-copy"><strong id="home-start-title">开始游戏</strong><small id="home-start-note">从第 1 关开始</small></span><span class="home-start-arrow" aria-hidden="true">➜</span></button>
        <button type="button" class="home-choose" id="home-choose"><span class="home-choose-grid" aria-hidden="true">▦</span>选择关卡<span class="home-choose-chevron" aria-hidden="true">›</span></button>
      </div>
      <p class="home-status" id="home-status" role="status" aria-live="polite"></p>
    </div>
    <div class="home-footer"><span>✧</span> ${levels.length} 个关卡 · 随时开玩 <span>✧</span></div>
    <section class="home-levels" id="home-levels" aria-label="选择关卡" hidden>
      <div class="home-levels-header"><button type="button" class="home-back" id="home-back" aria-label="返回游戏首页">‹</button><div><p>YOUR COLLECTION</p><h2>选择关卡</h2></div></div>
      <p class="home-levels-intro" id="home-levels-intro">想玩哪一关？所有关卡都可以直接进入。</p>
      <div class="home-level-grid">${levelButtons}</div>
      <div class="home-levels-footer"><span class="home-levels-dot"></span> 金色标记表示新机制首次出现</div>
    </section>
  </section>`;
}
