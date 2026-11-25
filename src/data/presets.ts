import type { AudienceType, SongSegment, SponsorConfig, ZoneDef } from '../types';
import { hexToNumber } from '../utils/color';

/** 灯光指导：三个区域的色温要求 */
export const ZONE_PRESETS: ZoneDef[] = [
  { id: 'front', name: '前区（A 区）', rowMin: 1, rowMax: 20, colorTemp: 3200, tint: hexToNumber('#ffb066') },
  { id: 'mid', name: '中区（B 区）', rowMin: 21, rowMax: 40, colorTemp: 5000, tint: hexToNumber('#ffe9c4') },
  { id: 'back', name: '后区（C 区）', rowMin: 41, rowMax: 60, colorTemp: 6500, tint: hexToNumber('#9db8ff') },
];

/** 商务：赞助方应援色与露出区块 */
export const SPONSOR_PRESET: SponsorConfig = {
  name: '橙子汽水（主赞助）',
  color: hexToNumber('#ff7a1a'),
  rowMin: 12,
  rowMax: 18,
  halfWidth: 360,
};

/** 观众形象库（可拖拽到座位图上） */
export const AUDIENCE_TYPES: AudienceType[] = [
  {
    id: 'fan-club',
    name: '官方应援团',
    desc: '统一深色制服，橙白荧光棒',
    bodyColors: [hexToNumber('#2b2f3a'), hexToNumber('#3a3f52'), hexToNumber('#1f2230')],
    stickColors: [hexToNumber('#ff7a1a'), hexToNumber('#ffffff'), hexToNumber('#ffb066')],
    standChance: 0.85,
    uiColor: '#ff7a1a',
  },
  {
    id: 'casual',
    name: '普通观众',
    desc: '日常休闲穿搭，多彩荧光棒',
    bodyColors: [hexToNumber('#4a6fa5'), hexToNumber('#7a9e7e'), hexToNumber('#b56576'), hexToNumber('#8d6b94'), hexToNumber('#c98d5a')],
    stickColors: [hexToNumber('#7ad7f0'), hexToNumber('#ff6b9d'), hexToNumber('#a8e063'), hexToNumber('#f7d154'), hexToNumber('#ffffff')],
    standChance: 0.45,
    uiColor: '#4a6fa5',
  },
  {
    id: 'vip',
    name: 'VIP 嘉宾',
    desc: '礼服正装，金色荧光棒',
    bodyColors: [hexToNumber('#111111'), hexToNumber('#5c1a1b'), hexToNumber('#1b2d5c'), hexToNumber('#e8e2d5')],
    stickColors: [hexToNumber('#ffd700'), hexToNumber('#fff3b0')],
    standChance: 0.6,
    uiColor: '#d4af37',
  },
  {
    id: 'family',
    name: '亲子观众',
    desc: '明亮童装，柔和色荧光棒',
    bodyColors: [hexToNumber('#ffd6e0'), hexToNumber('#bde0fe'), hexToNumber('#caffbf'), hexToNumber('#fdffb6')],
    stickColors: [hexToNumber('#ffafcc'), hexToNumber('#a2d2ff'), hexToNumber('#b9fbc0')],
    standChance: 0.25,
    uiColor: '#7ec8e3',
  },
  {
    id: 'press',
    name: '媒体/工作席',
    desc: '深色工装，不持荧光棒',
    bodyColors: [hexToNumber('#2f3542'), hexToNumber('#404756'), hexToNumber('#57606f')],
    stickColors: [hexToNumber('#3a3f4a')],
    standChance: 0.05,
    uiColor: '#747d8c',
  },
];

/** 曲目段落（企划台本） */
export const SONG_SEGMENTS: SongSegment[] = [
  { name: '前奏 Intro', start: 0, end: 15, stand: [0.15, 0.05, 0.02] },
  { name: '主歌 Verse 1', start: 15, end: 35, stand: [0.35, 0.15, 0.08] },
  { name: '预副歌 Pre-Chorus', start: 35, end: 50, stand: [0.6, 0.4, 0.25] },
  { name: '副歌 Chorus', start: 50, end: 70, stand: [1.0, 0.8, 0.55] },
  { name: '主歌 Verse 2', start: 70, end: 85, stand: [0.4, 0.2, 0.1] },
  { name: '尾奏 Outro', start: 85, end: 100, stand: [0.25, 0.15, 0.1] },
];

export const SEGMENT_NAMES = SONG_SEGMENTS.map((s) => s.name);
