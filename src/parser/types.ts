export interface ParsedDocument {
  /** Root AST node (LikeC4Grammar) */
  ast: any;
  /** Root CST node with fullText and positions */
  cst: any;
  /** Original source text */
  fullText: string;
  /** Parser errors (empty = success) */
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
  length: number;
}

export interface DocumentPosition {
  offset: number;
  end: number;
  line: number;
  column: number;
}
