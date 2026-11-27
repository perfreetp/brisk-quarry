import * as pc from 'playcanvas';
import type { BranchData, CutMarker, Vec3Tuple } from '../types';
import { cross, diameterAtT, normalize, sub } from '../lib/math';

export class GeometryBuilder {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  get vertexCount() {
    return this.positions.length / 3;
  }

  vertex(p: Vec3Tuple, n: Vec3Tuple, color?: [number, number, number], uv?: [number, number]) {
    const index = this.vertexCount;
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    if (color) this.colors.push(color[0], color[1], color[2], 1);
    if (uv) this.uvs.push(uv[0], uv[1]);
    return index;
  }

  toMesh(device: pc.GraphicsDevice, options: { colors?: boolean; uvs?: boolean } = {}): pc.Mesh {
    const mesh = new pc.Mesh(device);
    mesh.setPositions(this.positions);
    mesh.setNormals(this.normals);
    if (options.colors) mesh.setColors(this.colors, 4);
    if (options.uvs) mesh.setUvs(0, this.uvs, 2);
    mesh.setIndices(new Uint32Array(this.indices));
    mesh.update();
    return mesh;
  }
}

function basisForAxis(axis: Vec3Tuple): { u: Vec3Tuple; v: Vec3Tuple } {
  const helper: Vec3Tuple = Math.abs(axis[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, helper));
  const v = cross(axis, u);
  return { u, v };
}

export interface BranchRange {
  start: number;
  count: number;
}

export function appendTaperedBranch(
  g: GeometryBuilder,
  b: BranchData,
  color: [number, number, number],
  radialSegments = 8,
): BranchRange {
  const startVertex = g.vertexCount;
  const axis = normalize(sub(b.end, b.start));
  const { u, v } = basisForAxis(axis);
  const radii = [b.diameter * 0.5, b.tipDiameter * 0.5];
  const centers = [b.start, b.end];
  const ringStart = [g.vertexCount, 0];

  for (let ring = 0; ring < 2; ring++) {
    ringStart[ring] = g.vertexCount;
    for (let j = 0; j < radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const n: Vec3Tuple = [
        u[0] * ca + v[0] * sa,
        u[1] * ca + v[1] * sa,
        u[2] * ca + v[2] * sa,
      ];
      const r = radii[ring];
      const p: Vec3Tuple = [centers[ring][0] + n[0] * r, centers[ring][1] + n[1] * r, centers[ring][2] + n[2] * r];
      g.vertex(p, n, color);
    }
  }

  const base = ringStart[0];
  const tip = ringStart[1];
  for (let j = 0; j < radialSegments; j++) {
    const j1 = (j + 1) % radialSegments;
    const a = base + j;
    const bb = base + j1;
    const c = tip + j;
    const d = tip + j1;
    g.indices.push(a, bb, c, bb, d, c);
  }

  const baseCenter = g.vertex(b.start, [-axis[0], -axis[1], -axis[2]], color);
  const tipCenter = g.vertex(b.end, axis, color);
  for (let j = 0; j < radialSegments; j++) {
    const j1 = (j + 1) % radialSegments;
    g.indices.push(baseCenter, base + j1, base + j);
    g.indices.push(tipCenter, tip + j, tip + j1);
  }

  return { start: startVertex, count: g.vertexCount - startVertex };
}

export function appendCutBand(g: GeometryBuilder, b: BranchData, cut: CutMarker, radialSegments = 12) {
  const axis = normalize(sub(b.end, b.start));
  const { u, v } = basisForAxis(axis);
  const center = cut.position;
  const woodRadius = diameterAtT(b, cut.t) * 0.5;
  const radius = woodRadius + Math.max(0.0025, Math.min(0.008, b.diameter * 0.05));
  const halfHeight = Math.max(0.006, Math.min(0.026, b.diameter * 0.16));
  const p0: Vec3Tuple = [center[0] - axis[0] * halfHeight, center[1] - axis[1] * halfHeight, center[2] - axis[2] * halfHeight];
  const p1: Vec3Tuple = [center[0] + axis[0] * halfHeight, center[1] + axis[1] * halfHeight, center[2] + axis[2] * halfHeight];
  const start = g.vertexCount;
  const ringStart = [start, start + radialSegments];

  for (let ring = 0; ring < 2; ring++) {
    const c = ring === 0 ? p0 : p1;
    for (let j = 0; j < radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2;
      const n: Vec3Tuple = [
        u[0] * Math.cos(a) + v[0] * Math.sin(a),
        u[1] * Math.cos(a) + v[1] * Math.sin(a),
        u[2] * Math.cos(a) + v[2] * Math.sin(a),
      ];
      g.vertex([c[0] + n[0] * radius, c[1] + n[1] * radius, c[2] + n[2] * radius], n);
    }
  }
  for (let j = 0; j < radialSegments; j++) {
    const j1 = (j + 1) % radialSegments;
    const a = ringStart[0] + j;
    const bb = ringStart[0] + j1;
    const c = ringStart[1] + j;
    const d = ringStart[1] + j1;
    g.indices.push(a, bb, c, bb, d, c);
  }
  const c0 = g.vertex(p0, [-axis[0], -axis[1], -axis[2]]);
  const c1 = g.vertex(p1, axis);
  for (let j = 0; j < radialSegments; j++) {
    const j1 = (j + 1) % radialSegments;
    g.indices.push(c0, ringStart[0] + j1, ringStart[0] + j);
    g.indices.push(c1, ringStart[1] + j, ringStart[1] + j1);
  }
}

export function createGroundMesh(device: pc.GraphicsDevice, size = 12): pc.Mesh {
  const g = new GeometryBuilder();
  const s = size / 2;
  const n: Vec3Tuple = [0, 1, 0];
  const p0: Vec3Tuple = [-s, 0, -s];
  const p1: Vec3Tuple = [s, 0, -s];
  const p2: Vec3Tuple = [s, 0, s];
  const p3: Vec3Tuple = [-s, 0, s];
  const i0 = g.vertex(p0, n, undefined, [0, 0]);
  const i1 = g.vertex(p1, n, undefined, [1, 0]);
  const i2 = g.vertex(p2, n, undefined, [1, 1]);
  const i3 = g.vertex(p3, n, undefined, [0, 1]);
  g.indices.push(i0, i2, i1, i0, i3, i2);
  return g.toMesh(device, { uvs: true });
}

export function createGridTexture(device: pc.GraphicsDevice, sizeMetres = 12): pc.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#edf1e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pxPerMetre = canvas.width / sizeMetres;
  for (let m = 0; m <= sizeMetres; m += 0.5) {
    const p = m * pxPerMetre;
    const major = Math.abs(m - Math.round(m)) < 0.001;
    ctx.strokeStyle = major ? 'rgba(52, 84, 53, 0.22)' : 'rgba(52, 84, 53, 0.09)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, canvas.height);
    ctx.moveTo(0, p);
    ctx.lineTo(canvas.width, p);
    ctx.stroke();
  }

  // Origin marker.
  ctx.fillStyle = 'rgba(47, 158, 68, 0.55)';
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 7, 0, Math.PI * 2);
  ctx.fill();

  const texture = new pc.Texture(device, {
    width: canvas.width,
    height: canvas.height,
    format: pc.PIXELFORMAT_R8_G8_B8_A8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
  });
  texture.setSource(canvas);
  texture.anisotropy = Math.min(8, device.maxAnisotropy ?? 1);
  return texture;
}
