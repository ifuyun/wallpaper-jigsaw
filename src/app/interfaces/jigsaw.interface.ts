export type JigsawDifficulty = 'master' | 'expert' | 'hard' | 'medium' | 'easy';

export interface JigsawDifficultyItem {
  rows: number;
  cols: number;
  label: string;
}

export interface JigsawPiecePath {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  x?: number;
  y?: number;
}

export interface JigsawPiece {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  displayX: number;
  displayY: number;
  path: string;
}
