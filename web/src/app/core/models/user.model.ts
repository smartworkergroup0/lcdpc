export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  status: string;
  createdAtUtc: string;
}
