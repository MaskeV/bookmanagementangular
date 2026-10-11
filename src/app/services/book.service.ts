import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BOOKS_URL } from '../api.config';
import { Book, BookFilters } from '../models/book';

@Injectable({ providedIn: 'root' })
export class BookService {
  private http = inject(HttpClient);

  getAll(): Observable<Book[]> {
    return this.http.get<Book[]>(BOOKS_URL);
  }

  // Sends the search text and non-empty filters as query params; no params = plain list
  search(query: string, filters: BookFilters): Observable<Book[]> {
    let params = new HttpParams();
    if (query) params = params.set('query', query);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params = params.set(key, value);
    });
    if (params.keys().length === 0) return this.getAll();
    return this.http.get<Book[]>(`${BOOKS_URL}/search`, { params });
  }

  // responseType 'text': the response body is ignored, so it never fails on non-JSON replies
  save(book: Book): Observable<string> {
    return book.id
      ? this.http.put(`${BOOKS_URL}/${book.id}`, book, { responseType: 'text' })
      : this.http.post(BOOKS_URL, book, { responseType: 'text' });
  }

  delete(id: number | string): Observable<string> {
    return this.http.delete(`${BOOKS_URL}/${id}`, { responseType: 'text' });
  }
}
