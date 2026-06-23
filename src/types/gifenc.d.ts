declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options: { palette: number[][]; delay: number; transparent?: boolean; transparentIndex?: number; repeat?: number }
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };

  export function quantize(
    data: Uint8ClampedArray,
    maxColors: number,
    options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean | number }
  ): number[][];
  export function applyPalette(
    data: Uint8ClampedArray,
    palette: number[][],
    format?: "rgb565" | "rgb444" | "rgba4444"
  ): Uint8Array;
}
