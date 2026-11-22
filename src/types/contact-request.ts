export const CONTACT_REQUEST_STATUSES = ['new', 'contacted', 'closed'] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];

export interface ContactRequest {
  id: string;
  roomId: string;
  renterName: string;
  renterPhone: string;
  message: string;
  preferredViewingTime?: string;
  status: ContactRequestStatus;
  createdAt: Date;
}
