import { AppRoot } from './components/app-root';
import { DataPage } from './components/data-page';
import { PlanPage } from './components/plan-page';
import { SectionPage } from './components/section-page';
import { RulesPage } from './components/rules-page';
import { ZoomPage } from './components/zoom-page';
import { store } from './state/store';
import { createSampleProject } from './lib/sample';

const custom = [
  ['app-root', AppRoot],
  ['data-page', DataPage],
  ['plan-page', PlanPage],
  ['section-page', SectionPage],
  ['rules-page', RulesPage],
  ['zoom-page', ZoomPage]
] as const;

for (const [tag, ctor] of custom) {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

// 启动:优先恢复上次工程;首次使用(无存档)载入示例,开箱即可体验
if (!store.restore()) {
  store.loadProject(createSampleProject(), false);
}
