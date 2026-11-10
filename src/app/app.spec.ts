import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { I18n } from './core/i18n/i18n';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('wisselt de taal van de hele pagina zonder herladen', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(I18n).setLang('nl');
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Kaart- en bordspellen');

    const en = el.querySelector<HTMLButtonElement>('button[lang="en"]');
    en?.click();
    await fixture.whenStable();

    expect(el.textContent).toContain('Card and board games');
    expect(en?.getAttribute('aria-pressed')).toBe('true');
  });

  it('heeft een home-knop die naar de platformroot wijst', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const home = (fixture.nativeElement as HTMLElement).querySelector('a.bar__home');
    expect(home?.getAttribute('href')).toBe('/');
  });
});
