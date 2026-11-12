import type { GscCredentials } from './config';
import { googleBase, googleRequest, googleToken, SCOPES, type GoogleResult } from '../google/client';

/*
 * Search Console endpoints, on top of the shared Google sign-in.
 *   Search Console API: https://www.googleapis.com/webmasters/v3/…
 *   URL Inspection API: https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
 */

export type GscResult<T = any> = GoogleResult<T>;

export const accessToken = (c: GscCredentials) => googleToken(c, SCOPES.searchConsole);
export const gscRequest = <T = any>(url: string, token: string, body?: unknown) => googleRequest<T>(url, token, body, 'Google Search Console API');

export const WEBMASTERS = () => `${googleBase('www.googleapis.com')}/webmasters/v3`;
export const INSPECT_URL = () => `${googleBase('searchconsole.googleapis.com')}/v1/urlInspection/index:inspect`;

export { toNum as num } from '../http';
