/**
 * Loads an SVG map as an Image usable with canvas drawImage.
 * - `fill` recolours the SVG (the equirectangular file has no fill attribute → black).
 * - `width`/`height` set an intrinsic size; needed for viewBox-only SVGs (DoubleMap.svg),
 *   otherwise Chrome letterboxes them into a 300×150 viewport.
 */
export interface SvgImageOptions {
  fill?: string;
  width?: number;
  height?: number;
  /** replaces the file's viewBox, e.g. to crop DoubleMap.svg to its first world */
  viewBox?: string;
}

const cache = new Map<string, Promise<HTMLImageElement>>();

export const EQUIRECT_MAP_URL = `${import.meta.env.BASE_URL}Assets/Equirectangular_projection_world_map_without_borders.svg`;
export const DOUBLE_MAP_URL = `${import.meta.env.BASE_URL}Assets/DoubleMap.svg`;

export function loadSvgImage(url: string, opts: SvgImageOptions = {}): Promise<HTMLImageElement> {
  const key = `${url}|${opts.fill ?? ''}|${opts.width ?? ''}x${opts.height ?? ''}|${opts.viewBox ?? ''}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Map SVG failed to load (${r.status})`);
        return r.text();
      })
      .then((svg) => {
        let attrs = '';
        if (opts.fill) attrs += ` fill="${opts.fill}"`;
        if (opts.viewBox) svg = svg.replace(/<svg ([^>]*?)\sviewBox="[^"]*"/, '<svg $1').replace('<svg ', `<svg viewBox="${opts.viewBox}" `);
        if (opts.width && opts.height) {
          svg = svg.replace(/<svg ([^>]*?)\s(?:width|height)="[^"]*"/g, '<svg $1').replace(/<svg ([^>]*?)\s(?:width|height)="[^"]*"/g, '<svg $1');
          attrs += ` width="${opts.width}" height="${opts.height}"`;
        }
        const patched = svg.replace('<svg ', `<svg${attrs} `);
        const objectUrl = URL.createObjectURL(new Blob([patched], { type: 'image/svg+xml' }));
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Map SVG could not be decoded'));
          img.src = objectUrl;
        });
      });
    cache.set(key, p);
  }
  return p;
}

/** Backwards-compatible helper used by the Time Beam page. */
export function loadMapImage(fill: string): Promise<HTMLImageElement> {
  return loadSvgImage(EQUIRECT_MAP_URL, { fill });
}
