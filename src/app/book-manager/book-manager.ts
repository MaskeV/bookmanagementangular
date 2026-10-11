import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { Book, BookFilters } from '../models/book';
import { AuthService } from '../services/auth.service';
import { BookService } from '../services/book.service';

interface FormField {
  name: 'title' | 'author' | 'category' | 'publisher' | 'publicationYear' | 'language' | 'quantity' | 'description';
  label: string;
  type?: 'number';
  wide?: boolean;
}

const emptyFilters: BookFilters = { category: '', language: '', publisher: '', available: '' };
const emptyForm = (): Book => ({ available: true });

// Keyword fields match the exact value, so we compare exact (case-insensitive) values
const applyFilters = (list: Book[], f: BookFilters): Book[] =>
  list.filter(
    (b) =>
      (!f.category || b.category?.toLowerCase() === f.category.toLowerCase()) &&
      (!f.language || b.language?.toLowerCase() === f.language.toLowerCase()) &&
      (!f.publisher || b.publisher?.toLowerCase() === f.publisher.toLowerCase()) &&
      (!f.available || String(!!b.available) === f.available)
  );

// unique, sorted values of one field (for the dropdowns)
const uniqueValues = (list: Book[], field: 'category' | 'language' | 'publisher'): string[] =>
  [...new Set(list.map((b) => b[field]).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));

@Component({
  selector: 'app-book-manager',
  imports: [FormsModule],
  templateUrl: './book-manager.html',
  styleUrl: './book-manager.css',
})
export class BookManager implements OnInit {
  private auth = inject(AuthService);
  private bookService = inject(BookService);

  readonly fields: FormField[] = [
    { name: 'title', label: 'Title' },
    { name: 'author', label: 'Author' },
    { name: 'category', label: 'Category' },
    { name: 'publisher', label: 'Publisher' },
    { name: 'publicationYear', label: 'Year', type: 'number' },
    { name: 'language', label: 'Language' },
    { name: 'quantity', label: 'Quantity', type: 'number' },
    { name: 'description', label: 'Description', wide: true },
  ];

  user = this.auth.session;
  // normal users (role USER) can only view and search; ADMIN can add, edit and delete
  canEdit = computed(() => this.user()?.role === 'ADMIN');

  books = signal<Book[]>([]);
  allBooks = signal<Book[]>([]); // used only to build the dropdown options
  form = signal<Book>(emptyForm());
  search = signal('');
  filters = signal<BookFilters>({ ...emptyFilters });
  suggestions = signal<string[]>([]);
  showSuggestions = signal(false);
  activeIndex = signal(-1);

  categories = computed(() => uniqueValues(this.allBooks(), 'category'));
  languages = computed(() => uniqueValues(this.allBooks(), 'language'));
  publishers = computed(() => uniqueValues(this.allBooks(), 'publisher'));
  hasFilters = computed(() => Object.values(this.filters()).some(Boolean));

  private searchBox = viewChild<ElementRef<HTMLElement>>('searchBox');
  private typing$ = new Subject<string>();
  private listSub?: Subscription;

  constructor() {
    // Search suggestions (like Amazon): wait 250ms after typing, ask the backend,
    // keep a short list of unique titles / authors. switchMap drops stale requests.
    this.typing$
      .pipe(
        debounceTime(250),
        switchMap((text) => {
          const t = text.trim();
          if (!t) return of<string[]>([]);
          return this.bookService.search(t, emptyFilters).pipe(
            map((data) => {
              const lower = t.toLowerCase();
              const unique = new Set<string>();
              data.forEach((b) =>
                [b.title, b.author].forEach((v) => {
                  if (v && v.toLowerCase().includes(lower)) unique.add(v);
                })
              );
              return [...unique].slice(0, 8);
            }),
            catchError(() => of<string[]>([]))
          );
        }),
        takeUntilDestroyed()
      )
      .subscribe((list) => {
        this.suggestions.set(list);
        this.activeIndex.set(-1);
      });
  }

  ngOnInit() {
    this.loadBooks('', emptyFilters);
    this.loadAllBooks();
  }

  // ---------- API calls ----------
  // Filters go to the backend as query params and are also applied here,
  // so the table is correct even if the backend ignores a param.
  loadBooks(query: string, f: BookFilters) {
    this.listSub?.unsubscribe(); // ignore an older, slower response
    this.listSub = this.bookService.search(query, f).subscribe({
      next: (list) => this.books.set(applyFilters(list, f)),
      error: () => {},
    });
  }

  loadAllBooks() {
    this.bookService.getAll().subscribe({
      next: (list) => this.allBooks.set(list),
      error: () => {},
    });
  }

  refresh() {
    this.loadBooks(this.search(), this.filters());
    this.loadAllBooks();
  }

  changeFilter(name: keyof BookFilters, value: string) {
    const next = { ...this.filters(), [name]: value };
    this.filters.set(next);
    this.loadBooks(this.search(), next);
  }

  clearFilters() {
    this.filters.set({ ...emptyFilters });
    this.loadBooks(this.search(), emptyFilters);
  }

  saveBook() {
    this.bookService.save(this.form()).subscribe({
      next: () => {
        this.form.set(emptyForm());
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) return; // interceptor already logged the user out
        alert(err.status === 403 ? "You don't have permission to do this." : 'Could not save the book.');
      },
    });
  }

  deleteBook(id: number | string | undefined) {
    if (id === undefined || !window.confirm('Delete this book?')) return;
    this.bookService.delete(id).subscribe({
      next: () => this.refresh(),
      error: (err: HttpErrorResponse) => {
        if (err.status === 401) return;
        alert(err.status === 403 ? "You don't have permission to do this." : 'Could not delete the book.');
      },
    });
  }

  editBook(book: Book) {
    this.form.set({ ...book });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  logout() {
    this.auth.logout();
  }

  // ---------- Search + suggestions ----------
  onSearchInput(text: string) {
    this.search.set(text);
    this.showSuggestions.set(true);
    this.typing$.next(text);
  }

  runSearch(text: string) {
    this.search.set(text);
    this.showSuggestions.set(false);
    this.typing$.next(text);
    this.loadBooks(text, this.filters());
  }

  clearSearch() {
    this.search.set('');
    this.suggestions.set([]);
    this.loadBooks('', this.filters());
  }

  onSearchKeys(e: KeyboardEvent) {
    const n = this.suggestions().length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.showSuggestions.set(true);
      if (n) this.activeIndex.update((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) this.activeIndex.update((i) => (i <= 0 ? n - 1 : i - 1));
    } else if (e.key === 'Enter' && this.activeIndex() >= 0) {
      e.preventDefault();
      this.runSearch(this.suggestions()[this.activeIndex()]);
    } else if (e.key === 'Escape') {
      this.showSuggestions.set(false);
    }
  }

  // typed part stays normal, the rest of the suggestion is bold
  suggestionParts(text: string) {
    const q = this.search().trim();
    const start = text.toLowerCase().indexOf(q.toLowerCase());
    if (start === -1) return { before: text, match: '', after: '' };
    const end = start + q.length;
    return { before: text.slice(0, start), match: text.slice(start, end), after: text.slice(end) };
  }

  // close the dropdown when clicking outside the search box
  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(e: MouseEvent) {
    const box = this.searchBox()?.nativeElement;
    if (box && !box.contains(e.target as Node)) this.showSuggestions.set(false);
  }

  // ---------- Form ----------
  handleChange(field: FormField, value: string | number | null) {
    const v = field.type === 'number' && value !== '' && value !== null ? Number(value) : (value ?? '');
    this.form.update((f) => ({ ...f, [field.name]: v }));
  }

  setAvailable(checked: boolean) {
    this.form.update((f) => ({ ...f, available: checked }));
  }

  cancelEdit() {
    this.form.set(emptyForm());
  }
}
