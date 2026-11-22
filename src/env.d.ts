/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Per-request auth lookup cache. Read it via `getCurrentLandlord` in `src/lib/auth`. */
    auth?: Promise<import('./lib/auth').AuthState | null>;
    /** Set by `/phong/[id]` before rewriting to `/404`: the room was rented, so the page says so (410). */
    rentedRoom?: import('./lib/rooms').RentedRoom;
  }
}
