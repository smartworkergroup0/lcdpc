import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { DatePickerModule } from 'primeng/datepicker';
import { Branch, BranchSchedule, CreateBranchRequest, CreateScheduleRequest, UpdateBranchRequest } from '../../../../core/models/branch.model';
import { BranchApiService } from '../../../../core/services/branch-api.service';

interface DaySchedule {
  label: string;
  enabled: boolean;
  ranges: TimeRange[];
}

interface TimeRange {
  start: Date;
  end: Date;
}

const DAY_LABELS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

@Component({
  selector: 'app-branch-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ButtonModule, CheckboxModule,
    DialogModule, InputTextModule, FloatLabelModule, DatePickerModule,
  ],
  template: `
    <p-dialog [header]="isEditMode ? 'Editar Sede' : 'Nueva Sede'"
              [visible]="visible" (visibleChange)="visibleChange.emit($event)"
              [modal]="true" [dismissableMask]="true" [draggable]="false"
              [style]="{width: 'min(700px, 95vw)'}"
              (onHide)="close()">
      <div class="form-fields" [style]="{paddingTop: '20px'}">
        <div class="field">
          <p-floatlabel>
            <input pInputText id="code" [(ngModel)]="form.code"
                   [disabled]="isEditMode"
                   [class.ng-invalid]="submitted && !form.code" style="width: 100%" placeholder=" " />
            <label for="code">Código *</label>
          </p-floatlabel>
        </div>
        <div class="field">
          <p-floatlabel>
            <input pInputText id="storeName" [(ngModel)]="form.store_name"
                   [class.ng-invalid]="submitted && !form.store_name" style="width: 100%" placeholder=" " />
            <label for="storeName">Nombre de la sede *</label>
          </p-floatlabel>
        </div>
        <div class="field">
          <p-floatlabel>
            <input pInputText id="taxId" [(ngModel)]="form.tax_id"
                   [class.ng-invalid]="submitted && !form.tax_id" style="width: 100%" placeholder=" " />
            <label for="taxId">RUC *</label>
          </p-floatlabel>
        </div>
        <div class="field">
          <p-floatlabel>
            <input pInputText id="address" [(ngModel)]="form.address"
                   [class.ng-invalid]="submitted && !form.address" style="width: 100%" placeholder=" " />
            <label for="address">Direccion *</label>
          </p-floatlabel>
        </div>
        <div class="field">
          <p-floatlabel>
            <input pInputText id="contactPhone" [(ngModel)]="form.contact_phone"
                   [class.ng-invalid]="submitted && !form.contact_phone" style="width: 100%" placeholder=" " />
            <label for="contactPhone">Telefono de contacto *</label>
          </p-floatlabel>
        </div>
        <div class="field">
          <p-floatlabel>
            <input pInputText id="secondaryPhone" [(ngModel)]="form.secondary_contact_phone" style="width: 100%" placeholder=" " />
            <label for="secondaryPhone">Telefono secundario</label>
          </p-floatlabel>
        </div>

        <div class="field">
          <label class="schedule-label">Horario de atencion *</label>
          <div class="schedule-grid">
            @for (day of days; track day.label; let i = $index) {
              <div class="schedule-row" [class.day-disabled]="!day.enabled">
                <p-checkbox [(ngModel)]="day.enabled" [binary]="true" [inputId]="'day-' + i" />
                <span class="day-name" [class.active]="day.enabled">{{ day.label }}</span>
                @if (day.enabled) {
                  <div class="day-ranges">
                    @for (range of day.ranges; track $index; let j = $index) {
                      <div class="range-row">
                        <p-datepicker
                          [(ngModel)]="range.start"
                          [timeOnly]="true" [hourFormat]="'24'"
                          [style]="{'width': '100px'}"
                          placeholder="Inicio" />
                        <span class="range-sep">-</span>
                        <p-datepicker
                          [(ngModel)]="range.end"
                          [timeOnly]="true" [hourFormat]="'24'"
                          [style]="{'width': '100px'}"
                          placeholder="Fin" />
                        @if (day.ranges.length > 1) {
                          <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small"
                                    severity="danger" (onClick)="removeRange(i, j)" />
                        }
                      </div>
                    }
                    <p-button label="+" [text]="true" size="small" (onClick)="addRange(i)" />
                  </div>
                }
              </div>
            }
          </div>
          @if (submitted && !hasAnySchedule()) {
            <small class="p-error">Debe habilitar al menos un dia con horario</small>
          }
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" severity="secondary" (onClick)="close()"></p-button>
        <p-button [label]="isEditMode ? 'Guardar Cambios' : 'Crear Sede'"
                  icon="pi pi-check" [loading]="saving()" (onClick)="save()"></p-button>
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .form-fields { display: flex; flex-direction: column; gap: 1.75rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    .schedule-label { font-weight: 600; color: var(--text-strong); margin-bottom: 0.5rem; }
    .schedule-grid { display: flex; flex-direction: column; gap: 0.5rem; }
    .schedule-row {
      display: flex; align-items: flex-start; gap: 0.75rem;
      padding: 0.5rem 0.75rem; border-radius: 6px;
      border: 1px solid var(--border); transition: opacity 0.2s;
    }
    .schedule-row.day-disabled { opacity: 0.5; }
    .day-name { font-weight: 500; min-width: 80px; padding-top: 4px; }
    .day-name.active { color: var(--text-strong); }
    .day-ranges { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }
    .range-row { display: flex; align-items: center; gap: 0.5rem; }
    .range-sep { color: var(--text-soft); font-weight: 500; }
    .p-error { color: var(--red-500); font-size: 0.8rem; margin-top: 0.25rem; }
  `],
})
export class BranchFormDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() entity: Branch | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly branchApi = inject(BranchApiService);

  protected readonly saving = signal(false);
  protected submitted = false;
  protected form = this.emptyForm();
  protected readonly dayLabels = DAY_LABELS;

  protected days: DaySchedule[] = this.emptyDays();

  get isEditMode(): boolean {
    return this.entity !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.submitted = false;
      if (this.entity) {
        this.populateForm(this.entity);
      } else {
        this.form = this.emptyForm();
        this.days = this.emptyDays();
      }
    }
  }

  protected addRange(dayIndex: number): void {
    const start = new Date(2000, 0, 1, 8, 0);
    const end = new Date(2000, 0, 1, 17, 0);
    this.days[dayIndex].ranges.push({ start, end });
  }

  protected removeRange(dayIndex: number, rangeIndex: number): void {
    this.days[dayIndex].ranges.splice(rangeIndex, 1);
  }

  protected hasAnySchedule(): boolean {
    return this.days.some((d) => d.enabled && d.ranges.length > 0);
  }

  save(): void {
    this.submitted = true;
    if (!this.form.store_name || !this.form.tax_id || !this.form.address || !this.form.contact_phone) return;
    if (!this.isEditMode && !this.form.code) return;
    if (!this.hasAnySchedule()) return;

    const schedules: CreateScheduleRequest[] = [];
    for (let dayIdx = 0; dayIdx < this.days.length; dayIdx++) {
      const day = this.days[dayIdx];
      if (!day.enabled) continue;
      for (const range of day.ranges) {
        schedules.push({
          day_of_week: dayIdx,
          start_time: this.formatTime(range.start),
          end_time: this.formatTime(range.end),
        });
      }
    }

    if (schedules.length === 0) return;

    this.saving.set(true);

    if (this.isEditMode) {
      const req: UpdateBranchRequest = {
        store_name: this.form.store_name,
        tax_id: this.form.tax_id,
        address: this.form.address,
        contact_phone: this.form.contact_phone,
        schedules,
      };
      if (this.form.secondary_contact_phone) {
        req.secondary_contact_phone = this.form.secondary_contact_phone;
      }
      this.branchApi.update(this.entity!.id, req).subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: () => this.saving.set(false),
      });
    } else {
      const req: CreateBranchRequest = {
        code: this.form.code,
        store_name: this.form.store_name,
        tax_id: this.form.tax_id,
        address: this.form.address,
        contact_phone: this.form.contact_phone,
        schedules,
      };
      if (this.form.secondary_contact_phone) {
        req.secondary_contact_phone = this.form.secondary_contact_phone;
      }
      this.branchApi.create(req).subscribe({
        next: () => { this.saving.set(false); this.saved.emit(); },
        error: () => this.saving.set(false),
      });
    }
  }

  close(): void {
    this.closed.emit();
  }

  private populateForm(branch: Branch): void {
    this.form = {
      code: branch.code,
      store_name: branch.storeName,
      tax_id: branch.taxId,
      address: branch.address,
      contact_phone: branch.contactPhone,
      secondary_contact_phone: branch.secondaryContactPhone ?? '',
    };
    this.populateDaysFromSchedules(branch.schedules);
  }

  private populateDaysFromSchedules(schedules: BranchSchedule[]): void {
    this.days = this.emptyDays();
    for (const s of schedules) {
      const day = this.days[s.dayOfWeek];
      day.enabled = true;
      const startParts = s.startTime.substring(0, 5).split(':');
      const endParts = s.endTime.substring(0, 5).split(':');
      const start = new Date(2000, 0, 1, parseInt(startParts[0], 10), parseInt(startParts[1], 10));
      const end = new Date(2000, 0, 1, parseInt(endParts[0], 10), parseInt(endParts[1], 10));
      day.ranges.push({ start, end });
    }
  }

  private formatTime(d: Date): string {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private emptyForm() {
    return {
      code: '',
      store_name: '',
      tax_id: '',
      address: '',
      contact_phone: '',
      secondary_contact_phone: '',
    };
  }

  private emptyDays(): DaySchedule[] {
    return DAY_LABELS.map((label) => ({
      label,
      enabled: false,
      ranges: [{ start: new Date(2000, 0, 1, 8, 0), end: new Date(2000, 0, 1, 17, 0) }],
    }));
  }
}
