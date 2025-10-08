export interface OCRToken {
  text: string;
  bbox: [number, number, number, number]; // x, y, width, height
  conf: number; // 0-1 confidence
  page: number;
}

export interface OCRKeyValue {
  key: string;
  value: string;
  bbox: [number, number, number, number];
  page: number;
}

export interface OCRTableCell {
  text: string;
  bbox: [number, number, number, number];
  conf: number;
}

export interface OCRTable {
  page: number;
  rows: OCRTableCell[][];
}

export interface OCRResult {
  tokens: OCRToken[];
  kvs: OCRKeyValue[];
  tables: OCRTable[];
  metadata: {
    engine: "textract" | "docai" | "tesseract" | "vector";
    pages: number;
    docTypeHint?: string;
  };
}

export interface PDFTextBlock {
  text: string;
  bbox: [number, number, number, number];
  page: number;
  font?: string;
  fontSize?: number;
}

export interface PDFTextResult {
  hasExtractableText: boolean;
  blocks: PDFTextBlock[];
  pages: number;
}