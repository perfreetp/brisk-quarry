<script>
  // 码数本:按洞分页,每页进攻线缩略图 + 落球区 + 障碍距离 + 进攻角度,可直接打印
  import { holes } from '../lib/store.js';
  import { approachMetrics } from '../lib/model.js';
  import { holeToSVG } from '../lib/svgio.js';
  import { formatYards } from '../lib/geometry.js';

  function thumbSVG(hole) {
    // 计算本洞内容包围盒,让缩略图自适应
    const xs = [], ys = [];
    const push = (pts) => { for (let i = 0; i < pts.length; i += 2) { xs.push(pts[i]); ys.push(pts[i + 1]); } };
    push(hole.centerline); push(hole.green); push(hole.approach.points);
    hole.refLines.forEach((r) => push(r.points));
    hole.landings.forEach((l) => { xs.push(l.x, l.x + l.w); ys.push(l.y, l.y + l.h); });
    if (!xs.length) { xs.push(0, 100); ys.push(0, 100); }
    const pad = 30;
    const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad - 30;
    const w = Math.max(...xs) - minX + pad, h = Math.max(...ys) - minY + pad;
    return `<svg viewBox="${minX} ${minY} ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">${holeToSVG(hole)}</svg>`;
  }
</script>

<div class="book">
  {#each $holes as hole (hole.id)}
    {@const metrics = approachMetrics(hole)}
    <section class="page">
      <header>
        <div class="hole-num">HOLE {hole.number}</div>
        <div class="hole-meta">
          <h1>{hole.name}</h1>
          <span>Par {hole.par} · 差点 {hole.handicap}</span>
        </div>
      </header>
      <div class="thumb">
        {@html thumbSVG(hole)}
      </div>
      <table>
        <thead>
          <tr><th>点位</th><th>距发球台</th><th>距果岭前沿</th><th>最近障碍</th><th>进攻角度</th></tr>
        </thead>
        <tbody>
          {#each metrics as m, i}
            <tr>
              <td>P{i + 1}</td>
              <td>{formatYards(m.fromTee)} y</td>
              <td>{m.toGreen === null ? '—' : `${formatYards(m.toGreen)} y`}</td>
              <td>{m.toHazard === null ? '—' : `${formatYards(m.toHazard)} y`}</td>
              <td>{m.angle === null ? '—' : `${m.angle}°`}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if hole.landings.length}
        <div class="landings">
          {#each hole.landings as lz, i}
            <span class="lz-chip">落球区 {i + 1}:目标差点 {lz.targetHandicap} · 风向 {lz.wind} · {Math.round(lz.w)}×{Math.round(lz.h)} y</span>
          {/each}
        </div>
      {/if}
      <footer>第 {hole.number} 洞 · Par {hole.par}</footer>
    </section>
  {/each}
  {#if !$holes.length}
    <p class="empty">还没有洞。回到编辑视图,新建洞或载入示例。</p>
  {/if}
</div>

<style>
  .book { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 24px; background: #dfe3da; min-height: 100%; }
  .page {
    width: 210mm; min-height: 297mm; background: #fff; padding: 14mm 16mm;
    box-shadow: 0 2px 12px rgba(0,0,0,.25); display: flex; flex-direction: column;
    page-break-after: always; box-sizing: border-box;
  }
  header { display: flex; align-items: baseline; gap: 16px; border-bottom: 3px solid #1b5e20; padding-bottom: 8px; }
  .hole-num { font-size: 34px; font-weight: 800; color: #1b5e20; }
  .hole-meta h1 { margin: 0; font-size: 20px; }
  .hole-meta span { color: #555; font-size: 13px; }
  .thumb { height: 120mm; border: 1px solid #ccc; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #bbb; padding: 5px 8px; text-align: center; }
  th { background: #e8f0e4; }
  .landings { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
  .lz-chip { background: #fff8e1; border: 1px solid #d7b845; border-radius: 4px; padding: 3px 8px; font-size: 12px; }
  footer { margin-top: auto; text-align: center; color: #888; font-size: 11px; padding-top: 8px; }
  .empty { color: #666; }

  @media print {
    .book { padding: 0; background: #fff; gap: 0; }
    .page { box-shadow: none; width: auto; min-height: auto; height: 100%; }
    @page { size: A4; margin: 0; }
  }
</style>
