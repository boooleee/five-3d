// 启发式五子棋 AI：逐点评估「攻击分 + 0.9×防守分」，赢棋与堵杀优先。
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

const inB = (n, c, r) => c >= 0 && c < n && r >= 0 && r < n;

// 单方向模式分：count=该方向连子数，open=两端空位
function lineScore(count, open) {
  if (count >= 5) return 100000;   // 成五
  if (open === 0) return 0;        // 两头堵死
  switch (count) {
    case 4: return open === 2 ? 50000 : 5000;  // 活四 / 冲四
    case 3: return open === 2 ? 3000 : 300;    // 活三 / 眠三
    case 2: return open === 2 ? 200 : 20;      // 活二 / 眠二
    case 1: return open === 2 ? 20 : 5;
  }
  return 0;
}

// 评估在 (c,r) 放子色 p 的价值
function evalCell(grid, n, c, r, p) {
  const cell = (x, y) => y * n + x;
  let total = 0, win = false;
  for (const [dc, dr] of DIRS) {
    let count = 1, open = 0;
    for (const s of [1, -1]) {
      let x = c + dc * s, y = r + dr * s;
      while (inB(n, x, y) && grid[cell(x, y)] === p) { count++; x += dc * s; y += dr * s; }
      if (inB(n, x, y) && grid[cell(x, y)] === 0) open++;
    }
    if (count >= 5) win = true;
    total += lineScore(count, open);
  }
  return { total, win };
}

// 返回 AI(ai 色) 的最佳落点 [c, r]；全盘空则走天元
export function aiMove(grid, n, ai, human, eps = 0) {
  const cell = (x, y) => y * n + x;
  // 候选：所有棋子 2 格邻域内的空格
  const near = new Set();
  let hasStone = false;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!grid[cell(c, r)]) continue;
      hasStone = true;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          const x = c + dc, y = r + dr;
          if (inB(n, x, y) && !grid[cell(x, y)]) near.add(cell(x, y));
        }
    }
  }
  if (!hasStone) return [n >> 1, n >> 1];
  const candidates = [...near];
  const centerBias = (c, r) => n / 2 - Math.max(Math.abs(c - n / 2), Math.abs(r - n / 2));

  // 1) 自己能直接成五 -> 立刻走
  for (const idx of candidates) {
    const c = idx % n, r = (idx - c) / n;
    if (evalCell(grid, n, c, r, ai).win) return [c, r];
  }
  // 2) 对方有威胁点 -> 必须堵（堵不住两个就选对己方攻击分最高的那个）
  const threats = [];
  for (const idx of candidates) {
    const c = idx % n, r = (idx - c) / n;
    if (evalCell(grid, n, c, r, human).win) threats.push(idx);
  }
  if (threats.length) {
    let best = threats[0], bestVal = -1;
    for (const idx of threats) {
      const c = idx % n, r = (idx - c) / n;
      const v = evalCell(grid, n, c, r, ai).total;
      if (v > bestVal) { bestVal = v; best = idx; }
    }
    return [best % n, Math.floor(best / n)];
  }
  // 3) 常态：最大化 攻击 + 0.9×防守 + 中心倾向
  let best = null, bestScore = -Infinity;
  for (const idx of candidates) {
    const c = idx % n, r = Math.floor(idx / n);
    const atk = evalCell(grid, n, c, r, ai).total;
    const def = evalCell(grid, n, c, r, human).total;
    let s = atk + 0.9 * def + centerBias(c, r) * 0.5;
    if (eps) s += Math.random() * eps;   // 观赏局：加入随机性，走法更多样
    if (s > bestScore) { bestScore = s; best = idx; }
  }
  return [best % n, Math.floor(best / n)];
}
