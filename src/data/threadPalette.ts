import type { ThreadColor } from '../types';

export const DEFAULT_THREAD_PALETTE: ThreadColor[] = [
  { id: 'ochre-red', name: '赭红', hex: '#c45c26', thread: 'DMC 946', family: 'warm' },
  { id: 'earth-red', name: '土红', hex: '#a63d40', thread: 'DMC 815', family: 'warm' },
  { id: 'sun-gold', name: '鎏金', hex: '#c9a227', thread: 'DMC 676', family: 'gold' },
  { id: 'brown-gold', name: '褐金', hex: '#8b6914', thread: 'DMC 782', family: 'gold' },
  { id: 'indigo', name: '靛蓝', hex: '#2c4a7c', thread: 'DMC 820', family: 'cool' },
  { id: 'deep-indigo', name: '黛青', hex: '#1e4d6b', thread: 'DMC 798', family: 'cool' },
  { id: 'pine-green', name: '松绿', hex: '#3d5a3d', thread: 'DMC 986', family: 'green' },
  { id: 'mist-cream', name: '米白', hex: '#f0e6d3', thread: 'DMC 712', family: 'neutral' },
  { id: 'warm-ivory', name: '暖象牙', hex: '#ebe4d4', thread: 'DMC Blanc', family: 'neutral' },
  { id: 'charcoal', name: '炭黑', hex: '#1a1814', thread: 'DMC 310', family: 'neutral' },
  { id: 'amber', name: '琥珀', hex: '#e07840', thread: 'DMC 721', family: 'warm' },
  { id: 'stone-blue', name: '石青', hex: '#4f6d9f', thread: 'DMC 809', family: 'cool' },
];

export const THREAD_PALETTE = DEFAULT_THREAD_PALETTE;

export const DEFAULT_LIBRARY_PALETTES = [
  ['ochre-red', 'indigo', 'mist-cream', 'sun-gold'],
  ['earth-red', 'brown-gold', 'pine-green', 'warm-ivory'],
  ['indigo', 'stone-blue', 'mist-cream', 'charcoal'],
];
