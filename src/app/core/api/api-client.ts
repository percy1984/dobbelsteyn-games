import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Fout uit de API. `code` is een stabiele sleutel die in de gekozen taal vertaald wordt. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Dunne laag boven HttpClient. Het adres van de API wordt runtime afgeleid van het adres waaronder
 * de app draait (`<base href>` + `api/`), zodat er nergens een vast adres of pad in de code staat.
 */
@Service()
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = new URL('api/', inject(DOCUMENT).baseURI).toString();

  get<T>(path: string, token?: string | null, query?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, token, query);
  }

  post<T>(path: string, body?: unknown, token?: string | null): Promise<T> {
    return this.request<T>('POST', path, body ?? {}, token);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    token?: string | null,
    query?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path.replace(/^\//, ''), this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    const headers: Record<string, string> = token ? { 'X-Seat-Token': token } : {};

    try {
      return await firstValueFrom(this.http.request<T>(method, url.toString(), { body, headers }));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const payload = error.error as { error?: string; code?: string } | null;
        throw new ApiError(
          error.status,
          error.status === 0 ? 'network' : (payload?.code ?? 'error'),
          payload?.error ?? error.message,
        );
      }
      throw error;
    }
  }
}
