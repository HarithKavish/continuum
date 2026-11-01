// Draws the measurement in progress and the inspected point. Geometry is clamped to the
// terrain; the numbers come from GeographicLib on the ellipsoid (see geodesic.ts), not
// from the rendered mesh.

import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  CustomDataSource,
  HeightReference,
  HorizontalOrigin,
  LabelStyle,
  PolygonHierarchy,
  VerticalOrigin,
  type Viewer,
} from 'cesium';
import type { Tool } from '../../core/state/appState';
import { formatDistance, geodesicInverse } from '../measurements/geodesic';
import { MEASURE_COLOR, SELECTION_COLOR } from './palettes';

export class MeasureLayer {
  readonly source = new CustomDataSource('measurement');
  readonly marker = new CustomDataSource('inspection-marker');

  constructor(private readonly viewer: Viewer) {
    void viewer.dataSources.add(this.source);
    void viewer.dataSources.add(this.marker);
  }

  render(tool: Tool, points: { lon: number; lat: number }[]): void {
    const entities = this.source.entities;
    entities.suspendEvents();
    entities.removeAll();
    const color = Color.fromCssColorString(MEASURE_COLOR);
    const positions = points.map((p) => Cartesian3.fromDegrees(p.lon, p.lat));
    points.forEach((p, i) => {
      entities.add({
        position: positions[i],
        point: {
          pixelSize: 9,
          color,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label:
          i > 0 && tool !== 'area'
            ? {
                text: formatDistance(geodesicInverse(points[i - 1]!, p).distanceMeters),
                font: '12px sans-serif',
                fillColor: Color.WHITE,
                outlineColor: Color.BLACK,
                outlineWidth: 3,
                style: LabelStyle.FILL_AND_OUTLINE,
                horizontalOrigin: HorizontalOrigin.LEFT,
                verticalOrigin: VerticalOrigin.BOTTOM,
                pixelOffset: new Cartesian2(8, -8),
                heightReference: HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }
            : undefined,
      });
    });
    if (points.length >= 2 && tool !== 'area') {
      entities.add({ polyline: { positions, width: 3, material: color, clampToGround: true } });
    }
    if (tool === 'area' && points.length >= 2) {
      entities.add({
        polyline: {
          positions: [...positions, positions[0]!],
          width: 2,
          material: color,
          clampToGround: true,
        },
      });
      if (points.length >= 3) {
        entities.add({
          polygon: {
            hierarchy: new PolygonHierarchy(positions),
            material: new ColorMaterialProperty(color.withAlpha(0.22)),
          },
        });
      }
    }
    entities.resumeEvents();
    this.viewer.scene.requestRender();
  }

  setMarker(point: { lon: number; lat: number } | null): void {
    this.marker.entities.removeAll();
    if (point) {
      this.marker.entities.add({
        position: Cartesian3.fromDegrees(point.lon, point.lat),
        point: {
          pixelSize: 12,
          color: Color.TRANSPARENT,
          outlineColor: Color.fromCssColorString(SELECTION_COLOR),
          outlineWidth: 3,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    this.viewer.scene.requestRender();
  }
}
