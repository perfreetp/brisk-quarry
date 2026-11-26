import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJ_TYPES } from './types';
import { eff } from './store';

const GROUND_Y = 0;
const LABEL_COLOR = '#1f2937';

function makeTextSprite(text, { bg = 'rgba(255,255,255,0.85)', fg = LABEL_COLOR, font = 'bold 42px Microsoft YaHei' } = {}) {
  const pad = 18;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  cv.width = Math.ceil(tw + pad * 2);
  cv.height = 72;
  const c2 = cv.getContext('2d');
  c2.font = font;
  c2.fillStyle = bg;
  c2.strokeStyle = 'rgba(0,0,0,0.25)';
  c2.lineWidth = 3;
  const r = 14;
  c2.beginPath();
  c2.roundRect(2, 2, cv.width - 4, cv.height - 4, r);
  c2.fill();
  c2.stroke();
  c2.fillStyle = fg;
  c2.textBaseline = 'middle';
  c2.fillText(text, pad, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  const scale = cv.width > 160 ? 3.4 : 2.4;
  sp.scale.set(scale, (scale * cv.height) / cv.width, 1);
  sp.userData.disposable = true;
  return sp;
}

function makeMarkerSprite() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.translate(48, 48);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.rect(-26, -26, 52, 52);
  ctx.fill();
  ctx.stroke();
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Microsoft YaHei';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('改', 0, 3);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(1.5, 1.5, 1);
  sp.userData.disposable = true;
  return sp;
}

export default class SceneManager {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.groups = new Map(); // uid -> group
    this.tweens = [];
    this.drag = null;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef1f5);
    this.scene.fog = new THREE.Fog(0xeef1f5, 120, 260);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    this.camera.position.set(45, 55, 55);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.target.set(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8ad97, 1.0);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(40, 70, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    this.envGroup = new THREE.Group();
    this.objGroup = new THREE.Group();
    this.scene.add(this.envGroup, this.objGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._bindEvents();
    this._clock = new THREE.Clock();
    this._render = this._render.bind(this);
    this.renderer.setAnimationLoop(this._render);

    this.resizeObserver = new ResizeObserver(() => this._resize());
    this.resizeObserver.observe(container);
  }

  // ---------- 环境（地面 / 网格 / 通道） ----------
  rebuildEnvironment(params) {
    this._clearGroup(this.envGroup);
    const { width, depth, corridorWidth, corridorDir } = params;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: 0xd8d0bd, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.envGroup.add(ground);

    // 2m 网格
    const pts = [];
    for (let x = -width / 2; x <= width / 2 + 1e-9; x += 2) {
      pts.push(x, 0.02, -depth / 2, x, 0.02, depth / 2);
    }
    for (let z = -depth / 2; z <= depth / 2 + 1e-9; z += 2) {
      pts.push(-width / 2, 0.02, z, width / 2, 0.02, z);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({ color: 0x9c9482, transparent: true, opacity: 0.45 })
    );
    this.envGroup.add(grid);

    // 场地边界
    const borderPts = [
      new THREE.Vector3(-width / 2, 0.05, -depth / 2),
      new THREE.Vector3(width / 2, 0.05, -depth / 2),
      new THREE.Vector3(width / 2, 0.05, depth / 2),
      new THREE.Vector3(-width / 2, 0.05, depth / 2),
    ];
    this.envGroup.add(
      new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(borderPts),
        new THREE.LineBasicMaterial({ color: 0x374151, linewidth: 2 })
      )
    );

    // 主通道
    const cw = corridorDir === 'x' ? width : corridorWidth;
    const cd = corridorDir === 'x' ? corridorWidth : depth;
    const corridor = new THREE.Mesh(
      new THREE.PlaneGeometry(cw, cd),
      new THREE.MeshStandardMaterial({ color: 0x454b55, roughness: 0.9 })
    );
    corridor.rotation.x = -Math.PI / 2;
    corridor.position.y = 0.03;
    corridor.receiveShadow = true;
    this.envGroup.add(corridor);

    // 通道中央虚线
    const dashPts = [];
    const along = corridorDir === 'x' ? width : depth;
    for (let t = -along / 2 + 1; t < along / 2; t += 2.5) {
      if (corridorDir === 'x') dashPts.push(t, 0.06, -0.35, t + 1.2, 0.06, -0.35, t, 0.06, 0.35, t + 1.2, 0.06, 0.35);
      else dashPts.push(-0.35, 0.06, t, -0.35, 0.06, t + 1.2, 0.35, 0.06, t, 0.35, 0.06, t + 1.2);
    }
    const dashGeo = new THREE.BufferGeometry();
    dashGeo.setAttribute('position', new THREE.Float32BufferAttribute(dashPts, 3));
    this.envGroup.add(new THREE.LineSegments(dashGeo, new THREE.LineBasicMaterial({ color: 0xf5d76e })));

    const tag = makeTextSprite(`主通道（宽 ${corridorWidth}m）`, {
      bg: 'rgba(31,41,55,0.9)',
      fg: '#f5d76e',
      font: 'bold 38px Microsoft YaHei',
    });
    if (corridorDir === 'x') {
      tag.position.set(-width / 2 + 9, 0.6, 0);
    } else {
      tag.position.set(0, 0.6, -depth / 2 + 9);
    }
    this.envGroup.add(tag);

    // 阴影相机贴合场地
    const s = Math.max(width, depth);
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  fitView(params) {
    const s = Math.max(params.width, params.depth);
    this._tweenCamera(new THREE.Vector3(s * 0.85, s * 0.95, s * 0.85), new THREE.Vector3(0, 0, 0), 600);
  }

  // ---------- 物件建模 ----------
  _buildContent(type, w, d) {
    const color = OBJ_TYPES[type].color;
    const holder = new THREE.Group();
    const mats = [];
    const std = (c, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...extra });
      mats.push(m);
      return m;
    };
    const add = (mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      holder.add(mesh);
      return mesh;
    };

    if (type === 'tent') {
      const h = Math.min(w, d) * 0.5;
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h, d * 0.92), std(color)));
      body.position.y = h / 2;
      const roofH = h * 0.7;
      const roof = add(
        new THREE.Mesh(new THREE.ConeGeometry((Math.hypot(w, d) / 2) * 0.72, roofH, 4), std(0x7ab0ff))
      );
      roof.rotation.y = Math.PI / 4;
      roof.position.y = h + roofH / 2;
      holder.userData.height = h + roofH + 1.4;
    } else if (type === 'assembly') {
      const r = Math.min(w, d) / 2;
      const plat = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.35, 32), std(color)));
      plat.position.y = 0.18;
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 10), std(0xe5e7eb)));
      pole.position.y = 1.9;
      const flag = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.06), std(0xff3b30)));
      flag.position.set(0.72, 3.1, 0);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.9, r, 32),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      holder.add(ring);
      holder.userData.height = 4.6;
    } else if (type === 'supply') {
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), std(color)));
      base.position.y = 0.35;
      const crateMats = [std(0xd97706), std(0xfbbf24), std(0xb45309)];
      const n = 3;
      for (let i = 0; i < n; i++) {
        const cw = w * 0.26;
        const crate = add(new THREE.Mesh(new THREE.BoxGeometry(cw, 0.8, d * 0.6), crateMats[i % crateMats.length]));
        crate.position.set((i - 1) * w * 0.3, 1.1, 0);
      }
      holder.userData.height = 2.6;
    } else {
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 10), std(color)));
      pole.position.y = 0.65;
      const top = add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), std(0xffd60a)));
      top.position.y = 1.35;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.42, 24),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      holder.add(ring);
      holder.userData.height = 2.5;
    }
    holder.userData.mats = mats;
    return holder;
  }

  _makeGroup(obj) {
    const e = eff(obj);
    const g = new THREE.Group();
    g.userData.uid = obj.uid;
    g.userData.sizeKey = `${e.w}x${e.d}`;

    const content = this._buildContent(obj.type, e.w, e.d);
    g.userData.content = content;
    g.add(content);

    const label = makeTextSprite(obj.name);
    label.position.y = content.userData.height;
    g.userData.label = label;
    g.add(label);

    const marker = makeMarkerSprite();
    marker.position.set(Math.max(e.w, e.d) * 0.62, content.userData.height + 0.9, 0);
    marker.visible = !!obj.manual;
    g.userData.marker = marker;
    g.add(marker);

    const ringR = Math.hypot(e.w, e.d) / 2 + 0.25;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(ringR, ringR + 0.18, 48),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    ring.visible = false;
    g.userData.ring = ring;
    g.add(ring);

    g.position.set(e.x, GROUND_Y, e.z);
    g.rotation.y = -e.rot;
    return g;
  }

  // 状态 -> 场景 同步
  sync(objects, selectedId) {
    const alive = new Set();
    for (const obj of objects) {
      if (obj.unplaced) continue;
      alive.add(obj.uid);
      const e = eff(obj);
      let g = this.groups.get(obj.uid);
      const sizeKey = `${e.w}x${e.d}`;
      if (!g) {
        g = this._makeGroup(obj);
        this.objGroup.add(g);
        this.groups.set(obj.uid, g);
      } else if (g.userData.sizeKey !== sizeKey) {
        // 尺寸变化：重建模型主体
        this.objGroup.remove(g);
        this._disposeObject(g);
        g = this._makeGroup(obj);
        this.objGroup.add(g);
        this.groups.set(obj.uid, g);
      }
      const dragging = this.drag && this.drag.uid === obj.uid;
      if (!dragging) {
        g.position.set(e.x, GROUND_Y, e.z);
        g.rotation.y = -e.rot;
      }
      g.userData.marker.visible = !!obj.manual;
      g.userData.ring.visible = obj.uid === selectedId;
    }
    for (const [uid, g] of this.groups) {
      if (!alive.has(uid)) {
        this.objGroup.remove(g);
        this._disposeObject(g);
        this.groups.delete(uid);
      }
    }
  }

  focusOn(uid) {
    const g = this.groups.get(uid);
    if (!g) return;
    const p = g.position;
    const dist = 18;
    this._tweenCamera(
      new THREE.Vector3(p.x + dist * 0.7, 16, p.z + dist * 0.7),
      new THREE.Vector3(p.x, 0, p.z),
      450
    );
  }

  // ---------- 交互 ----------
  _bindEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => this._onDown(e));
    dom.addEventListener('pointermove', (e) => this._onMove(e));
    dom.addEventListener('pointerup', (e) => this._onUp(e));
    dom.addEventListener('pointercancel', (e) => this._onUp(e));
  }

  _setPointer(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _pickUid(e) {
    this._setPointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.objGroup.children, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && o.userData.uid === undefined) o = o.parent;
      if (o && o.userData.uid) return o.userData.uid;
    }
    return null;
  }

  _groundPoint(e) {
    this._setPointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, out) ? out : null;
  }

  _onDown(e) {
    if (e.button !== 0) return;
    const uid = this._pickUid(e);
    if (!uid) return;
    this.store.select(uid);
    this.drag = { uid, startX: e.clientX, startY: e.clientY, active: false, legal: true };
  }

  _onMove(e) {
    if (!this.drag) {
      const uid = this._pickUid(e);
      this.renderer.domElement.style.cursor = uid ? 'pointer' : 'default';
      this.store.setHover(uid);
      return;
    }
    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;
    if (!this.drag.active && Math.hypot(dx, dy) < 5) return;
    if (!this.drag.active) {
      this.drag.active = true;
      this.controls.enabled = false;
    }
    const p = this._groundPoint(e);
    if (!p) return;
    const g = this.groups.get(this.drag.uid);
    g.position.set(Math.round(p.x * 10) / 10, GROUND_Y, Math.round(p.z * 10) / 10);
    this.drag.legal = this.store.probeDrag(this.drag.uid, g.position.x, g.position.z);
    this._setTint(g, this.drag.legal ? null : 0xff2d2d);
  }

  _onUp() {
    if (!this.drag) return;
    const { uid, active } = this.drag;
    const g = this.groups.get(uid);
    this._setTint(g, null);
    if (active) {
      const res = this.store.commitDrag(uid, g.position.x, g.position.z);
      if (res) {
        const obj = this.store.raw.objects.find((o) => o.uid === uid);
        const e = this.store.eff(obj);
        this._tweenPosition(g, new THREE.Vector3(e.x, GROUND_Y, e.z), res.legal ? 90 : 320);
      }
    }
    this.drag = null;
    this.controls.enabled = true;
  }

  _setTint(group, color) {
    const mats = group.userData.content?.userData.mats ?? [];
    for (const m of mats) {
      m.emissive.setHex(color ?? 0x000000);
      m.emissiveIntensity = color ? 0.55 : 0;
    }
  }

  // ---------- 补间 ----------
  _tweenPosition(group, to, ms) {
    this.tweens = this.tweens.filter((t) => t.group !== group);
    this.tweens.push({
      kind: 'pos',
      group,
      from: group.position.clone(),
      to: to.clone(),
      t0: performance.now(),
      ms,
    });
  }

  _tweenCamera(camTo, targetTo, ms) {
    this.tweens.push({
      kind: 'cam',
      camFrom: this.camera.position.clone(),
      camTo: camTo.clone(),
      tgtFrom: this.controls.target.clone(),
      tgtTo: targetTo.clone(),
      t0: performance.now(),
      ms,
    });
  }

  _updateTweens(now) {
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    this.tweens = this.tweens.filter((tw) => {
      const t = Math.min(1, (now - tw.t0) / tw.ms);
      const k = ease(t);
      if (tw.kind === 'pos') {
        tw.group.position.lerpVectors(tw.from, tw.to, k);
      } else {
        this.camera.position.lerpVectors(tw.camFrom, tw.camTo, k);
        this.controls.target.lerpVectors(tw.tgtFrom, tw.tgtTo, k);
      }
      return t < 1;
    });
  }

  _render() {
    this._updateTweens(performance.now());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _clearGroup(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      this._disposeTree(child);
    }
  }

  _disposeObject(g) {
    this._disposeTree(g);
  }

  _disposeTree(root) {
    root.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) {
        const ms = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of ms) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this._clearGroup(this.envGroup);
    this._clearGroup(this.objGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
