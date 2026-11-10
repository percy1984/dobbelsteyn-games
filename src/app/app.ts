import { Component } from '@angular/core';
import { Shell } from './features/shell/shell';

@Component({
  imports: [Shell],
  selector: 'dg-root',
  templateUrl: './app.html',
})
export class App {}
