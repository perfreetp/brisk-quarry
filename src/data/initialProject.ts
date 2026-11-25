import type { Cue, Keyframe, Project } from '../types';

let keySeq = 0;
const kid = () => `kf-${(keySeq += 1)}`;

function keys(start: number, end: number, pairs: Array<[number, number]>): Keyframe[] {
  const duration = end - start;
  return pairs.map(([u, intensity]) => ({
    id: kid(),
    u,
    intensity,
    time: Number((start + u * duration).toFixed(3)),
  }));
}

const flicker = (start: number, end: number) =>
  keys(start, end, [
    [0, 0.18],
    [0.08, 1],
    [0.2, 0.32],
    [0.36, 0.95],
    [0.52, 0.42],
    [0.7, 0.78],
    [0.86, 0.28],
    [1, 0],
  ]);

const doubleBlink = (start: number, end: number) =>
  keys(start, end, [
    [0, 0],
    [0.1, 1],
    [0.24, 0.18],
    [0.42, 0.95],
    [0.58, 0.25],
    [0.82, 0.12],
    [1, 0],
  ]);

function cue(partial: Cue): Cue {
  return partial;
}

export function createInitialProject(): Project {
  keySeq = 0;
  const cues: Cue[] = [
    cue({
      id: 'cue-1',
      code: 'C01',
      name: '1号门 · 轻叩',
      start: 1.0,
      end: 2.45,
      enabled: true,
      audio: { assetId: 'sfx-door-01', attack: 0.05, decay: 0.32, gain: 0.72, pan: -0.55 },
      visual: {
        targetId: 'door-1',
        color: '#67e8f9',
        rise: 0.08,
        fade: 0.3,
        easing: 'linear',
        keyframes: flicker(1.0, 2.45),
      },
      trigger: {
        event: 'proximity.enter(door-1, radius=5m)',
        condition: 'door.state=closed && player.assist.visualCue=true',
        beacon: '门上方定位声像，偏左 55%，单次叩击',
        subtitle: '【左侧】1号门：可交互',
      },
    }),
    cue({
      id: 'cue-2',
      code: 'C02',
      name: '2号门 · 电子锁',
      start: 3.05,
      end: 4.55,
      enabled: true,
      audio: { assetId: 'sfx-door-02', attack: 0.04, decay: 0.36, gain: 0.7, pan: -0.38 },
      visual: {
        targetId: 'door-2',
        color: '#7dd3fc',
        rise: 0.07,
        fade: 0.34,
        easing: 'linear',
        keyframes: doubleBlink(3.05, 4.55),
      },
      trigger: {
        event: 'lock.unlocked(door-2)',
        condition: 'power.core >= 1 && player.assist.visualCue=true',
        beacon: '电子锁位置双音信标，声像偏左',
        subtitle: '2号门已解锁',
      },
    }),
    cue({
      id: 'cue-3',
      code: 'C03',
      name: '3号门 · 气阀',
      start: 5.15,
      end: 6.85,
      enabled: true,
      audio: { assetId: 'sfx-door-03', attack: 0.16, decay: 0.52, gain: 0.66, pan: -0.22 },
      visual: {
        targetId: 'door-3',
        color: '#a5b4fc',
        rise: 0.18,
        fade: 0.48,
        easing: 'easeOutQuad',
        keyframes: flicker(5.15, 6.85),
      },
      trigger: {
        event: 'valve.pressureSafe(door-3)',
        condition: 'pressure <= 20kPa && player.assist.visualCue=true',
        beacon: '门顶气阀 3D 声像，噪声从左中位置发出',
        subtitle: '3号门气阀已释放',
      },
    }),
    cue({
      id: 'cue-4',
      code: 'C04',
      name: '4号门 · 金属回响',
      start: 8.1,
      end: 9.75,
      enabled: true,
      audio: { assetId: 'sfx-door-04', attack: 0.03, decay: 0.55, gain: 0.74, pan: 0.18 },
      visual: {
        targetId: 'door-4',
        color: '#c4b5fd',
        rise: 0.08,
        fade: 0.5,
        easing: 'linear',
        keyframes: flicker(8.1, 9.75),
      },
      trigger: {
        event: 'door.remoteUnlocked(door-4)',
        condition: 'commander.markedRoute=west && player.assist.visualCue=true',
        beacon: '远端门混响信标，声像略偏右',
        subtitle: '前方偏右：4号门开启',
      },
    }),
    cue({
      id: 'cue-5',
      code: 'C05',
      name: '5号门 · 重点复测',
      start: 11.0,
      end: 12.2,
      enabled: true,
      audio: { assetId: 'sfx-door-05', attack: 0.06, decay: 0.18, gain: 0.86, pan: 0.34 },
      visual: {
        targetId: 'door-5',
        color: '#fbbf24',
        rise: 0.05,
        fade: 0.12,
        easing: 'linear',
        keyframes: flicker(11.0, 12.2),
      },
      trigger: {
        event: 'proximity.enter(door-5, radius=6m)',
        condition: 'door-5.state=heavy-closed && feedback.round=deaf-review && player.assist.visualCue=true',
        beacon: '门上方 1.2m 空间信标；低频门轴 + 高频双 ping',
        subtitle: '【右前方】第5扇门：门轴声，可靠近',
      },
    }),
    cue({
      id: 'cue-6',
      code: 'C06',
      name: '6号门 · 双脉冲',
      start: 13.25,
      end: 14.85,
      enabled: true,
      audio: { assetId: 'sfx-door-06', attack: 0.04, decay: 0.34, gain: 0.72, pan: 0.48 },
      visual: {
        targetId: 'door-6',
        color: '#5eead4',
        rise: 0.08,
        fade: 0.32,
        easing: 'easeOutQuad',
        keyframes: doubleBlink(13.25, 14.85),
      },
      trigger: {
        event: 'beacon.pulse(door-6, count=2)',
        condition: 'route.branch=maintenance && player.assist.visualCue=true',
        beacon: '两次 880/1175Hz 空间脉冲，与两次闪烁同帧',
        subtitle: '6号门：两次闪烁 = 安全通过',
      },
    }),
    cue({
      id: 'cue-7',
      code: 'C07',
      name: '终端 · 就绪',
      start: 16.2,
      end: 18.05,
      enabled: true,
      audio: { assetId: 'sfx-terminal', attack: 0.03, decay: 0.42, gain: 0.64, pan: 0.62 },
      visual: {
        targetId: 'terminal-7',
        color: '#86efac',
        rise: 0.1,
        fade: 0.4,
        easing: 'easeInOutCubic',
        keyframes: keys(16.2, 18.05, [
          [0, 0],
          [0.12, 0.9],
          [0.32, 0.5],
          [0.55, 1],
          [0.78, 0.38],
          [1, 0],
        ]),
      },
      trigger: {
        event: 'terminal.ready(terminal-7)',
        condition: 'inventory.has(accessCard) && player.assist.visualCue=true',
        beacon: '终端屏幕上方 UI 音源，声像偏右',
        subtitle: '终端已就绪：按 E 下载路线',
      },
    }),
    cue({
      id: 'cue-8',
      code: 'C08',
      name: '逃生舱 · 密封',
      start: 19.25,
      end: 21.15,
      enabled: true,
      audio: { assetId: 'sfx-hatch', attack: 0.08, decay: 0.62, gain: 0.78, pan: 0.72 },
      visual: {
        targetId: 'hatch-8',
        color: '#fda4af',
        rise: 0.16,
        fade: 0.58,
        easing: 'easeOutCubic',
        keyframes: flicker(19.25, 21.15),
      },
      trigger: {
        event: 'hatch.sealConfirmed(hatch-8)',
        condition: 'escapeObjective.active && playersInside >= 1 && player.assist.visualCue=true',
        beacon: '舱门轮廓 3D 信标，密封完成后播放确认和弦',
        subtitle: '右侧逃生舱已密封，路线开启',
      },
    }),
  ];

  return {
    name: '听障模式 · 门与交互物双提示时间轴',
    duration: 24,
    cues,
    groups: [
      { id: 'group-east', name: '编组 A · 东区门组', color: '#38bdf8', cueIds: ['cue-1', 'cue-2', 'cue-3'] },
      { id: 'group-main', name: '编组 B · 主通道门组', color: '#f59e0b', cueIds: ['cue-4', 'cue-5', 'cue-6'] },
    ],
  };
}
