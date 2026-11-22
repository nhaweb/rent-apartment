/**
 * Licence credits for the stand-in photographs bundled under `src/assets/`
 * (site hero, and the mock room photos the seed uploads to the test bucket).
 * Room photos themselves live in object storage: see `photo-urls.ts`.
 */
import { MOCK_PHOTO_CREDITS, type PhotoCredit } from './mock/photo-credits';

export function getPhotoCredits(): PhotoCredit[] {
  return MOCK_PHOTO_CREDITS;
}

export type { PhotoCredit };
