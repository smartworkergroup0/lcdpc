export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  whatsappPhone: string | null;
  fullAddress: string | null;
  isClient: boolean | null;
  status: string;
  createdAtUtc: string;
}
