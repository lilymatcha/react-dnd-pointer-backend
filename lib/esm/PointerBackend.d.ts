import { Backend, DragDropManager, Unsubscribe } from 'dnd-core';
declare global {
    interface Window {
        isReactDndBackendSetUp: boolean | undefined;
    }
}
export default class PointerBackend implements Backend {
    private context;
    private actions;
    private monitor;
    private registry;
    private enterLeaveCounter;
    private sourcePreviewNodes;
    private sourcePreviewNodeOptions;
    private sourceNodes;
    private sourceNodeOptions;
    private dragStartSourceIds;
    private dragEnterTargetIds;
    private dragOverTargetIds;
    private dropTargetIds;
    private currentDragSourceNode;
    private mouseMoveTimeoutTimer;
    private currentNativeSource;
    private currentNativeHandle;
    constructor(manager: DragDropManager<any>);
    readonly window: Window | undefined;
    setup(): void;
    teardown(): void;
    connectDragSource(sourceId: any, node?: any, options?: any): Unsubscribe;
    connectDragPreview(sourceId: any, node?: any, options?: any): Unsubscribe;
    connectDropTarget(targetId: any, node?: any, options?: any): Unsubscribe;
    private addEventListeners;
    private removeEventListeners;
    private handleDragStart;
    private handleSelectStart;
    private handleDragEnter;
    private handleDragOver;
    private handleDrop;
    private handleTopDragStartCapture;
    private handleTopDragStart;
    private clearCurrentDragSourceNode;
    private getSourceClientOffset;
    private getCurrentSourcePreviewNodeOptions;
    private setCurrentDragSourceNode;
    private endDragIfSourceWasRemovedFromDOM;
    private isNodeInDocument;
    private beginDragNativeItem;
    private handleTopPointerDown;
    private handleTopDragEndCapture;
    private handleTopDropCapture;
    private handleTopDrop;
    private isDraggingNativeItem;
    private endDragNativeItem;
    private getCurrentDropEffect;
    private getCurrentSourceNodeOptions;
    private handleTopDragEnterCapture;
    private handleTopDragEnter;
    private handleTopDragLeaveCapture;
    private handleTopDragOverCapture;
    private handleTopDragOver;
}
