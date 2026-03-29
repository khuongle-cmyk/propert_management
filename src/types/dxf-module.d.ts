declare module "dxf" {
  export class Helper {
    constructor(contents: string);
    parse(): unknown;
    get parsed(): {
      entities?: unknown[];
      header?: Record<string, unknown>;
      tables?: Record<string, unknown>;
    };
  }
}
