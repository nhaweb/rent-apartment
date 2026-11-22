export interface Landlord {
  id: string;
  name: string;
  phone: string;
  zalo?: string;
  /**
   * When the landlord opted in to show "Nhắn Zalo" on their room pages; absent
   * = not shown. The number itself is never rendered (`/phong/[id]/zalo`).
   */
  zaloPublicAt?: Date;
  email: string;
}
