/** The Worker's origin, set by build.mjs (--worker). */
declare const __WORKER_BASE__: string;

/** Stylesheets are bundled as text (build.mjs), for the overlay's shadow root. */
declare module "*.css" {
  const css: string;
  export default css;
}
