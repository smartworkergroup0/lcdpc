export interface AppUser {
  id: string;
  email: string;
  personId: string | null;
  name: string | null;
  identityDocument: string | null;
  whatsappPhone: string | null;
  fullAddress: string | null;
  isClient: boolean | null;
  status: string;
  createdAtUtc: string;
}
