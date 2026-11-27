import { AERATOR_CATALOG, SPECIES_META } from './store.js';

export function naturalPondSort(a, b) {
  const na = String(a.code);
  const nb = String(b.code);
  return na.localeCompare(nb, 'zh-CN', { numeric: true, sensitivity: 'base' });
}

export function sortedPonds(ponds) {
  return [...ponds].sort(naturalPondSort);
}

export function buildLegendGroups(project) {
  const groups = [];
  const layers = project.layers;

  if (layers.basemap || layers.ridges) {
    const items = [];
    if (layers.basemap) items.push({ id: 'basemap', shape: 'image', label: '本周航拍正射底图' });
    if (layers.ridges) items.push({ id: 'ridge', shape: 'line', color: '#8a5a24', dash: '8 5', label: '手持测距塘埂' });
    if (items.length) groups.push({ id: 'survey', title: '底图 / 测距', items });
  }

  if (layers.ponds) {
    const used = new Set(project.ponds.map((p) => p.species));
    const orderedPonds = sortedPonds(project.ponds);
    const items = [...used].map((key) => {
      const codes = orderedPonds.filter((p) => p.species === key).map((p) => p.code).join('、');
      return {
        id: `species-${key}`,
        shape: 'rect',
        color: SPECIES_META[key]?.color || '#64748b',
        label: `${SPECIES_META[key]?.label || key}（${codes}）`,
      };
    });
    if (layers.cages && project.cages.length) {
      items.push({ id: 'cage', shape: 'rect-outline', color: '#0891b2', label: `网箱框架（${project.cages[0]?.frameM || 6}m × ${project.cages[0]?.frameM || 6}m）` });
    }
    groups.push({ id: 'zone', title: '分区与养殖品种', items });
  }

  const aeroItems = [];
  if (layers.aerators) {
    const modelIds = new Set(project.aerators.map((a) => a.catalogId));
    modelIds.forEach((id) => {
      const cat = AERATOR_CATALOG.find((c) => c.id === id);
      const used = project.aerators.find((a) => a.catalogId === id);
      aeroItems.push({
        id: `aero-${id}`,
        shape: 'aerator',
        color: '#f97316',
        label: `${used?.model || cat?.model || '水车式'} · ${used?.powerKw || cat?.powerKw}kW`,
      });
    });
  }
  if (layers.coverage && project.aerators.length) {
    aeroItems.push({ id: 'coverage', shape: 'circle-outline', color: '#f97316', label: '覆盖半径 R（m）' });
  }
  if (layers.pipes && project.pipes.length) {
    aeroItems.push({ id: 'pipe', shape: 'line', color: '#0f766e', dash: '7 4', label: '正交管路 / 电缆至电源点' });
  }
  if (layers.power && project.powerPoints.length) {
    aeroItems.push({ id: 'power', shape: 'power', color: '#dc2626', label: '电源点 / 配电箱' });
  }
  if (aeroItems.length) groups.push({ id: 'aeration', title: '增氧点位', items: aeroItems });

  const feedItems = [];
  if (layers.route && project.feedRoute.points.length > 1) {
    feedItems.push({ id: 'route', shape: 'line', color: '#0d9488', dash: '10 5', label: '投喂船沿堤埂路线' });
  }
  if (layers.feedPoints && project.feedPoints.length) {
    feedItems.push({ id: 'feed-point', shape: 'feed', color: '#0d9488', label: '投喂点：序号 / 单次时长' });
  }
  if (feedItems.length) groups.push({ id: 'feeding', title: '投喂组织', items: feedItems });

  return groups;
}
