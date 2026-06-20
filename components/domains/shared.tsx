'use client';

export const APP_TYPES = ['next.js', 'node.js', 'python', 'go', 'php', 'static', 'other'];

export interface Route {
  path: string;
  port: string;
  type: string;
}
