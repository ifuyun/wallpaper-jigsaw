import { Component } from '@angular/core';
import { JigsawComponent } from './components/jigsaw/jigsaw.component';

@Component({
  selector: 'app-root',
  imports: [JigsawComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.less'
})
export class AppComponent {}
