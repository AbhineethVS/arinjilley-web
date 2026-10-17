// Module types for files imported through Wrangler's bundler.
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
declare module "*.woff" {
  const data: ArrayBuffer;
  export default data;
}
declare module "*.ttf" {
  const data: ArrayBuffer;
  export default data;
}
