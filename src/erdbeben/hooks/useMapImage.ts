import { useEffect, useState } from 'react';
import { loadSvgImage, EQUIRECT_MAP_URL, type SvgImageOptions } from '../lib/mapImage';
import { COLORS } from '../lib/scales';

export function useSvgImage(url: string, opts?: SvgImageOptions) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const key = JSON.stringify(opts ?? {});
  useEffect(() => {
    let alive = true;
    loadSvgImage(url, JSON.parse(key))
      .then((i) => alive && setImg(i))
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
  }, [url, key]);
  return img;
}

/** Equirectangular map recoloured for the Time Beam page. */
export function useMapImage(fill: string = COLORS.map) {
  return useSvgImage(EQUIRECT_MAP_URL, { fill });
}
