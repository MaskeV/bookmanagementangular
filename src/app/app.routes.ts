import { Routes } from '@angular/router';
import { AuthPage } from './auth-page/auth-page';
import { BookManager } from './book-manager/book-manager';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: AuthPage, canActivate: [guestGuard] },
  { path: 'books', component: BookManager, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'books' },
  { path: '**', redirectTo: 'books' },
];
