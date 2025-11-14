import { NativeModules } from 'react-native';

export type RasterizeOptions = {
  maxPages?: number;
  dpi?: number;
};

export type RasterizeResult = {
  pages: Array<{
    path: string;
    width: number;
    height: number;
  }>;
};

const { PDFRasterizer } = NativeModules;

export default PDFRasterizer as {
  rasterize(
    pdfPath: string,
    options?: RasterizeOptions,
  ): Promise<RasterizeResult>;
};

