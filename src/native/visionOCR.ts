import { NativeModules } from 'react-native';

export type VisionOCRWord = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  conf?: number;
};

export type VisionOCRResult = {
  imgW: number;
  imgH: number;
  words: VisionOCRWord[];
};

const { VisionOCR } = NativeModules;

export default VisionOCR as
  | {
      recognize(
        imagePath: string,
        languages?: string[],
      ): Promise<VisionOCRResult>;
    }
  | undefined;

