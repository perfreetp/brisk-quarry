import * as THREE from 'three'
import { buildAlignment } from './alignment'
import { createLoftGeometry } from './loft'
import { formatStation, downloadText } from './format'

function ifcNumber(n) {
  if (!Number.isFinite(n)) return '0.'
  const v = Math.abs(n) < 0.0000005 ? 0 : n
  return `${Number(v.toFixed(5))}`.includes('.') ? `${Number(v.toFixed(5))}` : `${Number(v.toFixed(5))}.`
}

function ifcText(s) {
  return `'${String(s ?? '').replace(/'/g, "''")}'`
}

function makeGuid(n) {
  return `2${n.toString(36).padStart(21, '0')}`.slice(0, 22)
}

class IfcWriter {
  constructor() {
    this.lines = []
    this.id = 0
    this.guid = 100
  }

  add(expr) {
    this.id += 1
    this.lines.push(`#${this.id}=${expr};`)
    return this.id
  }

  nextGuid() {
    this.guid += 1
    return makeGuid(this.guid)
  }

  buildSegmentTriangles(seg, alignment, template) {
    const geometry = createLoftGeometry({
      alignment,
      startStation: seg.startStation,
      endStation: seg.endStation,
      template,
      subdivisions: Math.max(1, seg.densityFactor || 1),
      startElev: seg.startElev,
      endElev: seg.endElev,
      capStart: true,
      capEnd: true,
      buildBVH: false
    })
    const pos = geometry.getAttribute('position')
    const index = geometry.getIndex()
    const coords = []
    for (let i = 0; i < pos.count; i++) {
      // three: x=东, y=高程, z=北；IFC 常用 Z 向上，故映射为 (东, 北, 高程)
      coords.push([pos.getX(i), pos.getZ(i), pos.getY(i)])
    }
    const tris = []
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        tris.push([index.getX(i) + 1, index.getX(i + 1) + 1, index.getX(i + 2) + 1])
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) tris.push([i + 1, i + 2, i + 3])
    }
    geometry.dispose()
    return { coords, tris }
  }

  write(store) {
    const template = store.templates.find(t => t.id === store.templateId) || store.templates[0]
    const alignment = buildAlignment(store.axisPoints, store.geoOrigin)
    const date = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

    this.add(`IFCPERSON($,$,'测量员',$,$,$,$,$)`)
    const org = this.add(`IFCORGANIZATION($,'Tunnel BIM Team',$,$,$)`)
    const person = 1
    const pao = this.add(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`)
    const app = this.add(`IFCAPPLICATION(#${org},'1.0','Tunnel Axis Loft','TAL')`)
    const owner = this.add(`IFCOWNERHISTORY(#${pao},#${app},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})`)

    const metre = this.add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`)
    const area = this.add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`)
    const volume = this.add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`)
    const unitAssignment = this.add(`IFCUNITASSIGNMENT((#${metre},#${area},#${volume}))`)

    const originPoint = this.add(`IFCCARTESIANPOINT((0.,0.,0.))`)
    const axisZ = this.add(`IFCDIRECTION((0.,0.,1.))`)
    const dirX = this.add(`IFCDIRECTION((1.,0.,0.))`)
    const contextPlacement = this.add(`IFCAXIS2PLACEMENT3D(#${originPoint},#${axisZ},#${dirX})`)
    const context = this.add(`IFCGEOMETRICREPRESENTATIONCONTEXT('Model','Model',3,1.0E-5,#${contextPlacement},$)`)

    const project = this.add(
      `IFCPROJECT(${ifcText(this.nextGuid())},#${owner},${ifcText('Tunnel Axis Loft Project')},` +
      `${ifcText('Tunnel solids lofted and split by chainage')},$,'Tunnel Detailed Design',$,(#${context}),#${unitAssignment})`
    )

    const sitePlacementPoint = this.add(`IFCCARTESIANPOINT((0.,0.,0.))`)
    const siteAxis = this.add(`IFCAXIS2PLACEMENT3D(#${sitePlacementPoint},$,$)`)
    const sitePlacement = this.add(`IFCLOCALPLACEMENT($,#${siteAxis})`)
    const site = this.add(
      `IFCSITE(${ifcText(this.nextGuid())},#${owner},'Tunnel Site',$,$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`
    )
    this.add(`IFCRELAGGREGATES(${ifcText(this.nextGuid())},#${owner},$,$,#${project},(#${site}))`)

    const productIds = []
    for (const seg of store.segments) {
      const { coords, tris } = this.buildSegmentTriangles(seg, alignment, template)
      const coordList = coords.map(c =>
        `(${ifcNumber(c[0])},${ifcNumber(c[1])},${ifcNumber(c[2])})`
      ).join(',')
      const pointList = this.add(`IFCCARTESIANPOINTLIST3D((${coordList}))`)
      const triList = tris.map(t => `(${t[0]},${t[1]},${t[2]})`).join(',')
      const faceSet = this.add(
        `IFCTRIANGULATEDFACESET(#${pointList},$,.T.,(${triList}),$)`
      )
      const shapeRep = this.add(
        `IFCSHAPEREPRESENTATION(#${context},'Body','Tessellation',(#${faceSet}))`
      )
      const productShape = this.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}))`)
      const placementPoint = this.add(`IFCCARTESIANPOINT((0.,0.,0.))`)
      const placementAxis = this.add(`IFCAXIS2PLACEMENT3D(#${placementPoint},$,$)`)
      const placement = this.add(`IFCLOCALPLACEMENT($,#${placementAxis})`)
      const product = this.add(
        `IFCBUILDINGELEMENTPROXY(${ifcText(this.nextGuid())},#${owner},` +
        `${ifcText(`Tunnel Segment ${seg.index + 1} ${seg.stationRange}`)},${ifcText(`Chainage ${seg.stationRange}; Excavation volume ${seg.excavationVolume.toFixed(2)} m3`)},` +
        `'TunnelSegment',#${placement},#${productShape},$,.NOTDEFINED.)`
      )
      productIds.push(product)

      const pStationStart = this.add(`IFCPROPERTYSINGLEVALUE('StartStation','起点桩号',IFCTEXT(${ifcText(formatStation(seg.startStation))}),$)`)
      const pStationEnd = this.add(`IFCPROPERTYSINGLEVALUE('EndStation','终点桩号',IFCTEXT(${ifcText(formatStation(seg.endStation))}),$)`)
      const pLength = this.add(`IFCPROPERTYSINGLEVALUE('Length','段长(m)',IFCREAL(${ifcNumber(seg.length)}),$)`)
      const pArea = this.add(`IFCPROPERTYSINGLEVALUE('ExcavationArea','开挖面积(m2)',IFCAREAMEASURE(${ifcNumber(seg.excavationArea)}),$)`)
      const pVolume = this.add(`IFCPROPERTYSINGLEVALUE('ExcavationVolume','开挖方量(m3)',IFCVOLUMEMEASURE(${ifcNumber(seg.excavationVolume)}),$)`)
      const pIntersect = this.add(`IFCPROPERTYSINGLEVALUE('RockIntersection','岩层穿插',IFCBOOLEAN(${seg.intersects ? '.T.' : '.F.'}),$)`)
      const pDensity = this.add(`IFCPROPERTYSINGLEVALUE('DensityFactor','断面加密倍数',IFCINTEGER(${seg.densityFactor || 1}),$)`)
      const pset = this.add(
        `IFCPROPERTYSET(${ifcText(this.nextGuid())},#${owner},'Pset_TunnelSegment_Chainage',$,` +
        `(#${pStationStart},#${pStationEnd},#${pLength},#${pArea},#${pVolume},#${pIntersect},#${pDensity}))`
      )
      this.add(`IFCRELDEFINESBYPROPERTIES(${ifcText(this.nextGuid())},#${owner},$,$,(#${product}),#${pset})`)
    }

    this.add(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcText(this.nextGuid())},#${owner},$,$,` +
      `(${productIds.map(id => `#${id}`).join(',')}),#${site})`
    )

    return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Tunnel segment IFC export'),'2;1');
FILE_NAME('tunnel_segments_${date}.ifc','${date}',('Surveyor'),('Tunnel BIM'),'Tunnel Axis Loft 1.0','Vue3 + three.js + three-mesh-bvh','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
${this.lines.join('\n')}
ENDSEC;
END-ISO-10303-21;
`
  }
}

export function buildIfcText(store) {
  if (!store.segments?.length) throw new Error('没有可导出的洞身分段，请先放样')
  const writer = new IfcWriter()
  return writer.write(store)
}

export function exportIfcByChainage(store) {
  const text = buildIfcText(store)
  downloadText(`Tunnel_Segments_By_Chainage_${new Date().toISOString().slice(0, 10)}.ifc`, text, 'application/x-step;charset=utf-8', false)
}
