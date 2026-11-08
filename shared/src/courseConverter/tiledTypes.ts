/** The subset of the Tiled JSON export (.tmj) the converter reads. */

export interface TiledProperty {
  name: string;
  type?: string;
  value: unknown;
}

export interface TiledObject {
  id: number;
  name?: string;
  /** Tiled 1.9+ calls it "class"; older versions "type". Both are accepted. */
  class?: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  point?: boolean;
  ellipse?: boolean;
  polygon?: { x: number; y: number }[];
  polyline?: { x: number; y: number }[];
  properties?: TiledProperty[] | Record<string, unknown>;
}

export interface TiledLayer {
  type: string;
  name: string;
  objects?: TiledObject[];
  /** Child layers of a group layer. */
  layers?: TiledLayer[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  properties?: TiledProperty[] | Record<string, unknown>;
}
