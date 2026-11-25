import type Konva from 'konva';

declare module 'konva/lib/Node' {
  interface Node {
    addTo(parent: Konva.Container): this;
  }
}
