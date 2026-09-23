// Rules for the Link&Sort browser game.
export class Game {
  constructor(level) {
    this.level = level; this.cols = level.cols; this.rows = level.rows;
    this.moves = level.moves;
    this.complete = new Set(); this.turn = 0; this.status = 'playing'; this.serial = 0;
    this.tiles = level.tiles.map(t => this.makeTile(t));
    this.pending = level.pending.map(row => row.map(t => this.makeTile(t)));
    this.totals = level.groups.map((_, g) => [...this.tiles, ...this.pending.flat()].filter(t => t.group === g).length);
    this.assertValid();
  }
  makeTile(t) { return { restriction: 0, lockId: 0, unlocksLockId: 0, extraMoves: 0, ...t, hiddenCounter: t.hiddenCounter || 0, id: ++this.serial, count: 1 }; }
  tile(id) { return this.tiles.find(t => t.id === id); }
  at(x, y) { return this.tiles.find(t => t.x === x && t.y === y); }
  selectable(t) { return !!t && !t.hiddenCounter && t.restriction !== 4 && t.restriction !== 7; }
  // Grid traversal collects every occupied cell on the drawn segment. It cannot jump over a mismatching tile.
  connection(fromId, toId) {
    const waypoints = this.rasterConnection(fromId, toId);
    if (waypoints.length < 2) return waypoints;
    // Rendering joins occupied tile centers, not just the raster cells. Refine
    // each such segment until release sees exactly the same occupied waypoints.
    // Every subdivision has a strictly smaller coordinate span, so this terminates.
    const path = [];
    let previous = fromId;
    for (const id of waypoints) {
      path.push(...this.connection(previous, id));
      previous = id;
    }
    return path;
  }
  rasterConnection(fromId, toId) {
    const a = this.tile(fromId), b = this.tile(toId); if (!a || !b || a === b) return [];
    // Bresenham's tie breaks depend on traversal direction. Always rasterize
    // in one coordinate order, then reverse the full route when needed.
    const reverse = a.x > b.x || (a.x === b.x && a.y > b.y);
    const start = reverse ? b : a, end = reverse ? a : b;
    let x = start.x, y = start.y; const dx = Math.abs(end.x - x), dy = Math.abs(end.y - y);
    const sx = x < end.x ? 1 : -1, sy = y < end.y ? 1 : -1; let err = dx - dy; const path = [start.id];
    for (let guard = 0; guard < this.cols + this.rows + 2; guard++) {
      if (x === end.x && y === end.y) break;
      const e = 2 * err; if (e > -dy) { err -= dy; x += sx; } if (e < dx) { err += dx; y += sy; }
      const t = this.at(x, y); if (t) path.push(t.id);
    }
    return (reverse ? path.reverse() : path).slice(1);
  }
  extend(selection, id) {
    if (!this.selectable(this.tile(id)) || this.status !== 'playing') return selection;
    const old = selection.indexOf(id); if (old >= 0) return selection.slice(0, old + 1);
    if (!selection.length) return [id];
    const addition = this.connection(selection.at(-1), id);
    if (addition.some(x => selection.includes(x) || !this.selectable(this.tile(x))) || selection.length + addition.length > 9) return selection;
    return [...selection, ...addition];
  }
  validateSelection(ids) {
    if (this.status !== 'playing') return { kind: 'ignored', reason: 'ended' };
    const selected = ids.map(id => this.tile(id));
    if (selected.length < 2) return { kind: 'ignored', reason: 'short' };
    if (selected.some(t => !t) || new Set(ids).size !== ids.length) return { kind: 'ignored', reason: 'changed' };
    if (selected.some(t => !this.selectable(t))) return { kind: 'ignored', reason: 'restricted' };
    // Validate the same segments accepted by the pointer controller, including intervening occupants.
    for (let i = 1; i < ids.length; i++) {
      const between = this.connection(ids[i - 1], ids[i]);
      if (between.length !== 1 || between[0] !== ids[i]) return { kind: 'ignored', reason: 'path' };
    }
    if (ids.length > 9) return { kind: 'ignored', reason: 'limit' };
    return { kind: selected.some(t => t.group !== selected[0].group) ? 'wrong' : 'valid' };
  }
  submit(ids) {
    const validation = this.validateSelection(ids);
    if (validation.kind === 'ignored') return validation;
    const selected = ids.map(id => this.tile(id));
    this.turn++;
    if (this.level.moves > 0) this.moves--;
    if (validation.kind === 'wrong') {
      this.checkEnd(); return { kind: 'wrong', ids };
    }
    const target = selected.at(-1), sum = selected.reduce((n, t) => n + t.count, 0);
    const done = sum === this.totals[target.group];
    if (sum > this.totals[target.group]) throw Error('Group inventory overflow');
    const removed = selected.filter(t => done || t.id !== target.id).map(t => t.id);
    this.tiles = this.tiles.filter(t => !removed.includes(t.id));
    if (done) this.complete.add(target.group); else target.count = sum;
    // A selected key opens every matching lock, including id 0.
    const keyIds = new Set(selected.filter(t => t.restriction === 5).map(t => t.unlocksLockId));
    const unlocked = [];
    for (const tile of this.tiles) {
      if (tile.restriction === 4 && keyIds.has(tile.lockId)) { tile.restriction = 0; unlocked.push(tile.id); }
      if (tile.restriction === 5 && selected.includes(tile)) tile.restriction = 0;
    }
    if (ids.length >= 6 && this.level.moves > 0) this.moves++;
    // A valid selection removes cover layers from adjacent hidden tiles.
    // A tile touched from multiple selected cells loses that many cover layers.
    const revealed = [];
    for (const tile of this.tiles) {
      if (!tile.hiddenCounter) continue;
      const touches = selected.filter(t => Math.abs(t.x - tile.x) + Math.abs(t.y - tile.y) === 1).length;
      if (!touches) continue;
      tile.hiddenCounter = Math.max(0, tile.hiddenCounter - touches);
      if (!tile.hiddenCounter) revealed.push(tile.id);
    }
    this.settle(); this.checkEnd(); this.assertValid();
    return { kind: done ? 'complete' : 'merge', group: target.group, target: target.id, removed, ids, count: sum, revealed, unlocked };
  }
  collectExtra(id) {
    const tile = this.tile(id);
    if (this.status !== 'playing' || tile?.restriction !== 7) return { kind: 'ignored' };
    this.tiles = this.tiles.filter(t => t.id !== id);
    this.moves += tile.extraMoves;
    this.settle(); this.checkEnd(); this.assertValid();
    return { kind: 'extraMoves', id, amount: tile.extraMoves };
  }
  settle() {
    // Empty rows collapse as rows; survivor columns stay unchanged. Up to two queued rows enter each turn.
    const occupied = [...new Set(this.tiles.map(t => t.y))].sort((a, b) => a - b);
    const rank = new Map(occupied.map((y, i) => [y, i]));
    this.tiles.forEach(t => { t.y = rank.get(t.y); });
    let y = occupied.length, spawned = 0;
    while (y < this.rows && this.pending.length && spawned < 2) {
      const row = this.pending.shift(); row.forEach(t => { t.y = y; this.tiles.push(t); }); y++; spawned++;
    }
  }
  checkEnd() {
    if (this.complete.size === this.level.groups.length) this.status = 'won';
    else if (this.level.moves > 0 && this.moves <= 0) this.status = 'lost';
  }
  hint() {
    let best = [];
    for (const start of this.tiles) {
      if (!this.selectable(start)) continue;
      let path = [start.id];
      for (let loop = 0; loop < 9; loop++) {
        let candidate = null;
        for (const target of this.tiles) {
          if (!this.selectable(target) || target.group !== start.group || path.includes(target.id)) continue;
          const next = this.extend(path, target.id);
          if (next.length > path.length && next.every(id => this.tile(id).group === start.group)) {
            if (!candidate || next.length > candidate.length) candidate = next;
          }
        }
        if (!candidate) break; path = candidate;
      }
      if (path.length > best.length) best = path;
    }
    return best.length > 1 ? best : [];
  }
  shuffle(random = Math.random) {
    if (this.status !== 'playing') return false;
    // Demo convenience: compact gaps before reshuffling, so queued rows cannot remain stranded.
    this.tiles.sort((a,b) => a.y - b.y || a.x - b.x);
    this.tiles.forEach((t,i) => { t.x = i % this.cols; t.y = Math.floor(i / this.cols); });
    this.settle();
    const positions = this.tiles.map(t => ({ x: t.x, y: t.y }));
    for (let attempt = 0; attempt < 40; attempt++) {
      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1)); [positions[i], positions[j]] = [positions[j], positions[i]];
      }
      this.tiles.forEach((t,i) => Object.assign(t, positions[i]));
      if (this.hint().length) break;
    }
    this.assertValid(); return true;
  }
  assertValid() {
    const cells = new Set();
    for (const t of this.tiles) {
      const key = `${t.x},${t.y}`;
      if (cells.has(key) || t.x < 0 || t.x >= this.cols || t.y < 0 || t.y >= this.rows) throw Error('Invalid tile position');
      cells.add(key);
    }
    for (let g = 0; g < this.totals.length; g++) {
      const live = [...this.tiles, ...this.pending.flat()].filter(t => t.group === g).reduce((s,t) => s+t.count,0);
      if (live !== (this.complete.has(g) ? 0 : this.totals[g])) throw Error(`Group ${g} conservation failed`);
    }
  }
  snapshot() { return { status:this.status, moves:this.moves, completed:[...this.complete], pending:this.pending.length, tiles:this.tiles.map(t=>({...t})), turn:this.turn }; }
}
