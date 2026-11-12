/** A SERP data provider (DataForSEO today; SerpApi or others can be added as another provider). */
export interface SerpProvider {
  id: 'dataforseo';
  configured(): boolean;
  search(q: { keyword: string; locationCode: number; languageCode: string; device: 'desktop' | 'mobile' }): Promise<SerpResult>;
}

export type SerpResult =
  | {
      ok: true;
      hasAio: boolean;
      references: Array<{ url: string; domain: string; title?: string; source?: string }>;
      organic: Array<{ position?: number; url: string; domain: string }>;
    }
  | { ok: false; message: string; keyRejected?: boolean };
