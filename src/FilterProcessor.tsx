import React, { createContext, useContext, useMemo } from 'react';
import { NativeModules } from 'react-native';

type FilterKind = 'color' | 'grayscale' | 'bw';
type Options = {
  filter: FilterKind;
  rotation: 0 | 90 | 180 | 270;
  autoContrast?: boolean;
};

type FilterProcessorContextType = {
  getPreviewUri: (uri: string, opts: Options) => Promise<string>;
  getFinalUri: (uri: string, opts: Options) => Promise<string>;
};

const FilterProcessorContext = createContext<FilterProcessorContextType | null>(
  null,
);

// Memoized cache for processed images
const cache = new Map<string, string>();

export function FilterProcessorProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const contextValue = useMemo(() => {
    const processImage = async (
      uri: string,
      opts: Options,
    ): Promise<string> => {
      const cacheKey = `${uri}-${JSON.stringify(opts)}`;

      // Check cache first
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey)!;
      }

      try {
        // Check if native module is available
        if (!NativeModules.ImageFilters) {
          console.warn(
            '[FilterProcessor] ImageFilters native module not available, using original',
          );
          console.log(
            '[FilterProcessor] Available native modules:',
            Object.keys(NativeModules),
          );
          return uri;
        }

        console.log('[FilterProcessor] Processing image with options:', {
          uri,
          filter: opts.filter,
          rotation: opts.rotation,
          autoContrast: opts.autoContrast || false,
        });

        // Call native module
        const result = await NativeModules.ImageFilters.process(uri, {
          filter: opts.filter,
          rotation: opts.rotation,
          autoContrast: opts.autoContrast || false,
        });

        console.log('[FilterProcessor] Native processing result:', result);

        // Cache the result
        cache.set(cacheKey, result);
        return result;
      } catch (error) {
        console.warn(
          '[FilterProcessor] Native processing failed, using original:',
          error,
        );
        console.log('[FilterProcessor] Failed URI:', uri);
        console.log('[FilterProcessor] Failed options:', opts);
        // Fallback to original URI
        return uri;
      }
    };

    return {
      getPreviewUri: processImage,
      getFinalUri: processImage,
    };
  }, []);

  return (
    <FilterProcessorContext.Provider value={contextValue}>
      {children}
    </FilterProcessorContext.Provider>
  );
}

export function useFilterProcessor(): FilterProcessorContextType {
  const context = useContext(FilterProcessorContext);
  if (!context) {
    throw new Error(
      'useFilterProcessor must be used within FilterProcessorProvider',
    );
  }
  return context;
}

