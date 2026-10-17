export type Progress = { seconds: number; updatedAt: number; covered: [number, number][]; finished: boolean };
export type ReaderState = { favorites: string[]; progress: Record<string, Progress> };
export function emptyReader(): ReaderState;
export function mergeRanges(ranges: [number, number][], duration?: number): [number, number][];
export function sanitizeReader(value: unknown, lessons: { id: string; durationSeconds: number }[]): ReaderState;
