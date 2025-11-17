import { NativeModules } from 'react-native';

export type Point = { x: number; y: number };

export type Quad = { tl: Point; tr: Point; br: Point; bl: Point };

export type NormalizedQuad = Quad; // x,y in [0,1] relative to image W/H

type DetectQuadResult = {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
  imgW: number;
  imgH: number;
} | null;

type CropPerspectiveResult = {
  uri: string;
  width: number;
  height: number;
};

const { PerspectiveCropper } = NativeModules;

const perspectiveCropper = PerspectiveCropper as
  | {
      detectQuad(imagePath: string): Promise<DetectQuadResult>;
      cropPerspective(
        imagePath: string,
        cornersPx: {
          tl: Point;
          tr: Point;
          br: Point;
          bl: Point;
        },
        quality: number,
      ): Promise<CropPerspectiveResult>;
    }
  | undefined;

export async function detectQuad(
  uri: string,
): Promise<{ quadNorm: NormalizedQuad | null; imgW: number; imgH: number }> {
  if (!perspectiveCropper?.detectQuad) {
    throw new Error('PerspectiveCropper native module not available');
  }

  // Normalize URI to file path
  const imagePath = uri.startsWith('file://') ? uri.slice(7) : uri;

  const result = await perspectiveCropper.detectQuad(imagePath);

  if (!result || result === null) {
    // No detection - we need to get image dimensions separately
    const { Image } = require('react-native');
    return new Promise((resolve, reject) => {
      Image.getSize(
        uri,
        (imgW: number, imgH: number) => {
          resolve({ quadNorm: null, imgW, imgH });
        },
        () => {
          reject(new Error('Failed to get image dimensions'));
        },
      );
    });
  }

  const { imgW, imgH, tl, tr, br, bl } = result;

  // Normalize points to [0,1]
  const quadNorm: NormalizedQuad = {
    tl: { x: tl.x / imgW, y: tl.y / imgH },
    tr: { x: tr.x / imgW, y: tr.y / imgH },
    br: { x: br.x / imgW, y: br.y / imgH },
    bl: { x: bl.x / imgW, y: bl.y / imgH },
  };

  return { quadNorm, imgW, imgH };
}

export async function cropPerspective(
  uri: string,
  imgW: number,
  imgH: number,
  quadNorm: NormalizedQuad,
  quality = 0.85,
): Promise<CropPerspectiveResult> {
  if (!perspectiveCropper?.cropPerspective) {
    throw new Error('PerspectiveCropper native module not available');
  }

  // Convert normalized to pixel coordinates
  const cornersPx = {
    tl: {
      x: Math.round(quadNorm.tl.x * imgW),
      y: Math.round(quadNorm.tl.y * imgH),
    },
    tr: {
      x: Math.round(quadNorm.tr.x * imgW),
      y: Math.round(quadNorm.tr.y * imgH),
    },
    br: {
      x: Math.round(quadNorm.br.x * imgW),
      y: Math.round(quadNorm.br.y * imgH),
    },
    bl: {
      x: Math.round(quadNorm.bl.x * imgW),
      y: Math.round(quadNorm.bl.y * imgH),
    },
  };

  // Normalize URI to file path
  const imagePath = uri.startsWith('file://') ? uri.slice(7) : uri;

  return await perspectiveCropper.cropPerspective(
    imagePath,
    cornersPx,
    quality,
  );
}

