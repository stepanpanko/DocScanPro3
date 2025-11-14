// src/utils/log.ts
// Simple logger that no-ops in release builds

const isDev = __DEV__;

export function log(...args: any[]) {
  if (isDev) {
    console.log(...args);
  }
}

export function warn(...args: any[]) {
  if (isDev) {
    console.warn(...args);
  }
}

export function error(...args: any[]) {
  if (isDev) {
    console.error(...args);
  }
}

