import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { XYFlowModule } from 'ngx-xyflow';
import { Connection, NodeChange, EdgeChange } from '@xyflow/react';
import * as dagre from 'dagre';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToolbarModule } from 'primeng/toolbar';
import { DrawerModule } from 'primeng/drawer';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthStore } from '../../../core/auth/auth.store';
import { WorkflowApiService } from '../../../core/services/workflow-api.service';
import { RbacApiService } from '../../../core/services/rbac-api.service';
import {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  WorkflowNodeData,
  WorkflowEdgeData,
  WorkflowMetadata,
  TransitionCondition,
  TransitionAction,
  OrderStatus,
  OrderTransition,
} from '../../../core/models/workflow.model';

interface StatusOption {
  label: string;
  value: string;
  color: string;
}

interface RoleOption {
  label: string;
  value: string;
}

interface ValidationError {
  field: string;
  message: string;
}

interface HistoryState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

@Component({
  selector: 'app-workflow-editor-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    XYFlowModule,
    ButtonModule,
    TagModule,
    ToolbarModule,
    DrawerModule,
    DialogModule,
    InputTextModule,
    FloatLabelModule,
    SelectModule,
    CheckboxModule,
    ToastModule,
    ConfirmDialogModule,
    MultiSelectModule,
    TableModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './workflow-editor-page.component.html',
  styleUrl: './workflow-editor-page.component.scss',
})
export class WorkflowEditorPageComponent implements OnInit {
  private readonly authStore = inject(AuthStore);
  private readonly workflowApi = inject(WorkflowApiService);
  private readonly rbacApi = inject(RbacApiService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  protected readonly nodes = signal<WorkflowNode[]>([]);
  protected readonly edges = signal<WorkflowEdge[]>([]);

  protected readonly selectedNode = signal<WorkflowNode | null>(null);
  protected readonly selectedEdge = signal<WorkflowEdge | null>(null);
  protected readonly showNodePanel = signal(false);
  protected readonly showEdgePanel = signal(false);

  protected readonly orderStatuses = signal<OrderStatus[]>([]);
  protected readonly orderTransitions = signal<OrderTransition[]>([]);
  protected readonly loading = signal(false);

  protected readonly roleOptions = signal<RoleOption[]>([]);

  protected readonly canCreate = computed(() =>
    this.authStore.hasPermission('order:view')
  );

  protected readonly workflowId = signal<string | null>(null);
  protected readonly workflowName = signal('Flujo de Órdenes');
  protected readonly workflowDescription = signal('');
  protected selectedStatusToAdd: string | undefined = undefined;

  protected readonly showLoadDialog = signal(false);
  protected readonly savedWorkflows = signal<Workflow[]>([]);
  protected readonly loadingWorkflows = signal(false);

  // Undo/Redo
  private history: HistoryState[] = [];
  private historyIndex = -1;
  private maxHistory = 50;

  protected readonly canUndo = computed(() => this.historyIndex > 0);
  protected readonly canRedo = computed(() => this.historyIndex < this.history.length - 1);

  protected readonly availableStatuses = computed<StatusOption[]>(() => {
    const usedCodes = new Set(this.nodes().map((n) => n.data.code));
    return this.orderStatuses()
      .filter((s) => !usedCodes.has(s.code))
      .map((s) => ({
        label: s.label,
        value: s.code,
        color: s.color || '#6366f1',
      }));
  });

  protected readonly defaultEdgeOptions = {
    type: 'smoothstep',
    animated: false,
    style: { strokeWidth: 2, stroke: '#94a3b8' },
    labelStyle: { fill: '#2f2f2f', fontWeight: 600, fontSize: 12 },
    labelBgStyle: { fill: '#fffdf3', fillOpacity: 0.9, rx: 4 },
    labelBgPadding: [6, 4] as [number, number],
  };

  protected readonly triggerTypeOptions = [
    { label: 'Manual', value: 'manual' },
    { label: 'Automático', value: 'automatic' },
    { label: 'Webhook', value: 'webhook' },
  ];

  protected readonly conditionOperators = [
    { label: 'Igual a', value: 'equals' },
    { label: 'No igual a', value: 'not_equals' },
    { label: 'Mayor que', value: 'greater_than' },
    { label: 'Menor que', value: 'less_than' },
    { label: 'Contiene', value: 'contains' },
    { label: 'Está vacío', value: 'is_empty' },
    { label: 'No está vacío', value: 'is_not_empty' },
  ];

  protected readonly actionTypes = [
    { label: 'Enviar email', value: 'send_email' },
    { label: 'Webhook', value: 'webhook' },
    { label: 'Actualizar campo', value: 'update_field' },
  ];

  ngOnInit(): void {
    this.loadOrderData();
    this.loadRoles();
  }

  private loadRoles(): void {
    this.rbacApi.listRoles().subscribe({
      next: (roles) => {
        this.roleOptions.set(
          roles.map((r) => ({ label: r.name || r.code, value: r.code }))
        );
      },
    });
  }

  private loadOrderData(): void {
    this.loading.set(true);

    this.workflowApi.getOrderStatuses().subscribe({
      next: (statuses) => {
        this.orderStatuses.set(statuses);
        this.initNodesFromStatuses(statuses);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los estatus de órdenes',
        });
      },
    });

    this.workflowApi.getOrderTransitions().subscribe({
      next: (transitions) => {
        this.orderTransitions.set(transitions);
        this.initEdgesFromTransitions(transitions);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private initNodesFromStatuses(statuses: OrderStatus[]): void {
    const cols = 4;
    const spacingX = 280;
    const spacingY = 160;
    const startX = 80;
    const startY = 80;

    const wfNodes: WorkflowNode[] = statuses.map((s, i) => ({
      id: `node_${s.code}`,
      type: 'status',
      position: {
        x: startX + (i % cols) * spacingX,
        y: startY + Math.floor(i / cols) * spacingY,
      },
      data: {
        label: s.label,
        code: s.code,
        isInitial: s.isInitial,
        isFinal: s.isFinal,
        color: s.color || '#6366f1',
        description: s.description,
      },
    }));

    this.nodes.set(wfNodes);
  }

  private initEdgesFromTransitions(transitions: OrderTransition[]): void {
    const wfEdges: WorkflowEdge[] = transitions.map((t) => ({
      id: `edge_${t.code}`,
      source: `node_${t.sourceStatusCode}`,
      target: `node_${t.targetStatusCode}`,
      label: t.label,
      data: {
        label: t.label,
        code: t.code,
        rules: {
          triggerType: t.triggerType as 'manual' | 'automatic' | 'webhook',
          requiredRoles: t.requiredRoles,
          conditions: t.conditions,
        },
        actions: t.actions,
      },
    }));

    this.edges.set(wfEdges);
  }

  // ── Serialization ──────────────────────────────────────

  protected serialize(): {
    definition: {
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      metadata: WorkflowMetadata;
    };
  } {
    const now = new Date().toISOString();
    return {
      definition: {
        nodes: this.nodes(),
        edges: this.edges(),
        metadata: {
          viewport: { x: 0, y: 0, zoom: 1 },
          createdAt: now,
          updatedAt: now,
        },
      },
    };
  }

  // ── Validations ────────────────────────────────────────

  private validate(): ValidationError[] {
    const errors: ValidationError[] = [];
    const currentNodes = this.nodes();
    const currentEdges = this.edges();

    if (currentNodes.length === 0) {
      errors.push({ field: 'nodes', message: 'Debe haber al menos un nodo' });
    }

    const nodesWithoutCode = currentNodes.filter((n) => !n.data.code?.trim());
    if (nodesWithoutCode.length > 0) {
      errors.push({
        field: 'code',
        message: `${nodesWithoutCode.length} nodo(s) sin código: ${nodesWithoutCode.map((n) => n.data.label).join(', ')}`,
      });
    }

    const initialNodes = currentNodes.filter((n) => n.data.isInitial);
    if (initialNodes.length === 0) {
      errors.push({ field: 'isInitial', message: 'Debe haber al menos un nodo inicial' });
    } else if (initialNodes.length > 1) {
      errors.push({
        field: 'isInitial',
        message: `Hay ${initialNodes.length} nodos iniciales; solo debe haber uno: ${initialNodes.map((n) => n.data.label).join(', ')}`,
      });
    }

    const finalNodes = currentNodes.filter((n) => n.data.isFinal);
    if (finalNodes.length === 0) {
      errors.push({ field: 'isFinal', message: 'Debe haber al menos un nodo final' });
    }

    const nodeIds = new Set(currentNodes.map((n) => n.id));
    const orphanEdges = currentEdges.filter(
      (e) => !nodeIds.has(e.source) || !nodeIds.has(e.target)
    );
    if (orphanEdges.length > 0) {
      errors.push({
        field: 'edges',
        message: `${orphanEdges.length} transición(es) con origen o destino inválido`,
      });
    }

    return errors;
  }

  // ── Load / Save ────────────────────────────────────────

  protected newWorkflow(): void {
    this.workflowId.set(null);
    this.workflowName.set('Flujo de Órdenes');
    this.workflowDescription.set('');
    this.closeNodePanel();
    this.closeEdgePanel();
    this.loadOrderData();
  }

  protected openLoadDialog(): void {
    this.showLoadDialog.set(true);
    this.loadingWorkflows.set(true);

    this.workflowApi.list({ entity_type: 'order' }).subscribe({
      next: (res) => {
        this.savedWorkflows.set(res.items);
        this.loadingWorkflows.set(false);
      },
      error: () => {
        this.loadingWorkflows.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los flujos',
        });
      },
    });
  }

  protected loadWorkflow(workflow: Workflow): void {
    this.workflowId.set(workflow.id);
    this.workflowName.set(workflow.name);
    this.workflowDescription.set(workflow.description);
    this.nodes.set(workflow.nodes);
    this.edges.set(workflow.edges);
    this.showLoadDialog.set(false);
    this.closeNodePanel();
    this.closeEdgePanel();

    this.messageService.add({
      severity: 'success',
      summary: 'Cargado',
      detail: `Flujo "${workflow.name}" cargado correctamente`,
    });
  }

  protected deleteWorkflow(workflow: Workflow): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el flujo "${workflow.name}"? Esta acción no se puede deshacer.`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.workflowApi.delete(workflow.id).subscribe({
          next: () => {
            this.savedWorkflows.update((list) =>
              list.filter((w) => w.id !== workflow.id)
            );
            if (this.workflowId() === workflow.id) {
              this.newWorkflow();
            }
            this.messageService.add({
              severity: 'success',
              summary: 'Eliminado',
              detail: `Flujo "${workflow.name}" eliminado`,
            });
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'No se pudo eliminar el flujo',
            });
          },
        });
      },
    });
  }

  protected saveWorkflow(): void {
    const errors = this.validate();
    if (errors.length > 0) {
      const errorList = errors.map((e) => `• ${e.message}`).join('<br/>');
      this.messageService.add({
        severity: 'warn',
        summary: 'Validación fallida',
        detail: errorList,
        life: 6000,
      });
      return;
    }

    this.loading.set(true);
    const { definition } = this.serialize();

    const id = this.workflowId();
    const request$ = id
      ? this.workflowApi.update(id, {
          name: this.workflowName(),
          description: this.workflowDescription(),
          definition,
        })
      : this.workflowApi.create({
          name: this.workflowName(),
          description: this.workflowDescription(),
          entity_type: 'order',
          definition,
        });

    request$.subscribe({
      next: (workflow) => {
        this.workflowId.set(workflow.id);
        this.loading.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Flujo guardado correctamente',
        });
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo guardar el flujo',
        });
      },
    });
  }

  // ── xyflow events ──────────────────────────────────────

  protected onNodesChange(changes: NodeChange[]): void {
    this.nodes.update((current) => {
      let updated = [...current];
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          updated = updated.map((n) =>
            n.id === change.id
              ? { ...n, position: change.position! }
              : n
          );
        }
        if (change.type === 'remove') {
          updated = updated.filter((n) => n.id !== change.id);
        }
      }
      return updated;
    });
  }

  protected onEdgesChange(changes: EdgeChange[]): void {
    this.edges.update((current) => {
      let updated = [...current];
      for (const change of changes) {
        if (change.type === 'remove') {
          updated = updated.filter((e) => e.id !== change.id);
        }
      }
      return updated;
    });
  }

  protected onConnect(connection: Connection): void {
    const newEdge: WorkflowEdge = {
      id: `edge_${connection.source}_to_${connection.target}`,
      source: connection.source as string,
      target: connection.target as string,
      label: 'Nueva transición',
      data: {
        label: 'Nueva transición',
        code: `${connection.source}_to_${connection.target}`,
        rules: {
          triggerType: 'manual',
          requiredRoles: [],
          conditions: [],
        },
        actions: [],
      },
    };
    this.edges.update((current) => [...current, newEdge]);
  }

  protected onNodeClick(event: { node: any }): void {
    const node = this.nodes().find((n) => n.id === event.node.id) ?? null;
    this.selectedNode.set(node);
    this.selectedEdge.set(null);
    this.showNodePanel.set(true);
    this.showEdgePanel.set(false);
  }

  protected onEdgeClick(event: { edge: any }): void {
    const edge = this.edges().find((e) => e.id === event.edge.id) ?? null;
    this.selectedEdge.set(edge);
    this.selectedNode.set(null);
    this.showEdgePanel.set(true);
    this.showNodePanel.set(false);
  }

  protected onPaneClick(): void {
    this.selectedNode.set(null);
    this.selectedEdge.set(null);
    this.showNodePanel.set(false);
    this.showEdgePanel.set(false);
  }

  protected closeNodePanel(): void {
    this.showNodePanel.set(false);
    this.selectedNode.set(null);
  }

  protected closeEdgePanel(): void {
    this.showEdgePanel.set(false);
    this.selectedEdge.set(null);
  }

  protected updateNodeData(field: keyof WorkflowNodeData, value: any): void {
    const node = this.selectedNode();
    if (!node) return;
    this.nodes.update((current) =>
      current.map((n) =>
        n.id === node.id ? { ...n, data: { ...n.data, [field]: value } } : n
      )
    );
    this.selectedNode.set({ ...node, data: { ...node.data, [field]: value } });
  }

  protected updateEdgeData(field: keyof WorkflowEdgeData, value: any): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updated = { ...edge, data: { ...edge.data, [field]: value } };
    if (field === 'label') {
      (updated as any).label = value;
    }
    this.edges.update((current) =>
      current.map((e) => (e.id === edge.id ? updated : e))
    );
    this.selectedEdge.set(updated);
  }

  protected onTriggerTypeChange(triggerType: string): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updatedRules = { ...edge.data.rules, triggerType: triggerType as 'manual' | 'automatic' | 'webhook' };
    this.updateEdgeData('rules', updatedRules);
  }

  protected onRequiredRolesChange(roles: string[]): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updatedRules = { ...edge.data.rules, requiredRoles: roles };
    this.updateEdgeData('rules', updatedRules);
  }

  // ── Conditions ─────────────────────────────────────────

  protected addCondition(): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const newCondition: TransitionCondition = { field: '', operator: 'equals', value: '' };
    const updatedConditions = [...edge.data.rules.conditions, newCondition];
    const updatedRules = { ...edge.data.rules, conditions: updatedConditions };
    this.updateEdgeData('rules', updatedRules);
  }

  protected removeCondition(index: number): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updatedConditions = edge.data.rules.conditions.filter((_, i) => i !== index);
    const updatedRules = { ...edge.data.rules, conditions: updatedConditions };
    this.updateEdgeData('rules', updatedRules);
  }

  protected updateConditionField(index: number, field: keyof TransitionCondition, value: string): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updatedConditions = edge.data.rules.conditions.map((c, i) =>
      i === index ? { ...c, [field]: value } : c
    );
    const updatedRules = { ...edge.data.rules, conditions: updatedConditions };
    this.updateEdgeData('rules', updatedRules);
  }

  // ── Actions ────────────────────────────────────────────

  protected addAction(): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const newAction: TransitionAction = { type: 'send_email' };
    const updatedActions = [...edge.data.actions, newAction];
    this.updateEdgeData('actions', updatedActions);
  }

  protected removeAction(index: number): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updatedActions = edge.data.actions.filter((_, i) => i !== index);
    this.updateEdgeData('actions', updatedActions);
  }

  protected updateActionType(index: number, type: string): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updatedActions = edge.data.actions.map((a, i) =>
      i === index ? { ...a, type } : a
    );
    this.updateEdgeData('actions', updatedActions);
  }

  protected updateActionField(index: number, field: 'templateId' | 'url', value: string): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updatedActions = edge.data.actions.map((a, i) =>
      i === index ? { ...a, [field]: value } : a
    );
    this.updateEdgeData('actions', updatedActions);
  }

  // ── Node / Edge management ─────────────────────────────

  protected addNewNode(statusCode?: string): void {
    const code = statusCode ?? this.availableStatuses()[0]?.value;
    if (!code) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Aviso',
        detail: 'Todos los estatus ya están en el canvas',
      });
      return;
    }

    const status = this.orderStatuses().find((s) => s.code === code);
    if (!status) return;

    const newNode: WorkflowNode = {
      id: `node_${status.code}`,
      type: 'status',
      position: { x: 100 + this.nodes().length * 40, y: 100 + this.nodes().length * 40 },
      data: {
        label: status.label,
        code: status.code,
        isInitial: status.isInitial,
        isFinal: status.isFinal,
        color: status.color || '#6366f1',
        description: status.description,
      },
    };
    this.nodes.update((current) => [...current, newNode]);
    this.selectedStatusToAdd = undefined;
  }

  protected confirmDeleteNode(): void {
    const node = this.selectedNode();
    if (!node) return;

    this.confirmationService.confirm({
      message: `¿Eliminar el estatus "${node.data.label}"? Las transiciones conectadas también se eliminarán.`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.nodes.update((current) => current.filter((n) => n.id !== node.id));
        this.edges.update((current) =>
          current.filter((e) => e.source !== node.id && e.target !== node.id)
        );
        this.closeNodePanel();
        this.messageService.add({
          severity: 'success',
          summary: 'Eliminado',
          detail: `Estatus "${node.data.label}" eliminado`,
        });
      },
    });
  }

  protected confirmDeleteEdge(): void {
    const edge = this.selectedEdge();
    if (!edge) return;

    this.confirmationService.confirm({
      message: `¿Eliminar la transición "${edge.data.label}"?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.edges.update((current) => current.filter((e) => e.id !== edge.id));
        this.closeEdgePanel();
        this.messageService.add({
          severity: 'success',
          summary: 'Eliminado',
          detail: `Transición "${edge.data.label}" eliminada`,
        });
      },
    });
  }

  protected getSourceLabel(sourceId: string): string {
    const node = this.nodes().find((n) => n.id === sourceId);
    return node?.data.label ?? sourceId;
  }

  protected getTargetLabel(targetId: string): string {
    const node = this.nodes().find((n) => n.id === targetId);
    return node?.data.label ?? targetId;
  }

  // ── Auto-layout with dagre ─────────────────────────────

  protected autoLayout(): void {
    const currentNodes = this.nodes();
    const currentEdges = this.edges();

    if (currentNodes.length === 0) return;

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120 });

    for (const node of currentNodes) {
      g.setNode(node.id, { width: 200, height: 80 });
    }

    for (const edge of currentEdges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    const layoutNodes = currentNodes.map((node) => {
      const pos = g.node(node.id);
      return {
        ...node,
        position: { x: pos.x - 100, y: pos.y - 40 },
      };
    });

    this.pushHistory();
    this.nodes.set(layoutNodes);

    this.messageService.add({
      severity: 'success',
      summary: 'Auto-layout',
      detail: 'Nodos organizados automáticamente',
    });
  }

  // ── Undo / Redo ────────────────────────────────────────

  private pushHistory(): void {
    const state: HistoryState = {
      nodes: [...this.nodes()],
      edges: [...this.edges()],
    };

    // Remove future states if we're not at the end
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(state);

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this.historyIndex = this.history.length - 1;
  }

  protected undo(): void {
    if (!this.canUndo()) return;
    this.historyIndex--;
    const state = this.history[this.historyIndex];
    this.nodes.set([...state.nodes]);
    this.edges.set([...state.edges]);
  }

  protected redo(): void {
    if (!this.canRedo()) return;
    this.historyIndex++;
    const state = this.history[this.historyIndex];
    this.nodes.set([...state.nodes]);
    this.edges.set([...state.edges]);
  }

  // ── Export / Import JSON ───────────────────────────────

  protected exportJson(): void {
    const { definition } = this.serialize();
    const json = JSON.stringify({
      name: this.workflowName(),
      description: this.workflowDescription(),
      entity_type: 'order',
      definition,
    }, null, 2);

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${this.workflowName().replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.messageService.add({
      severity: 'success',
      summary: 'Exportado',
      detail: 'Flujo exportado como JSON',
    });
  }

  protected importJson(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);

          if (data.definition?.nodes && data.definition?.edges) {
            this.pushHistory();
            this.nodes.set(data.definition.nodes);
            this.edges.set(data.definition.edges);

            if (data.name) this.workflowName.set(data.name);
            if (data.description) this.workflowDescription.set(data.description);

            this.workflowId.set(null);

            this.messageService.add({
              severity: 'success',
              summary: 'Importado',
              detail: 'Flujo importado correctamente',
            });
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'El archivo JSON no tiene el formato correcto',
            });
          }
        } catch {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudo leer el archivo JSON',
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
}
