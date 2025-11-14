import { Image } from 'react-native';

export function getImageDimensions(
  uri: string,
): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }),
    );
  });
}

