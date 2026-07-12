import {
  Component,
  computed,
  inject,
  Injector,
  OnInit,
  signal,
  ViewChild,
  TemplateRef,
  AfterViewInit,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Graph, Shape, Node, Edge } from '@antv/x6';
import { register } from '@antv/x6-angular-shape';
import { MiniMap } from '@antv/x6-plugin-minimap';
import { History } from '@antv/x6-plugin-history';
import { Selection } from '@antv/x6-plugin-selection';
import { Snapline } from '@antv/x6-plugin-snapline';
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
export class WorkflowEditorPageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('statusNodeTemplate', { static: true }) statusNodeTemplate!: TemplateRef<any>;
  @ViewChild('graphContainer', { static: true }) graphContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('minimapContainer', { static: true }) minimapContainer!: ElementRef<HTMLDivElement>;

  private readonly authStore = inject(AuthStore);
  private readonly workflowApi = inject(WorkflowApiService);
  private readonly rbacApi = inject(RbacApiService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly injector = inject(Injector);

  private graph!: Graph;

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

  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);

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

  ngAfterViewInit(): void {
    this.initGraph();
  }

  ngOnDestroy(): void {
    this.graph?.dispose();
  }

  private initGraph(): void {
    // Register Angular component node
    register({
      shape: 'status-node',
      width: 120,
      height: 44,
      content: this.statusNodeTemplate,
      injector: this.injector,
    });

    this.graph = new Graph({
      container: this.graphContainer.nativeElement,
      autoResize: true,
      background: { color: '#f8f9fa' },
      grid: { visible: true, size: 16, type: 'dot', args: { color: '#e2e8f0', thickness: 1 } },
      panning: { enabled: true, modifiers: [] },
      mousewheel: { enabled: true, modifiers: [], factor: 1.05, maxScale: 3, minScale: 0.3 },
      connecting: {
        snap: true,
        allowBlank: false,
        allowMulti: true,
        allowLoop: false,
        highlight: true,
        anchor: 'center',
        connectionPoint: 'anchor',
        router: 'manhattan',
        connector: 'rounded',
      },
    });

    // Plugins
    this.graph.use(new MiniMap({ container: this.minimapContainer.nativeElement, width: 200, height: 160 }));
    this.graph.use(new History({ enabled: true }));
    this.graph.use(new Selection({ enabled: true, multiple: false, showNodeSelectionBox: true }));
    this.graph.use(new Snapline({ enabled: true }));

    // Events
    this.graph.on('node:click', ({ node }) => {
      this.onNodeClick(node.id);
    });

    this.graph.on('edge:click', ({ edge }) => {
      this.onEdgeClick(edge.id);
    });

    this.graph.on('blank:click', () => {
      this.onPaneClick();
    });

    this.graph.on('node:added', ({ node }) => {
      this.syncNodesFromGraph();
    });

    this.graph.on('node:removed', () => {
      this.syncNodesFromGraph();
    });

    this.graph.on('edge:added', ({ edge }) => {
      this.syncEdgesFromGraph();
    });

    this.graph.on('edge:removed', () => {
      this.syncEdgesFromGraph();
    });

    this.graph.on('node:moved', () => {
      this.syncNodesFromGraph();
    });

    // History change events
    this.graph.on('history:change', () => {
      this.canUndo.set(this.graph.canUndo());
      this.canRedo.set(this.graph.canRedo());
    });
  }

  private syncNodesFromGraph(): void {
    const x6Nodes = this.graph.getNodes();
    const updated: WorkflowNode[] = x6Nodes.map((n) => {
      const pos = n.getPosition();
      const data = n.getData()?.ngArguments ?? n.getData() ?? {};
      return {
        id: n.id,
        type: 'status',
        position: { x: pos.x, y: pos.y },
        data: {
          label: data.label ?? '',
          code: data.code ?? '',
          isInitial: data.isInitial ?? false,
          isFinal: data.isFinal ?? false,
          color: data.color ?? '#6366f1',
          description: data.description ?? '',
        },
      };
    });
    this.nodes.set(updated);
  }

  private syncEdgesFromGraph(): void {
    const x6Edges = this.graph.getEdges();
    const updated: WorkflowEdge[] = x6Edges.map((e) => {
      const data = e.getData() ?? {};
      return {
        id: e.id,
        source: e.getSourceCellId(),
        target: e.getTargetCellId(),
        label: data.label ?? '',
        data: {
          label: data.label ?? '',
          code: data.code ?? '',
          rules: data.rules ?? { triggerType: 'manual', requiredRoles: [], conditions: [] },
          actions: data.actions ?? [],
        },
      };
    });
    this.edges.set(updated);
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
        this.initDefaultCanvas();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private initDefaultCanvas(): void {
    const statuses = this.orderStatuses();
    const transitions = this.orderTransitions();

    // Clear graph
    this.graph.clearCells();

    // Add nodes
    const cols = 6;
    const spacingX = 180;
    const spacingY = 80;
    const startX = 40;
    const startY = 40;

    for (let i = 0; i < statuses.length; i++) {
      const s = statuses[i];
      this.graph.addNode({
        id: `node_${s.code}`,
        shape: 'status-node',
        x: startX + (i % cols) * spacingX,
        y: startY + Math.floor(i / cols) * spacingY,
        width: 120,
        height: 44,
        data: {
          ngArguments: {
            label: s.label,
            code: s.code,
            isInitial: s.isInitial,
            isFinal: s.isFinal,
            color: s.color || '#6366f1',
            description: s.description,
          },
        },
      });
    }

    // Add edges
    for (const t of transitions) {
      this.graph.addEdge({
        id: `edge_${t.code}`,
        source: `node_${t.sourceStatusCode}`,
        target: `node_${t.targetStatusCode}`,
        label: t.label,
        attrs: {
          line: {
            stroke: '#94a3b8',
            strokeWidth: 2,
            targetMarker: { name: 'block', width: 12, height: 8 },
          },
        },
        labels: [
          {
            position: 0.5,
            attrs: {
              label: {
                text: t.label,
                fill: '#2f2f2f',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'Poppins, sans-serif',
              },
              rect: {
                fill: '#fffdf3',
                rx: 4,
                ry: 4,
                ref: 'label',
                refX: -6,
                refY: -4,
                refWidth: '100%',
                refHeight: '100%',
                refWidth2: 12,
                refHeight2: 8,
              },
            },
          },
        ],
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
        router: 'manhattan',
        connector: 'rounded',
      });
    }

    this.graph.zoomToFit({ padding: 40, maxScale: 1.2 });
    this.syncNodesFromGraph();
    this.syncEdgesFromGraph();
  }

  // ── Graph events ───────────────────────────────────────

  private onNodeClick(nodeId: string): void {
    const node = this.nodes().find((n) => n.id === nodeId) ?? null;
    this.selectedNode.set(node);
    this.selectedEdge.set(null);
    this.showNodePanel.set(true);
    this.showEdgePanel.set(false);
  }

  private onEdgeClick(edgeId: string): void {
    const edge = this.edges().find((e) => e.id === edgeId) ?? null;
    this.selectedEdge.set(edge);
    this.selectedNode.set(null);
    this.showEdgePanel.set(true);
    this.showNodePanel.set(false);
  }

  private onPaneClick(): void {
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
    this.initDefaultCanvas();
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

    // Load nodes and edges into graph
    this.graph.clearCells();

    for (const node of workflow.nodes) {
      this.graph.addNode({
        id: node.id,
        shape: 'status-node',
        x: node.position.x,
        y: node.position.y,
        width: 120,
        height: 44,
        data: {
          ngArguments: { ...node.data },
        },
      });
    }

    for (const edge of workflow.edges) {
      this.graph.addEdge({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        attrs: {
          line: {
            stroke: '#94a3b8',
            strokeWidth: 2,
            targetMarker: { name: 'block', width: 12, height: 8 },
          },
        },
        labels: [
          {
            position: 0.5,
            attrs: {
              label: {
                text: edge.label ?? edge.data.label,
                fill: '#2f2f2f',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'Poppins, sans-serif',
              },
              rect: {
                fill: '#fffdf3',
                rx: 4,
                ry: 4,
                ref: 'label',
                refX: -6,
                refY: -4,
                refWidth: '100%',
                refHeight: '100%',
                refWidth2: 12,
                refHeight2: 8,
              },
            },
          },
        ],
        data: { ...edge.data },
        router: 'manhattan',
        connector: 'rounded',
      });
    }

    this.showLoadDialog.set(false);
    this.closeNodePanel();
    this.closeEdgePanel();
    this.syncNodesFromGraph();
    this.syncEdgesFromGraph();

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

  // ── Auto-layout with dagre ─────────────────────────────

  protected autoLayout(): void {
    const currentNodes = this.nodes();
    const currentEdges = this.edges();

    if (currentNodes.length === 0) return;

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 80 });

    for (const node of currentNodes) {
      g.setNode(node.id, { width: 120, height: 44 });
    }

    for (const edge of currentEdges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    for (const node of currentNodes) {
      const pos = g.node(node.id);
      const x6Node = this.graph.getCellById(node.id);
      if (x6Node && x6Node.isNode()) {
        (x6Node as Node).position(pos.x - 60, pos.y - 22);
      }
    }

    this.graph.zoomToFit({ padding: 40, maxScale: 1.2 });
    this.syncNodesFromGraph();

    this.messageService.add({
      severity: 'success',
      summary: 'Auto-layout',
      detail: 'Nodos organizados automáticamente',
    });
  }

  // ── Undo / Redo ────────────────────────────────────────

  protected undo(): void {
    this.graph.undo();
  }

  protected redo(): void {
    this.graph.redo();
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
            this.workflowId.set(null);
            if (data.name) this.workflowName.set(data.name);
            if (data.description) this.workflowDescription.set(data.description);

            // Load into graph
            this.graph.clearCells();

            for (const node of data.definition.nodes) {
              this.graph.addNode({
                id: node.id,
                shape: 'status-node',
                x: node.position.x,
                y: node.position.y,
      width: 120,
      height: 44,
                data: { ngArguments: { ...node.data } },
              });
            }

            for (const edge of data.definition.edges) {
              this.graph.addEdge({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                label: edge.label ?? edge.data?.label,
                attrs: {
                  line: {
                    stroke: '#94a3b8',
                    strokeWidth: 2,
                    targetMarker: { name: 'block', width: 12, height: 8 },
                  },
                },
                labels: [
                  {
                    position: 0.5,
                    attrs: {
                      label: {
                        text: edge.label ?? edge.data?.label ?? '',
                        fill: '#2f2f2f',
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'Poppins, sans-serif',
                      },
                      rect: {
                        fill: '#fffdf3',
                        rx: 4,
                        ry: 4,
                        ref: 'label',
                        refX: -6,
                        refY: -4,
                        refWidth: '100%',
                        refHeight: '100%',
                        refWidth2: 12,
                        refHeight2: 8,
                      },
                    },
                  },
                ],
                data: { ...edge.data },
                router: 'manhattan',
                connector: 'rounded',
              });
            }

            this.syncNodesFromGraph();
            this.syncEdgesFromGraph();

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

  // ── Node data update ───────────────────────────────────

  protected updateNodeData(field: keyof WorkflowNodeData, value: any): void {
    const node = this.selectedNode();
    if (!node) return;

    const updatedData = { ...node.data, [field]: value };
    this.nodes.update((current) =>
      current.map((n) => (n.id === node.id ? { ...n, data: updatedData } : n))
    );
    this.selectedNode.set({ ...node, data: updatedData });

    // Update x6 node
    const x6Node = this.graph.getCellById(node.id);
    if (x6Node) {
      x6Node.setData({ ngArguments: updatedData });
    }
  }

  // ── Edge data update ───────────────────────────────────

  protected updateEdgeData(field: keyof WorkflowEdgeData, value: any): void {
    const edge = this.selectedEdge();
    if (!edge) return;

    const updatedData = { ...edge.data, [field]: value };
    const updated = { ...edge, data: updatedData };
    if (field === 'label') {
      updated.label = value;
    }

    this.edges.update((current) =>
      current.map((e) => (e.id === edge.id ? updated : e))
    );
    this.selectedEdge.set(updated);

    // Update x6 edge
    const x6Edge = this.graph.getCellById(edge.id);
    if (x6Edge && x6Edge.isEdge()) {
      (x6Edge as Edge).setData(updatedData);
      if (field === 'label') {
        (x6Edge as Edge).setLabels([
          {
            position: 0.5,
            attrs: {
              label: {
                text: value as string,
                fill: '#2f2f2f',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'Poppins, sans-serif',
              },
              rect: {
                fill: '#fffdf3',
                rx: 4,
                ry: 4,
                ref: 'label',
                refX: -6,
                refY: -4,
                refWidth: '100%',
                refHeight: '100%',
                refWidth2: 12,
                refHeight2: 8,
              },
            },
          },
        ]);
      }
    }
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

    this.graph.addNode({
      id: `node_${status.code}`,
      shape: 'status-node',
      x: 100 + this.nodes().length * 40,
      y: 100 + this.nodes().length * 40,
      width: 160,
      height: 56,
      data: {
        ngArguments: {
          label: status.label,
          code: status.code,
          isInitial: status.isInitial,
          isFinal: status.isFinal,
          color: status.color || '#6366f1',
          description: status.description,
        },
      },
    });

    this.syncNodesFromGraph();
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
        const x6Node = this.graph.getCellById(node.id);
        if (x6Node && x6Node.isNode()) {
          this.graph.removeNode(x6Node as Node);
        }
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
        const x6Edge = this.graph.getCellById(edge.id);
        if (x6Edge && x6Edge.isEdge()) {
          this.graph.removeEdge(x6Edge as Edge);
        }
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
}
