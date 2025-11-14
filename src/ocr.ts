import TextRecognition from 'react-native-text-recognition';

import type { Doc } from './types';
import { toBestPath } from './utils/paths';

export async function runOCRFor(doc: Doc) {
  const out: string[] = [];

  for (const p of doc.pages) {
    try {
      const { withScheme, plain } = toBestPath(p.uri);
      let lines = await TextRecognition.recognize(withScheme);
      if (!Array.isArray(lines) || lines.length === 0) {
        // Some environments need the plain path
        lines = await TextRecognition.recognize(plain);
      }
      out.push(Array.isArray(lines) ? lines.join('\n') : String(lines || ''));
    } catch {
      out.push('');
    }
  }

  return out;
}

