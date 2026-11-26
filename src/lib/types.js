// 物件类型定义：默认占地尺寸（米）、同类净间距、五档数量（0 档为关闭）
export const OBJ_TYPES = {
  tent: {
    key: 'tent',
    label: '帐篷',
    color: 0x4f8ef7,
    cssColor: '#4f8ef7',
    w: 4,
    d: 4,
    spacing: 3,
    tierCounts: [0, 2, 4, 6, 10, 16],
  },
  assembly: {
    key: 'assembly',
    label: '集结点',
    color: 0x34c759,
    cssColor: '#34c759',
    w: 6,
    d: 6,
    spacing: 4,
    tierCounts: [0, 1, 2, 3, 4, 6],
  },
  supply: {
    key: 'supply',
    label: '物资堆放区',
    color: 0xff9f0a,
    cssColor: '#ff9f0a',
    w: 5,
    d: 4,
    spacing: 3,
    tierCounts: [0, 1, 2, 3, 5, 8],
  },
  post: {
    key: 'post',
    label: '警戒桩',
    color: 0xff3b30,
    cssColor: '#ff3b30',
    w: 0.5,
    d: 0.5,
    spacing: 2,
    tierCounts: [0, 4, 8, 14, 22, 32],
  },
};

export const TYPE_ORDER = ['tent', 'assembly', 'supply', 'post'];

export const TIER_LABELS = ['关闭', '一档', '二档', '三档', '四档', '五档'];

export const CORRIDOR_BUFFER = 1; // 自动布置时物件距通道的最小净距（米）
export const DRAG_BUFFER = 0.3; // 手动拖拽时的判定缓冲（米）
export const SITE_MARGIN = 0.5; // 自动布置时物件距场地边界的最小距离（米）
