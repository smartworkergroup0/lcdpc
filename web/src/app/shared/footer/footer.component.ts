import { Component, OnInit, inject, signal } from '@angular/core';
import { SystemConfigStore } from '../../core/stores/system-config.store';
import { BranchApiService } from '../../core/services/branch-api.service';
import { Branch } from '../../core/models/branch.model';

@Component({
  selector: 'app-footer',
  standalone: true,
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent implements OnInit {
  protected readonly config = inject(SystemConfigStore);
  private readonly branchApi = inject(BranchApiService);

  protected readonly branches = signal<Branch[]>([]);

  ngOnInit(): void {
    this.branchApi.list().subscribe({
      next: (branches) => this.branches.set(branches),
    });
  }

  protected onLogoError(event: Event): void {
    (event.target as HTMLImageElement).src = '/not-found.png';
  }
}
