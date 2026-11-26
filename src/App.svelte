<script>
  import { holes, activeHoleId, activeHole, role, view, tool, refType, snapEnabled,
           addHole, removeHole, updateHole, exportJSON, importState, loadDemo, selectedLandingId } from './lib/store.js';
  import { REF_TYPES, WIND_DIRS } from './lib/model.js';
  import { exportSVG, exportBookPageSVG, importVectorFile, download } from './lib/svgio.js';
  import EditorCanvas from './components/EditorCanvas.svelte';
  import YardageBook from './components/YardageBook.svelte';

  let fileInput; // 平面图
  let vectorInput; // 矢量/JSON 导入

  const designerTools = [
    ['select', '选择/拖动'],
    ['calibrate', '定比例尺'],
    ['centerline', '球道中心线'],
    ['green', '果岭轮廓'],
    ['refline', '参照线'],
    ['approach', '进攻折线'],
    ['landing', '落球区'],
  ];
  const directorTools = [
    ['select', '选择/拖动'],
    ['landing', '落球区'],
  ];

  $: tools = $role === 'designer' ? designerTools : directorTools;
  $: if (!tools.some(([k]) => k === $tool)) tool.set('select');

  $: selectedLanding = $activeHole?.landings.find((l) => l.id === $selectedLandingId) || null;

  function importMap(e) {
    const file = e.target.files?.[0];
    if (!file || !$activeHole) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        updateHole($activeHole.id, (h) => {
          h.map = { src: reader.result, width: img.naturalWidth, height: img.naturalHeight, yardsPerPixel: h.map?.yardsPerPixel ?? 0.5, x: 0, y: 0 };
          return h;
        });
        tool.set('calibrate');
        alert('平面图已导入。请在图上点击两个已知距离的点来定比例尺。');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function importVector(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = importVectorFile(reader.result);
        importState({ holes: imported });
        alert(`已导入 ${imported.length} 个洞,折线和标注均可继续编辑。`);
      } catch (err) {
        alert('导入失败:' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function doExportJSON() {
    download('yardage-book.json', exportJSON(), 'application/json');
  }
  function doExportSVG() {
    download('yardage-map.svg', exportSVG($holes));
  }
  function doExportBookSVG() {
    for (const h of $holes) download(`yardage-book-hole-${h.number}.svg`, exportBookPageSVG(h));
  }
</script>

<div class="app">
  <header class="topbar">
    <strong>逐洞击球路线标注</strong>
    <div class="group">
      <button class:on={$role === 'designer'} on:click={() => role.set('designer')}>设计师</button>
      <button class:on={$role === 'director'} on:click={() => role.set('director')}>赛事总监</button>
    </div>
    <div class="group">
      <button class:on={$view === 'edit'} on:click={() => view.set('edit')}>标注图</button>
      <button class:on={$view === 'book'} on:click={() => view.set('book')}>码数本</button>
    </div>
    {#if $view === 'edit'}
      <div class="group">
        {#each tools as [key, label]}
          <button class:on={$tool === key} on:click={() => tool.set(key)}>{label}</button>
        {/each}
      </div>
      {#if $tool === 'refline'}
        <div class="group">
          {#each Object.entries(REF_TYPES) as [key, rt]}
            <button class:on={$refType === key} on:click={() => refType.set(key)}>{rt.label}</button>
          {/each}
        </div>
      {/if}
      <label class="snap"><input type="checkbox" bind:checked={$snapEnabled} /> 吸附</label>
    {/if}
    <div class="group right">
      {#if $view === 'edit'}
        <button on:click={() => fileInput.click()}>导入平面图</button>
        <button on:click={() => vectorInput.click()}>导入矢量/JSON</button>
        <button on:click={doExportJSON}>导出 JSON</button>
        <button on:click={doExportSVG}>导出矢量图</button>
        <button on:click={loadDemo}>载入示例</button>
      {:else}
        <button on:click={() => window.print()}>打印码数本</button>
        <button on:click={doExportBookSVG}>导出码数本 SVG</button>
      {/if}
    </div>
  </header>

  <div class="body">
    {#if $view === 'edit'}
      <aside class="sidebar">
        <div class="side-head">
          <span>洞列表({$holes.length})</span>
          <button on:click={addHole}>+ 新建洞</button>
        </div>
        {#each $holes as h (h.id)}
          <div class="hole-item" class:active={h.id === $activeHoleId} on:click={() => activeHoleId.set(h.id)}>
            <span>#{h.number} {h.name}</span>
            <button class="del" title="删除" on:click|stopPropagation={() => removeHole(h.id)}>×</button>
          </div>
        {/each}

        {#if $activeHole}
          <hr />
          <label>洞名 <input value={$activeHole.name} on:input={(e) => updateHole($activeHole.id, (h) => { h.name = e.target.value; return h; })} /></label>
          <div class="row">
            <label>洞号 <input type="number" value={$activeHole.number} on:change={(e) => updateHole($activeHole.id, (h) => { h.number = +e.target.value; return h; })} /></label>
            <label>Par
              <select value={$activeHole.par} on:change={(e) => updateHole($activeHole.id, (h) => { h.par = +e.target.value; return h; })}>
                <option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
              </select>
            </label>
            <label>差点 <input type="number" min="1" max="18" value={$activeHole.handicap} on:change={(e) => updateHole($activeHole.id, (h) => { h.handicap = +e.target.value; return h; })} /></label>
          </div>
          <label>刻度间隔(码) <input type="number" min="5" step="5" value={$activeHole.tickInterval} on:change={(e) => updateHole($activeHole.id, (h) => { h.tickInterval = Math.max(5, +e.target.value || 25); return h; })} /></label>
          {#if $activeHole.map}
            <div class="mapinfo">比例尺:1 px = {$activeHole.map.yardsPerPixel.toFixed(3)} 码</div>
          {/if}
          {#if $role === 'designer'}
            <div class="clears">
              <button on:click={() => updateHole($activeHole.id, (h) => { h.centerline = []; return h; })}>清中心线</button>
              <button on:click={() => updateHole($activeHole.id, (h) => { h.green = []; return h; })}>清果岭</button>
              <button on:click={() => updateHole($activeHole.id, (h) => { h.refLines = []; return h; })}>清参照线</button>
              <button on:click={() => updateHole($activeHole.id, (h) => { h.approach.points = []; return h; })}>清进攻线</button>
            </div>
          {/if}
          {#if selectedLanding}
            <hr />
            <div class="lz-edit">
              <b>落球区</b>
              <label>目标差点 <input type="number" min="1" max="36" value={selectedLanding.targetHandicap}
                on:change={(e) => updateHole($activeHole.id, (h) => { const z = h.landings.find((l) => l.id === selectedLanding.id); if (z) z.targetHandicap = +e.target.value; return h; })} /></label>
              <label>风向
                <select value={selectedLanding.wind}
                  on:change={(e) => updateHole($activeHole.id, (h) => { const z = h.landings.find((l) => l.id === selectedLanding.id); if (z) z.wind = e.target.value; return h; })}>
                  {#each WIND_DIRS as w}<option value={w}>{w}</option>{/each}
                </select>
              </label>
              <button on:click={() => { updateHole($activeHole.id, (h) => { h.landings = h.landings.filter((l) => l.id !== selectedLanding.id); return h; }); selectedLandingId.set(null); }}>删除落球区</button>
            </div>
          {/if}
        {/if}
      </aside>
      <main class="canvas">
        {#if $holes.length}
          <EditorCanvas />
        {:else}
          <div class="welcome">
            <p>还没有洞。点击左侧「新建洞」开始,或</p>
            <button on:click={loadDemo}>载入示例(3 个洞)</button>
          </div>
        {/if}
      </main>
    {:else}
      <main class="bookview"><YardageBook /></main>
    {/if}
  </div>

  <input type="file" accept="image/*" bind:this={fileInput} on:change={importMap} hidden />
  <input type="file" accept=".svg,.json" bind:this={vectorInput} on:change={importVector} hidden />
</div>

<style>
  :global(html, body, #app) { margin: 0; height: 100%; font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; }
  .app { display: flex; flex-direction: column; height: 100%; }
  .topbar { display: flex; align-items: center; gap: 14px; padding: 6px 12px; background: #1b3a1e; color: #fff; flex-wrap: wrap; }
  .group { display: flex; gap: 4px; }
  .group.right { margin-left: auto; }
  button { background: #2c5b31; color: #fff; border: 1px solid #4a7c50; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 13px; }
  button.on { background: #ffd24d; color: #222; border-color: #ffd24d; }
  button:hover { filter: brightness(1.15); }
  .snap { display: flex; align-items: center; gap: 4px; font-size: 13px; }
  .body { flex: 1; display: flex; min-height: 0; }
  .sidebar { width: 240px; background: #f4f6f1; border-right: 1px solid #ccc; padding: 10px; overflow-y: auto; font-size: 13px; }
  .side-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-weight: 600; }
  .side-head button, .clears button, .lz-edit button { background: #e8ece4; color: #222; border-color: #bbb; }
  .hole-item { display: flex; justify-content: space-between; padding: 5px 8px; border-radius: 4px; cursor: pointer; }
  .hole-item:hover { background: #e2e8dd; }
  .hole-item.active { background: #cde3c6; font-weight: 600; }
  .hole-item .del { background: none; border: none; color: #a00; padding: 0 4px; }
  .sidebar label { display: block; margin: 6px 0; }
  .sidebar input, .sidebar select { width: 100%; box-sizing: border-box; }
  .sidebar .row { display: flex; gap: 6px; }
  .mapinfo { color: #555; font-size: 12px; margin: 4px 0; }
  .clears { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .lz-edit label { margin: 4px 0; }
  .canvas { flex: 1; min-width: 0; }
  .welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 10px; color: #555; }
  .welcome button { font-size: 15px; padding: 8px 18px; }
  .bookview { flex: 1; overflow-y: auto; }

  @media print {
    .topbar, .sidebar { display: none !important; }
    .body, .bookview { display: block; overflow: visible; }
  }
</style>
