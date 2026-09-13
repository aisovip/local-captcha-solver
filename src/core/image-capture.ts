import { MAX_CAPTCHA_IMAGE_DIMENSION, MAX_CAPTCHA_IMAGE_PIXELS } from './image-limits';

export interface ImageCaptureArea {
  left: number;
  top: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export type ImageCaptureResult =
  | { state: 'ready'; dataUrl: string }
  | { state: 'image_unavailable'; reason: 'permission' | 'viewport' | 'network' | 'size' | 'stale' };

export function isImageCaptureArea(value: unknown): value is ImageCaptureArea {
  if (typeof value !== 'object' || value === null) return false;
  const area = value as ImageCaptureArea;
  return [area.left, area.top, area.width, area.height, area.viewportWidth, area.viewportHeight].every(Number.isFinite)
    && area.left >= 0 && area.top >= 0 && area.width > 0 && area.height > 0
    && area.width <= MAX_CAPTCHA_IMAGE_DIMENSION && area.height <= MAX_CAPTCHA_IMAGE_DIMENSION
    && area.width * area.height <= MAX_CAPTCHA_IMAGE_PIXELS
    && area.left + area.width <= area.viewportWidth && area.top + area.height <= area.viewportHeight;
}
