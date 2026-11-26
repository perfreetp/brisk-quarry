<script>
  import { parsePatchGeoJSON } from '../lib/project.js';

  let { store } = $props();
  let name = $state('');
  let date = $state('');
  let orthoDataUrl = $state(null);
  let orthoName = $state('');
  let geoName = $state('');
  let parsedPatches = $state([]);
  let msg = $state('');

  function onOrtho(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    orthoName = file.name;
    const reader = new FileReader();
    reader.onload = () => { orthoDataUrl = reader.result; };
    reader.readAsDataURL(file);
  }

  function onGeo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    geoName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        parsedPatches = parsePatchGeoJSON(reader.result);
        msg = `已解析 ${parsedPatches.length} 个白化斑块（需含 bleaching 属性）`;
      } catch (err) {
        msg = `解析失败：${err.message}`;
        parsedPatches = [];
      }
    };
    reader.readAsText(file);
  }

  function submit() {
    if (!name || !date || !orthoDataUrl) {
      msg = '请填写期次名、监测日期并选择正射图';
      return;
    }
    store.importPeriod({
      id: `p-${date.replaceAll('-', '')}`,
      name,
      date,
      ortho: orthoDataUrl,
      patches: parsedPatches
    });
    msg = `已导入「${name}」，已按监测日期 ${date} 排入时间轴并自动建组`;
    name = ''; date = ''; orthoDataUrl = null; orthoName = ''; geoName = ''; parsedPatches = [];
  }
</script>

<div class="imp">
  <p class="tip">按监测日期导入各期礁体正射图与白化色块（GeoJSON 多边形，属性含 0–1 的 bleaching 值）。导入后自动按日期排序并补建轨道组。</p>
  <label class="field"><span>期次名</span>
    <input placeholder="如：第六期" value={name} oninput={(e) => (name = e.target.value)} />
  </label>
  <label class="field"><span>监测日期</span>
    <input type="date" value={date} oninput={(e) => (date = e.target.value)} />
  </label>
  <label class="file">正射图
    <input type="file" accept="image/*" onchange={onOrtho} />
    <small>{orthoName || '未选择'}</small>
  </label>
  <label class="file">白化色块 GeoJSON
    <input type="file" accept=".json,.geojson,application/json" onchange={onGeo} />
    <small>{geoName || '未选择（可选，缺省只展示底图）'}</small>
  </label>
  <button class="mini wide primary" onclick={submit}>导入并排入时间轴</button>
  {#if msg}<p class="msg">{msg}</p>{/if}
</div>

<style>
  .imp { display: flex; flex-direction: column; gap: 8px; }
  .field { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #8fb9cc; }
  .field input {
    background: #0e2738; border: 1px solid var(--border); color: #e8f2f8;
    border-radius: 6px; padding: 6px 8px; font-size: 12.5px;
  }
  .file {
    display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #8fb9cc;
    border: 1px dashed var(--border); border-radius: 8px; padding: 8px;
  }
  .file small { color: #6f93a6; }
  .primary { background: #1f5f83 !important; border-color: #57b6e0 !important; }
  .msg { font-size: 11.5px; color: #7fd1a8; line-height: 1.5; }
  .tip { font-size: 11.5px; color: #6f93a6; line-height: 1.5; }
  .mini {
    border: 1px solid var(--border); background: #1d3a4d; color: #e8f2f8;
    border-radius: 6px; padding: 8px 10px; font-size: 12.5px; cursor: pointer;
  }
  .mini.wide { width: 100%; }
</style>
