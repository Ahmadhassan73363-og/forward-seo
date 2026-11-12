/*
 * Structured data (schema.org) scan results. Shared by the crawler (server) and the Schema tab (browser),
 * so this file must not import anything server-only.
 */

export type SchemaFormat = 'json-ld' | 'microdata' | 'rdfa';
export type IssueLevel = 'error' | 'warning';

export interface SchemaIssue {
  level: IssueLevel;
  /** Property path inside the item, e.g. "offers[0].price". Empty for the item itself. */
  path: string;
  message: string;
}

/** One top-level entity found on a page (a JSON-LD node, a @graph member, or a microdata/RDFa item). */
export interface SchemaItem {
  format: SchemaFormat;
  /** Main type, e.g. "Product". "Thing" when the item has no type. */
  type: string;
  types: string[];
  /** Types of entities nested inside this item (Offer, AggregateRating, ListItem …). */
  nestedTypes: string[];
  id?: string;
  /** The item's data, shortened for storage when large (long arrays and strings cut). */
  data: any;
  trimmed?: boolean;
  /** Properties present and passing checks. */
  valid: number;
  issues: SchemaIssue[];
  /** Google search features this item can make the page eligible for (only when it has no errors). */
  features: string[];
  /** Plain-language notes, e.g. a Google feature that was retired. */
  notes: string[];
}

export interface InvalidBlock {
  format: SchemaFormat;
  error: string;
  /** First characters of the block, to find it in the theme. */
  snippet: string;
}

export interface PageSchema {
  items: SchemaItem[];
  invalid: InvalidBlock[];
  /** JSON-LD blocks that are not schema.org (other vocabularies) */
  otherVocab?: number;
}

export type ChecklistLevel = 'required' | 'recommended';

export interface ChecklistRule {
  id: string;
  /** Page template: home, product, collection, article, blog, page, other, or "*" for every page */
  template: string;
  /** Satisfied when any of these types is present (top-level or nested). */
  anyOf: string[];
  level: ChecklistLevel;
  why?: string;
  /** Only applies to pages where this crawl signal is set ("hasFaq") */
  when?: 'hasFaq';
  /** Also satisfied by one store-wide declaration on an Organization anywhere on the site */
  siteWide?: boolean;
  custom?: boolean;
}
