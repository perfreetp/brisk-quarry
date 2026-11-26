// 整套图纸的配色与线宽,平面/剖面共用,便于打印一致
export const theme = {
  warehouse: '#263445',
  compartment: '#5a7a99',
  compartmentFill: 'rgba(90,122,153,0.06)',
  grain: '#d9c08a',
  grainFill: 'rgba(217,192,138,0.28)',
  ground: '#7a6a55',
  cable: '#1f6feb',
  cableFill: 'rgba(31,111,235,0.14)',
  cableDeep: '#134a9e',
  vent: '#d9480f',
  ventFill: 'rgba(217,72,15,0.14)',
  ventDeep: '#9a3209',
  leader: '#5c6b7a',
  labelFill: '#ffffff',
  labelStroke: '#384656',
  labelText: '#1d2733',
  selected: '#e8590c',
  pinned: '#7048e8',
  dim: '#868e96',
  grid: 'rgba(90,110,130,0.16)',
  axis: '#9099a4'
} as const;

export const stroke = {
  wall: 2.2,
  thin: 1.2,
  symbol: 2,
  leader: 1.1
} as const;
