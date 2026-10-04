import { API_URL } from '../api';

/** Lokale Upload-Adressen (`/uploads/…`) liegen auf der API, nicht auf dem Dashboard – externe https-Adressen bleiben unverändert. */
export const assetUrl = (url: string): string =>
  url.startsWith('/uploads/') ? `${API_URL}${url}` : url;
