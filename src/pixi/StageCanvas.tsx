import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { ID, Project } from '../types';
import { STAGE_HEIGHT, STAGE_WIDTH, TARGETS } from '../data/targets';
import type { Transport } from '../transport/Transport';
import { sampleKeyframeIntensity } from '../lib/easing';

interface StageCanvasProps {
  project: Project;
  transport: Transport;
  selectedCueId: ID | null;
  onSelectCue?: (cueId: ID) => void;
}

function colorToNumber(color: string): number {
  return Number.parseInt(color.replace('#', ''), 16);
}

export function StageCanvas({ project, transport, selectedCueId, onSelectCue }: StageCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef(project);
  const selectedRef = useRef(selectedCueId);
  const selectCallbackRef = useRef(onSelectCue);

  projectRef.current = project;
  selectedRef.current = selectedCueId;
  selectCallbackRef.current = onSelectCue;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let app: Application | null = null;

    const setup = async () => {
      const pixiApp = new Application();
      await pixiApp.init({
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        background: '#080d1a',
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
      });
      if (cancelled) {
        pixiApp.destroy(true);
        return;
      }
      app = pixiApp;
      host.appendChild(pixiApp.canvas);
      const loading = host.querySelector('.stage-loading');
      loading?.remove();
      pixiApp.canvas.setAttribute('aria-label', 'PixiJS 游戏场景预览：门和交互物高亮');
      pixiApp.canvas.style.width = '100%';
      pixiApp.canvas.style.height = 'auto';
      pixiApp.canvas.style.display = 'block';

      const staticLayer = new Graphics();
      const highlightLayer = new Graphics();
      const labelLayer = new Container();
      const interactionLayer = new Container();
      pixiApp.stage.addChild(staticLayer, highlightLayer, labelLayer, interactionLayer);

      drawStaticScene(staticLayer);

      TARGETS.forEach((target) => {
        const label = new Text({
          text: target.label,
          style: {
            fill: 0xdbeafe,
            fontSize: 15,
            fontWeight: '700',
            fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
          },
        });
        label.anchor.set(0.5, 0);
        label.x = target.x + target.w / 2;
        label.y = target.y + target.h + 10;
        labelLayer.addChild(label);

        const hit = new Graphics();
        hit.roundRect(target.x - 8, target.y - 8, target.w + 16, target.h + 16, 14).fill({ color: 0xffffff, alpha: 0.001 });
        hit.eventMode = 'static';
        hit.cursor = 'pointer';
        hit.on('pointerdown', () => {
          const cue = projectRef.current.cues.find((c) => c.visual.targetId === target.id);
          if (cue) selectCallbackRef.current?.(cue.id);
        });
        interactionLayer.addChild(hit);
      });

      pixiApp.ticker.add(() => {
        if (cancelled || !app) return;
        renderHighlights(highlightLayer, projectRef.current, transport.time, selectedRef.current);
      });
    };

    void setup();

    return () => {
      cancelled = true;
      if (app) {
        try {
          app.destroy(true, { children: true });
        } catch {
          app.destroy(true);
        }
        app = null;
      }
      if (host) host.replaceChildren();
    };
  }, [transport]);

  return (
    <div className="stage-canvas-host" ref={hostRef}>
      <div className="stage-loading">PixiJS 场景初始化中…</div>
    </div>
  );
}

function drawStaticScene(g: Graphics): void {
  g.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT).fill(0x0a1122);

  // Back wall and floor.
  g.rect(0, 54, STAGE_WIDTH, 260).fill(0x151f35);
  g.rect(0, 314, STAGE_WIDTH, 116).fill(0x0d1628);
  g.rect(0, 312, STAGE_WIDTH, 3).fill(0x334155);

  // Perspective floor lines.
  for (let i = 0; i < 9; i += 1) {
    const x = (i / 8) * STAGE_WIDTH;
    g.moveTo(STAGE_WIDTH / 2, 314).lineTo(x, STAGE_HEIGHT).stroke({ color: 0x1e293b, width: 1.5 });
  }

  // Ceiling light strips.
  for (let x = 70; x < STAGE_WIDTH; x += 180) {
    g.roundRect(x, 24, 92, 10, 5).fill({ color: 0x67e8f9, alpha: 0.22 });
    g.roundRect(x + 8, 27, 76, 3, 2).fill({ color: 0xcffafe, alpha: 0.45 });
  }

  TARGETS.forEach((target, index) => {
    const isDoor = target.kind === 'door';
    const base = target.id === 'door-5' ? 0x3a2c18 : 0x243047;
    const frame = target.id === 'door-5' ? 0x92610f : 0x40516e;

    g.roundRect(target.x - 7, target.y - 7, target.w + 14, target.h + 14, 12).fill(0x0b1222);
    g.roundRect(target.x - 4, target.y - 4, target.w + 8, target.h + 8, 10).fill(frame);
    g.roundRect(target.x, target.y, target.w, target.h, 8).fill(base);

    if (isDoor) {
      g.moveTo(target.x + target.w / 2, target.y + 8).lineTo(target.x + target.w / 2, target.y + target.h - 8).stroke({ color: 0x111827, width: 3 });
      g.circle(target.x + target.w * 0.72, target.y + target.h * 0.52, 4).fill(0xfbbf24);
      g.roundRect(target.x + 12, target.y + 18, target.w - 24, 42, 5).fill({ color: 0x172033, alpha: 0.75 }).stroke({ color: 0x475569, width: 1 });
      g.roundRect(target.x + 18, target.y + 28, target.w - 36, 8, 3).fill({ color: 0x64748b, alpha: 0.55 });
    } else if (target.kind === 'terminal') {
      g.roundRect(target.x + 10, target.y + 12, target.w - 20, 58, 7).fill(0x0f172a).stroke({ color: 0x4ade80, width: 2, alpha: 0.55 });
      for (let row = 0; row < 4; row += 1) {
        g.roundRect(target.x + 20, target.y + 24 + row * 11, target.w - 40 - (row % 2) * 16, 4, 2).fill({ color: 0x86efac, alpha: 0.55 - row * 0.08 });
      }
      g.roundRect(target.x + target.w / 2 - 18, target.y + 82, 36, 12, 4).fill(0x334155);
    } else {
      g.circle(target.x + target.w / 2, target.y + target.h * 0.42, target.w * 0.31).fill({ color: 0x1f2937 }).stroke({ color: 0xfda4af, width: 3, alpha: 0.55 });
      g.moveTo(target.x + target.w / 2, target.y + target.h * 0.42).lineTo(target.x + target.w / 2, target.y + target.h * 0.18).stroke({ color: 0xfecdd3, width: 4 });
      g.moveTo(target.x + target.w / 2, target.y + target.h * 0.42).lineTo(target.x + target.w * 0.72, target.y + target.h * 0.52).stroke({ color: 0xfecdd3, width: 4 });
      g.roundRect(target.x + 14, target.y + target.h - 38, target.w - 28, 16, 5).fill({ color: 0x7f1d1d, alpha: 0.75 });
    }

    // Small index plate.
    g.roundRect(target.x + target.w / 2 - 15, target.y - 18, 30, 18, 5).fill(index === 4 ? 0xf59e0b : 0x334155);
  });
}

function renderHighlights(g: Graphics, project: Project, time: number, selectedCueId: ID | null): void {
  g.clear();

  project.cues.forEach((cue) => {
    if (!cue.enabled) return;
    const target = TARGETS.find((t) => t.id === cue.visual.targetId);
    if (!target) return;

    let intensity = 0;
    if (time >= cue.start - 0.03 && time <= cue.end + 0.03) {
      intensity = sampleKeyframeIntensity(cue.visual.keyframes, time, cue.visual.easing);
    }
    intensity = Math.max(0, Math.min(1, intensity));
    const color = colorToNumber(cue.visual.color);
    const selected = cue.id === selectedCueId;

    if (intensity > 0.01) {
      // Expanding outer flash bands make the cue visible even at peripheral vision.
      for (let band = 2; band >= 0; band -= 1) {
        const expand = 8 + band * 13 + intensity * 8;
        g.roundRect(target.x - expand, target.y - expand, target.w + expand * 2, target.h + expand * 2, 16 + band * 4)
          .fill({ color, alpha: intensity * (0.08 + (2 - band) * 0.035) });
      }
      g.roundRect(target.x - 7, target.y - 7, target.w + 14, target.h + 14, 12)
        .fill({ color, alpha: 0.2 * intensity })
        .stroke({ color, width: 3 + intensity * 5, alpha: 0.95 * intensity });

      // Beacon diamond above the target.
      const bx = target.x + target.w / 2;
      const by = target.y - 34 - intensity * 5;
      const r = 7 + intensity * 5;
      g.poly([bx, by - r, bx + r, by, bx, by + r, bx - r, by]).fill({ color, alpha: intensity }).stroke({ color: 0xffffff, width: 1.5, alpha: intensity * 0.9 });
    }

    if (selected) {
      g.roundRect(target.x - 13, target.y - 13, target.w + 26, target.h + 26, 17)
        .stroke({ color: 0xffffff, width: 1.5, alpha: 0.72 });
      const corner = 12;
      const x = target.x - 18;
      const y = target.y - 18;
      g.moveTo(x, y + corner).lineTo(x, y).lineTo(x + corner, y).stroke({ color: 0x22d3ee, width: 4 });
      g.moveTo(x + target.w + 36 - corner, y).lineTo(x + target.w + 36, y).lineTo(x + target.w + 36, y + corner).stroke({ color: 0x22d3ee, width: 4 });
      g.moveTo(x, y + target.h + 36 - corner).lineTo(x, y + target.h + 36).lineTo(x + corner, y + target.h + 36).stroke({ color: 0x22d3ee, width: 4 });
      g.moveTo(x + target.w + 36 - corner, y + target.h + 36).lineTo(x + target.w + 36, y + target.h + 36).lineTo(x + target.w + 36, y + target.h + 36 - corner).stroke({ color: 0x22d3ee, width: 4 });
    }
  });
}
