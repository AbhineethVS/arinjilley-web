// Text files bundled by Wrangler (default rule: *.txt are imported as strings).
declare module "*.txt" {
  const text: string;
  export default text;
}
