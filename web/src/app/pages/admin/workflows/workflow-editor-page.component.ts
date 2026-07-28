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
import { forkJoin, of, switchMap } from 'rxjs';
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
  fieldLabel: string;
  detail: string;
  nodeNames?: string[];
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
  protected readonly pendingDeactivations = signal<string[]>([]);

  // Add edge dialog
  protected readonly showAddEdgeDialog = signal(false);
  protected newEdgeSource: string | undefined = undefined;
  protected newEdgeTarget: string | undefined = undefined;
  protected newEdgeLabel = '';

  // Validation errors dialog
  protected readonly showValidationErrors = signal(false);
  protected readonly validationErrors = signal<ValidationError[]>([]);

  protected readonly nodeOptions = computed(() =>
    this.nodes().map((n) => ({
      label: n.data.label || n.data.code,
      value: n.id,
    }))
  );

  protected readonly permissionOptions = signal<RoleOption[]>([]);

  protected readonly canCreate = computed(() =>
    this.authStore.hasPermission('workflow:create')
  );

  protected readonly canUpdate = computed(() =>
    this.authStore.hasPermission('workflow:update')
  );

  protected readonly canSave = computed(() =>
    this.workflowId() ? this.canUpdate() : this.canCreate()
  );

  protected readonly workflowId = signal<string | null>(null);
  protected readonly workflowName = signal('Flujo de Órdenes');
  protected readonly workflowDescription = signal('');
  protected selectedStatusToAdd: string | undefined = undefined;

  protected readonly showLoadDialog = signal(false);
  protected readonly savedWorkflows = signal<Workflow[]>([]);
  protected readonly loadingWorkflows = signal(false);

  // Undo/Redo
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);

  protected readonly availableStatuses = computed<StatusOption[]>(() => {
    const usedCodes = new Set(this.nodes().map((n) => n.data.code).filter(c => c));
    const allStatuses = this.orderStatuses();
    const available = allStatuses
      .filter((s) => !usedCodes.has(s.code))
      .map((s) => ({
        label: s.label,
        value: s.code,
        color: s.color || '#6366f1',
      }));
    return available;
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

  protected readonly delayUnitOptions = [
    { label: 'Minutos', value: 'minutes' },
    { label: 'Horas', value: 'hours' },
    { label: 'Días', value: 'days' },
  ];

  protected autoDelayValue: number | null = null;
  protected autoDelayUnit: string = 'hours';

  protected readonly actionTypes = [
    { label: 'Enviar email', value: 'send_email' },
    { label: 'Webhook', value: 'webhook' },
    { label: 'Actualizar campo', value: 'update_field' },
  ];

  ngOnInit(): void {
    this.loadOrderData();
    this.loadPermissions();
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
        allowNode: true,
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
      const rawData = n.getData() ?? {};
      const data = rawData.ngArguments ?? rawData;
      return {
        id: n.id,
        type: 'status',
        position: { x: pos.x, y: pos.y },
        data: {
          label: data.label ?? '',
          code: data.code ?? '',
          isInitial: data.isInitial ?? data.is_initial ?? false,
          isFinal: data.isFinal ?? data.is_final ?? false,
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
      const src = e.getSourceCellId();
      const tgt = e.getTargetCellId();
      if (!src || !tgt) {
      }
      return {
        id: e.id,
        source: src,
        target: tgt,
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

  private removeOrphanedEdges(): void {
    const nodeIds = new Set(this.graph.getNodes().map((n) => n.id));
    for (const edge of this.graph.getEdges()) {
      const src = edge.getSourceCellId();
      const tgt = edge.getTargetCellId();
      if (!nodeIds.has(src) || !nodeIds.has(tgt)) {
        this.graph.removeEdge(edge);
      }
    }
    this.syncEdgesFromGraph();
  }

  private loadPermissions(): void {
    this.rbacApi.listResources().subscribe({
      next: (resources) => {
        this.permissionOptions.set(
          resources.map((r) => ({ label: r.code, value: r.code }))
        );
      },
    });
  }

  private loadOrderData(): void {
    this.loading.set(true);

    this.workflowApi.getOrderStatuses('ALL').subscribe({
      next: (statuses) => {
        this.orderStatuses.set(statuses);

        this.workflowApi.getOrderTransitions().subscribe({
          next: (transitions) => {
            this.orderTransitions.set(transitions);

            // Try to load the active workflow from DB
            this.workflowApi.list({ entity_type: 'order', is_active: true, limit: 1 }).subscribe({
              next: (res) => {
                if (res.items.length > 0) {
                  this.loadWorkflow(res.items[0]);
                } else {
                  this.initDefaultCanvas();
                }
                this.loading.set(false);
              },
              error: () => {
                this.initDefaultCanvas();
                this.loading.set(false);
              },
            });
          },
          error: () => {
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los estatus de órdenes',
        });
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

    // Add edges (skip orphaned ones)
    const nodeIds = new Set(statuses.map((s) => `node_${s.code}`));
    for (const t of transitions) {
      const sourceId = `node_${t.sourceStatusCode}`;
      const targetId = `node_${t.targetStatusCode}`;
      if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) continue;

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
    this.loadAutoDelayFromEdge(edge);
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
      nodes: any[];
      edges: any[];
      metadata: any;
    };
  } {
    const now = new Date().toISOString();
    return {
      definition: {
        nodes: this.nodes().map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: {
            label: n.data.label,
            code: n.data.code,
            is_initial: n.data.isInitial,
            is_final: n.data.isFinal,
            color: n.data.color,
            description: n.data.description,
          },
        })),
        edges: this.edges().map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          data: {
            label: e.data.label,
            code: e.data.code,
            rules: {
              trigger_type: e.data.rules.triggerType,
              required_roles: e.data.rules.requiredRoles,
              required_permissions: e.data.rules.requiredPermissions,
              conditions: e.data.rules.conditions,
              auto_delay_minutes: e.data.rules.autoDelayMinutes,
            },
            actions: e.data.actions,
          },
        })),
        metadata: {
          viewport: { x: 0, y: 0, zoom: 1 },
          created_at: now,
          updated_at: now,
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
      errors.push({ field: 'nodes', fieldLabel: 'Nodos', detail: 'Debe haber al menos un nodo en el canvas' });
    }

    const nodesWithoutCode = currentNodes.filter((n) => !n.data.code?.trim());
    if (nodesWithoutCode.length > 0) {
      errors.push({
        field: 'code',
        fieldLabel: 'Código faltante',
        detail: `${nodesWithoutCode.length} nodo(s) sin código asignado`,
        nodeNames: nodesWithoutCode.map((n) => n.data.label || '(sin nombre)'),
      });
    }

    const initialNodes = currentNodes.filter((n) => n.data.isInitial);
    if (initialNodes.length === 0) {
      errors.push({ field: 'isInitial', fieldLabel: 'Nodo inicial', detail: 'Debe haber al menos un nodo marcado como inicial' });
    } else if (initialNodes.length > 1) {
      errors.push({
        field: 'isInitial',
        fieldLabel: 'Múltiples nodos iniciales',
        detail: `Solo debe haber un nodo inicial, pero hay ${initialNodes.length}`,
        nodeNames: initialNodes.map((n) => n.data.label),
      });
    }

    const finalNodes = currentNodes.filter((n) => n.data.isFinal);
    if (finalNodes.length === 0) {
      errors.push({ field: 'isFinal', fieldLabel: 'Nodo final', detail: 'Debe haber al menos un nodo marcado como final' });
    }

    const nodeIds = new Set(currentNodes.map((n) => n.id));
    const orphanEdges = currentEdges.filter(
      (e) => !nodeIds.has(e.source) || !nodeIds.has(e.target)
    );
    if (orphanEdges.length > 0) {
      errors.push({
        field: 'edges',
        fieldLabel: 'Transiciones huérfanas',
        detail: `${orphanEdges.length} transición(es) con origen o destino inválido`,
      });
    }

    // Validate path from initial to final
    if (initialNodes.length === 1 && finalNodes.length > 0) {
      if (!this.hasPathToFinal(currentNodes, currentEdges, initialNodes[0])) {
        errors.push({
          field: 'path',
          fieldLabel: 'Sin camino al final',
          detail: 'El flujo no llega a ningún nodo final desde el nodo inicial',
          nodeNames: currentNodes.map((n) => n.data.label),
        });
      }
    }

    // Validate all nodes reachable from initial
    if (initialNodes.length === 1) {
      const unreachable = this.getUnreachableNodes(currentNodes, currentEdges, initialNodes[0]);
      if (unreachable.length > 0) {
        errors.push({
          field: 'reachability',
          fieldLabel: 'Nodos inalcanzables',
          detail: `${unreachable.length} nodo(s) no son alcanzables desde el nodo inicial`,
          nodeNames: unreachable.map((n) => n.data.label),
        });
      }
    }

    // Validate automatic transitions have a delay configured
    const autoEdgesWithoutDelay = currentEdges.filter(
      (e) => e.data.rules.triggerType === 'automatic' && (!e.data.rules.autoDelayMinutes || e.data.rules.autoDelayMinutes <= 0)
    );
    if (autoEdgesWithoutDelay.length > 0) {
      errors.push({
        field: 'autoDelay',
        fieldLabel: 'Tiempo de espera faltante',
        detail: `${autoEdgesWithoutDelay.length} transición(es) automática(s) sin tiempo de espera configurado`,
      });
    }

    return errors;
  }

  private highlightProblematicNodes(errors: ValidationError[]): void {
    // Collect problematic node IDs from errors
    const problemNodeIds = new Set<string>();
    for (const error of errors) {
      if (error.nodeNames) {
        for (const name of error.nodeNames) {
          const node = this.nodes().find((n) => n.data.label === name || n.data.code === name);
          if (node) problemNodeIds.add(node.id);
        }
      }
      if (error.field === 'path') {
        for (const n of this.nodes()) {
          problemNodeIds.add(n.id);
        }
      }
    }

    // Set hasError flag on nodes for CSS styling
    for (const node of this.graph.getNodes()) {
      const isProblem = problemNodeIds.has(node.id);
      const data = node.getData() ?? {};
      const ngArgs = data.ngArguments ?? data;
      ngArgs.hasError = isProblem;
      node.setData({ ...data, ngArguments: ngArgs }, { overwrite: true });
    }

    // Auto-reset after 5 seconds
    setTimeout(() => {
      for (const node of this.graph.getNodes()) {
        const data = node.getData() ?? {};
        const ngArgs = data.ngArguments ?? data;
        ngArgs.hasError = false;
        node.setData({ ...data, ngArguments: ngArgs }, { overwrite: true });
      }
    }, 5000);
  }

  protected closeValidationErrors(): void {
    this.showValidationErrors.set(false);
  }

  private hasPathToFinal(nodes: WorkflowNode[], edges: WorkflowEdge[], initialNode: WorkflowNode): boolean {
    const visited = new Set<string>();
    const queue = [initialNode.id];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const currentNode = nodes.find((n) => n.id === currentId);
      if (currentNode?.data.isFinal) return true;

      const neighbors = edges.filter((e) => e.source === currentId).map((e) => e.target);
      queue.push(...neighbors);
    }

    return false;
  }

  private getUnreachableNodes(nodes: WorkflowNode[], edges: WorkflowEdge[], initialNode: WorkflowNode): WorkflowNode[] {
    const visited = new Set<string>();
    const queue = [initialNode.id];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const neighbors = edges.filter((e) => e.source === currentId).map((e) => e.target);
      queue.push(...neighbors);
    }

    return nodes.filter((n) => !visited.has(n.id));
  }

  // ── Load / Save ────────────────────────────────────────

  protected newWorkflow(): void {
    this.workflowId.set(null);
    this.workflowName.set('Flujo de Órdenes');
    this.workflowDescription.set('');
    this.pendingDeactivations.set([]);
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
    this.pendingDeactivations.set([]);

    // Refresh statuses from backend to ensure availableStatuses is accurate
    this.workflowApi.getOrderStatuses('ALL').subscribe({
      next: (statuses) => this.orderStatuses.set(statuses),
    });

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

    const validNodeIds = new Set(workflow.nodes.map((n) => n.id));

    let edgesAdded = 0;
    let edgesSkipped = 0;
    for (const edge of workflow.edges) {
      if (!validNodeIds.has(edge.source) || !validNodeIds.has(edge.target)) {
        edgesSkipped++;
        continue;
      }

      this.graph.addEdge({
        id: edge.id,
        source: edge.source,
        target: edge.target,
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
                text: edge.data.label,
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
      });
      edgesAdded++;
    }

    for (const edge of this.graph.getEdges()) {
      edge.setRouter('manhattan');
      edge.setConnector('rounded');
    }

    this.showLoadDialog.set(false);
    this.closeNodePanel();
    this.closeEdgePanel();
    this.syncNodesFromGraph();
    this.removeOrphanedEdges();

    this.graph.resize();
    this.graph.zoomToFit({ padding: 40, maxScale: 1.2 });

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
      this.validationErrors.set(errors);
      this.showValidationErrors.set(true);
      this.highlightProblematicNodes(errors);
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

    // Deactivate pending statuses before saving
    const pending = this.pendingDeactivations();
    const deactivate$ = pending.length > 0
      ? forkJoin(pending.map((code) => this.workflowApi.deactivateStatus(code)))
      : of([]);

    deactivate$.pipe(switchMap(() => request$)).subscribe({
      next: (workflow) => {
        this.workflowId.set(workflow.id);
        this.pendingDeactivations.set([]);
        this.loading.set(false);

        // Refresh available statuses
        this.workflowApi.getOrderStatuses('ALL').subscribe({
          next: (statuses) => this.orderStatuses.set(statuses),
        });

        const deactivatedMsg = pending.length > 0
          ? ` ${pending.length} estatus desactivado(s).`
          : '';
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: `Flujo guardado correctamente.${deactivatedMsg}`,
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

            const validIds = new Set(data.definition.nodes.map((n: any) => n.id));

            for (const edge of data.definition.edges) {
              if (!validIds.has(edge.source) || !validIds.has(edge.target)) continue;

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
    if (triggerType !== 'automatic') {
      updatedRules.autoDelayMinutes = undefined;
      this.autoDelayValue = null;
      this.autoDelayUnit = 'hours';
    }
    this.updateEdgeData('rules', updatedRules);
  }

  protected onAutoDelayChange(): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    let minutes: number | undefined = undefined;
    if (this.autoDelayValue != null && this.autoDelayValue > 0) {
      switch (this.autoDelayUnit) {
        case 'minutes':
          minutes = this.autoDelayValue;
          break;
        case 'hours':
          minutes = this.autoDelayValue * 60;
          break;
        case 'days':
          minutes = this.autoDelayValue * 1440;
          break;
      }
    }
    const updatedRules = { ...edge.data.rules, autoDelayMinutes: minutes };
    this.updateEdgeData('rules', updatedRules);
  }

  private loadAutoDelayFromEdge(edge: WorkflowEdge | null): void {
    if (!edge?.data.rules.autoDelayMinutes || edge.data.rules.autoDelayMinutes <= 0) {
      this.autoDelayValue = null;
      this.autoDelayUnit = 'hours';
      return;
    }
    const minutes = edge.data.rules.autoDelayMinutes;
    if (minutes % 1440 === 0) {
      this.autoDelayValue = minutes / 1440;
      this.autoDelayUnit = 'days';
    } else if (minutes % 60 === 0) {
      this.autoDelayValue = minutes / 60;
      this.autoDelayUnit = 'hours';
    } else {
      this.autoDelayValue = minutes;
      this.autoDelayUnit = 'minutes';
    }
  }

  protected onRequiredPermissionsChange(permissions: string[]): void {
    const edge = this.selectedEdge();
    if (!edge) return;
    const updatedRules = { ...edge.data.rules, requiredPermissions: permissions };
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
      message: `¿Eliminar el estatus "${node.data.label}" del flujo? Se desactivará al guardar el flujo. Las transiciones conectadas también se eliminarán.`,
      header: 'Eliminar nodo',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        // Track for deactivation on save
        if (node.data.code) {
          this.pendingDeactivations.update((list) =>
            list.includes(node.data.code) ? list : [...list, node.data.code]
          );
        }

        // Remove connected edges first
        const x6Node = this.graph.getCellById(node.id);
        if (x6Node && x6Node.isNode()) {
          const connectedEdges = this.graph.getConnectedEdges(x6Node as Node);
          for (const edge of connectedEdges) {
            this.graph.removeEdge(edge);
          }
          this.graph.removeNode(x6Node as Node);
        }
        this.closeNodePanel();
        this.syncNodesFromGraph();
        this.syncEdgesFromGraph();

        this.messageService.add({
          severity: 'info',
          summary: 'Nodo eliminado',
          detail: `"${node.data.label}" será desactivado al guardar el flujo.`,
          life: 3000,
        });
      },
    });
  }

  protected openAddEdgeDialog(): void {
    this.newEdgeSource = undefined;
    this.newEdgeTarget = undefined;
    this.newEdgeLabel = '';
    this.showAddEdgeDialog.set(true);
  }

  protected confirmAddEdge(): void {
    if (!this.newEdgeSource || !this.newEdgeTarget || this.newEdgeSource === this.newEdgeTarget) return;

    const sourceNode = this.nodes().find((n) => n.id === this.newEdgeSource);
    const targetNode = this.nodes().find((n) => n.id === this.newEdgeTarget);
    if (!sourceNode || !targetNode) return;

    const label = this.newEdgeLabel || `${sourceNode.data.code} → ${targetNode.data.code}`;
    const code = `${sourceNode.data.code}_TO_${targetNode.data.code}`;

    // Close dialog first so graph can render properly
    this.showAddEdgeDialog.set(false);

    this.graph.addEdge({
      id: `edge_${code}_${Date.now()}`,
      source: this.newEdgeSource,
      target: this.newEdgeTarget,
      label,
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
              text: label,
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
        label,
        code,
        rules: { triggerType: 'manual', requiredRoles: [], conditions: [] },
        actions: [],
      },
    });

    this.graph.resize();
    this.syncEdgesFromGraph();

    this.messageService.add({
      severity: 'success',
      summary: 'Transición creada',
      detail: `"${label}" agregada correctamente`,
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
