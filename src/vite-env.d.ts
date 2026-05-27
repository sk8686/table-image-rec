/// <reference types="vitest/globals" />

declare module '*.css' {
  const content: string;
  export default content;
}

declare module 'handsontable/dist/handsontable.full.min.css';
