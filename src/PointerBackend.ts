declare var require: any;

import { 
  Backend,
  DragDropActions,
  DragDropManager,
  DragDropMonitor,
  HandlerRegistry,
  Unsubscribe
} from 'dnd-core';
import EnterLeaveCounter from './EnterLeaveCounter';
import {
  getNodeClientOffset,
	getEventClientOffset,
	getDragPreviewOffset,
} from './OffsetUtils';
import { isFirefox } from './BrowserDetector';
import {
  createNativeDragSource,
	matchNativeItemType,
} from './NativeDragSources';
import * as NativeTypes from './NativeTypes';
import { PointerBackendContext } from './interfaces';
const defaults = require('lodash/defaults');

declare global {
	interface Window {
		isReactDndBackendSetUp: boolean | undefined;
	}
}

export default class PointerBackend implements Backend {
  private context: PointerBackendContext;
  private actions: DragDropActions;
  private monitor: DragDropMonitor;
  private registry: HandlerRegistry;

  private enterLeaveCounter: EnterLeaveCounter;

  private sourcePreviewNodes: Map<string, Element> = new Map();
	private sourcePreviewNodeOptions: Map<string, any> = new Map();
  private sourceNodes: Map<string, Element> = new Map();
  private sourceNodeOptions: Map<string, any> = new Map();
  
  private dragStartSourceIds: string[] | null = null;
  private dragEnterTargetIds: string[] = [];
  private dragOverTargetIds: string[] | null = null;
  private dropTargetIds: string[] = [];
  private currentDragSourceNode: any = null;
  private mouseMoveTimeoutTimer: any = null;
  private currentNativeSource: any = null;
  private currentNativeHandle: any = null;

	constructor(manager: DragDropManager<any>) {
    this.context = manager.getContext();
    this.actions = manager.getActions();
    this.monitor = manager.getMonitor();
    this.registry = manager.getRegistry();

    this.enterLeaveCounter = new EnterLeaveCounter(this.isNodeInDocument);
	}

  public get window() {
		if (this.context && this.context.window) {
			return this.context.window;
		} else if (typeof window !== 'undefined') {
			return window;
		}
		return undefined;
  }
    
  public setup() {
    if (this.window === undefined) {
      return;
    }

    if (this.window.isReactDndBackendSetUp) {
      throw new Error('Cannot have two Pointer backends at the same time.');
    }
    this.window.isReactDndBackendSetUp = true;
    this.addEventListeners(this.window);
  }

  public teardown() {
    if (this.window === undefined) {
      return;
    }
      
    this.window.isReactDndBackendSetUp = false;
    this.removeEventListeners(this.window);
  }

  public connectDragSource(sourceId: any, node?: any, options?: any): Unsubscribe {
    this.sourceNodes.set(sourceId, node);
		this.sourceNodeOptions.set(sourceId, options);

		const handleDragStart = (e: any) => this.handleDragStart(e, sourceId);
    const handleSelectStart = (e: any) => this.handleSelectStart(e);

		node.setAttribute('draggable', true);
		node.addEventListener('dragstart', handleDragStart);
    node.addEventListener('selectstart', handleSelectStart);

		return () => {
			this.sourceNodes.delete(sourceId);
			this.sourceNodeOptions.delete(sourceId);

			node.removeEventListener('dragstart', handleDragStart);
			node.removeEventListener('selectstart', handleSelectStart);
			node.setAttribute('draggable', false);
		}
  }

  public connectDragPreview(sourceId: any, node?: any, options?: any): Unsubscribe {
    this.sourcePreviewNodeOptions.set(sourceId, options);
		this.sourcePreviewNodes.set(sourceId, node);

		return () => {
			this.sourcePreviewNodes.delete(sourceId);
			this.sourcePreviewNodeOptions.delete(sourceId);
		}
  }

  public connectDropTarget(targetId: any, node?: any, options?: any): Unsubscribe {
    const handleDragEnter = (e: any) => this.handleDragEnter(e, targetId);
		const handleDragOver = (e: any) => this.handleDragOver(e, targetId);
		const handleDrop = (e: any) => this.handleDrop(e, targetId);

		node.addEventListener('dragenter', handleDragEnter);
		node.addEventListener('dragover', handleDragOver);
		node.addEventListener('drop', handleDrop);

		return () => {
			node.removeEventListener('dragenter', handleDragEnter);
			node.removeEventListener('dragover', handleDragOver);
			node.removeEventListener('drop', handleDrop);
		}
  }

  private addEventListeners(target: any) {
    if (!target.addEventListener) {
      return;
    }

    target.addEventListener('dragstart', this.handleTopDragStart);
    target.addEventListener('dragstart', this.handleTopDragStartCapture, true);
    target.addEventListener('pointerdown', this.handleTopPointerDown, true);
    target.addEventListener('dragend', this.handleTopDragEndCapture, true);
    target.addEventListener('dragenter', this.handleTopDragEnter)
		target.addEventListener('dragenter', this.handleTopDragEnterCapture, true)
		target.addEventListener('dragleave', this.handleTopDragLeaveCapture, true)
		target.addEventListener('dragover', this.handleTopDragOver)
		target.addEventListener('dragover', this.handleTopDragOverCapture, true)
    target.addEventListener('drop', this.handleTopDrop);
		target.addEventListener('drop', this.handleTopDropCapture, true);
  }

  private removeEventListeners(target: any) {
    if (!target.removeEventListener) {
      return;
    }
  }
  
  private handleDragStart(e: any, sourceId: any) {
    if (!this.dragStartSourceIds) {
			this.dragStartSourceIds = [];
		}
    this.dragStartSourceIds.unshift(sourceId);
  }

  private handleSelectStart(e: any) {
    const { target } = e;

    // Only IE requires us to explicitly say we want drag drop operation to start
		if (typeof target.dragDrop !== 'function') {
			return;
    }
    
		// Inputs and textareas should be selectable
		if (
			target.tagName === 'INPUT' ||
			target.tagName === 'SELECT' ||
			target.tagName === 'TEXTAREA' ||
			target.isContentEditable
		) {
			return;
		}

		// For other targets, ask IE to enable drag and drop
		e.preventDefault();
		target.dragDrop();
  }

  private handleDragEnter(e: any, targetId: string) {
		this.dragEnterTargetIds.unshift(targetId);
  }
  
  private handleDragOver(e: any, targetId: string) {
		if (this.dragOverTargetIds === null) {
			this.dragOverTargetIds = [];
		}
		this.dragOverTargetIds.unshift(targetId);
  }
  
  private handleDrop(e: any, targetId: string) {
		this.dropTargetIds.unshift(targetId);
  }
  
  private handleTopDragStartCapture = () => {
		this.clearCurrentDragSourceNode();
		this.dragStartSourceIds = [];
  }
  
  private handleTopDragStart = (e: any) => {
		const { dragStartSourceIds } = this;
		this.dragStartSourceIds = null;

		const clientOffset = getEventClientOffset(e);

		// Avoid crashing if we missed a drop event or our previous drag died
		if (this.monitor.isDragging()) {
			this.actions.endDrag();
		}

		// Don't publish the source just yet (see why below)
		this.actions.beginDrag(dragStartSourceIds || [], {
			publishSource: false,
			getSourceClientOffset: this.getSourceClientOffset,
			clientOffset,
		});

    const { dataTransfer } = e;
		const nativeType = matchNativeItemType(dataTransfer);

		if (this.monitor.isDragging()) {
			if (typeof dataTransfer.setDragImage === 'function') {
				// Use custom drag image if user specifies it.
				// If child drag source refuses drag but parent agrees,
				// use parent's node as drag image. Neither works in IE though.
				const sourceId: string = this.monitor.getSourceId() as string;
				const sourceNode = this.sourceNodes.get(sourceId);
        const dragPreview = this.sourcePreviewNodes.get(sourceId) || sourceNode;

				const {
					anchorX,
					anchorY,
					offsetX,
					offsetY,
				} = this.getCurrentSourcePreviewNodeOptions();
				const anchorPoint = { anchorX, anchorY };
				const offsetPoint = { offsetX, offsetY };
				const dragPreviewOffset = getDragPreviewOffset(
					sourceNode,
					dragPreview,
					clientOffset,
					anchorPoint,
					offsetPoint,
				);

				dataTransfer.setDragImage(
					dragPreview,
					dragPreviewOffset.x,
					dragPreviewOffset.y,
				);
			}

			// Store drag source node so we can check whether
			// it is removed from DOM and trigger endDrag manually.
			this.setCurrentDragSourceNode(e.target)

			// Now we are ready to publish the drag source.. or are we not?
			const { captureDraggingState } = this.getCurrentSourcePreviewNodeOptions()
			if (!captureDraggingState) {
				// Usually we want to publish it in the next tick so that browser
				// is able to screenshot the current (not yet dragging) state.
				//
				// It also neatly avoids a situation where render() returns null
				// in the same tick for the source element, and browser freaks out.
				setTimeout(() => this.actions.publishDragSource(), 0)
			} else {
				// In some cases the user may want to override this behavior, e.g.
				// to work around IE not supporting custom drag previews.
				//
				// When using a custom drag layer, the only way to prevent
				// the default drag preview from drawing in IE is to screenshot
				// the dragging state in which the node itself has zero opacity
				// and height. In this case, though, returning null from render()
				// will abruptly end the dragging, which is not obvious.
				//
				// This is the reason such behavior is strictly opt-in.
				this.actions.publishDragSource()
			}
		} else if (nativeType) {
			// A native item (such as URL) dragged from inside the document
			this.beginDragNativeItem(nativeType)
		} else if (
      !dataTransfer.types &&
			(!e.target.hasAttribute || !e.target.hasAttribute('draggable'))
		) {
			// Looks like a Safari bug: dataTransfer.types is null, but there was no draggable.
			// Just let it drag. It's a native type (URL or text) and will be picked up in
			// dragenter handler.
			return;
		} else {
			// If by this time no drag source reacted, tell browser not to drag.
			e.preventDefault();
		}
  }
  
  private clearCurrentDragSourceNode() {
		if (this.currentDragSourceNode) {
      this.currentDragSourceNode = null;
      
      if (this.window) {
				this.window.clearTimeout(this.mouseMoveTimeoutTimer);
				this.window.removeEventListener(
					'mousemove',
					this.endDragIfSourceWasRemovedFromDOM,
					true,
				);
			}

			this.mouseMoveTimeoutTimer = null;
			return true;
		}

		return false
  }
  
  private getSourceClientOffset = (sourceId: string) => {
		return getNodeClientOffset(this.sourceNodes.get(sourceId))
  }
  
  private getCurrentSourcePreviewNodeOptions() {
		const sourceId = this.monitor.getSourceId() as string
		const sourcePreviewNodeOptions = this.sourcePreviewNodeOptions.get(sourceId)

		return defaults(sourcePreviewNodeOptions || {}, {
			anchorX: 0.5,
			anchorY: 0.5,
			captureDraggingState: false,
		})
  }
  
  private setCurrentDragSourceNode(node: any) {
		this.clearCurrentDragSourceNode()
		this.currentDragSourceNode = node

		// A timeout of > 0 is necessary to resolve Firefox issue referenced
		// See:
		//   * https://github.com/react-dnd/react-dnd/pull/928
		//   * https://github.com/react-dnd/react-dnd/issues/869
		const MOUSE_MOVE_TIMEOUT = 1000

		// Receiving a mouse event in the middle of a dragging operation
		// means it has ended and the drag source node disappeared from DOM,
		// so the browser didn't dispatch the dragend event.
		//
		// We need to wait before we start listening for mousemove events.
		// This is needed because the drag preview needs to be drawn or else it fires an 'mousemove' event
		// immediately in some browsers.
		//
		// See:
		//   * https://github.com/react-dnd/react-dnd/pull/928
		//   * https://github.com/react-dnd/react-dnd/issues/869
		//
		this.mouseMoveTimeoutTimer = setTimeout(() => {
			return (
				this.window &&
				this.window.addEventListener(
					'mousemove',
					this.endDragIfSourceWasRemovedFromDOM,
					true,
				)
			);
		}, MOUSE_MOVE_TIMEOUT);
  }
  
  private endDragIfSourceWasRemovedFromDOM = () => {
		const node = this.currentDragSourceNode
		if (this.isNodeInDocument(node)) {
			return;
		}

		if (this.clearCurrentDragSourceNode()) {
			this.actions.endDrag();
		}
  }
  
  private isNodeInDocument = (node: any) => {
		// Check the node either in the main document or in the current context
		return (
			(!!document && document.body.contains(node)) ||
			(!!this.window && this.window.document.body.contains(node))
		);
  }
  
  private beginDragNativeItem(type: any) {
		this.clearCurrentDragSourceNode()

		const SourceType = createNativeDragSource(type)
		this.currentNativeSource = new SourceType()
		this.currentNativeHandle = this.registry.addSource(
			type,
			this.currentNativeSource,
		)
		this.actions.beginDrag([this.currentNativeHandle])
  }
  
  private handleTopPointerDown = (e: PointerEvent) => {
    var mouseDown = new MouseEvent('mousedown');
    if (e.currentTarget) {
      e.currentTarget.dispatchEvent(mouseDown);
    }
  }

  private handleTopDragEndCapture = () => {
		if (this.clearCurrentDragSourceNode()) {
			// Firefox can dispatch this event in an infinite loop
			// if dragend handler does something like showing an alert.
			// Only proceed if we have not handled it already.
			this.actions.endDrag()
		}
  }
  
  private handleTopDropCapture = (e: any) => {
		this.dropTargetIds = []
		e.preventDefault()

		if (this.isDraggingNativeItem()) {
			this.currentNativeSource.mutateItemByReadingDataTransfer(e.dataTransfer)
		}

		this.enterLeaveCounter.reset()
	}

	private handleTopDrop = (e: any) => {
		const { dropTargetIds } = this
		this.dropTargetIds = []

		this.actions.hover(dropTargetIds, {
			clientOffset: getEventClientOffset(e),
		})
		this.actions.drop({ dropEffect: this.getCurrentDropEffect() })

		if (this.isDraggingNativeItem()) {
			this.endDragNativeItem()
		} else {
			this.endDragIfSourceWasRemovedFromDOM()
		}
  }
  
  private isDraggingNativeItem() {
		const itemType = this.monitor.getItemType()
		return Object.keys(NativeTypes).some(
			(key: string) => (NativeTypes as any)[key] === itemType,
		)
  }
  
  private endDragNativeItem = () => {
		if (!this.isDraggingNativeItem()) {
			return
		}

		this.actions.endDrag()
		this.registry.removeSource(this.currentNativeHandle)
		this.currentNativeHandle = null
		this.currentNativeSource = null
  }
  
  private getCurrentDropEffect() {
		if (this.isDraggingNativeItem()) {
			// It makes more sense to default to 'copy' for native resources
			return 'copy'
		}

		return this.getCurrentSourceNodeOptions().dropEffect
  }
  
  private getCurrentSourceNodeOptions() {
		const sourceId = this.monitor.getSourceId() as string
		const sourceNodeOptions = this.sourceNodeOptions.get(sourceId)

		return defaults(sourceNodeOptions || {}, {
			dropEffect: 'move',
		})
  }
  
  private handleTopDragEnterCapture = (e: any) => {
		this.dragEnterTargetIds = []

		const isFirstEnter = this.enterLeaveCounter.enter(e.target)
		if (!isFirstEnter || this.monitor.isDragging()) {
			return
		}

		const { dataTransfer } = e
		const nativeType = matchNativeItemType(dataTransfer)

		if (nativeType) {
			// A native item (such as file or URL) dragged from outside the document
			this.beginDragNativeItem(nativeType)
		}
  }
  
  private handleTopDragEnter = (e: any) => {
		const { dragEnterTargetIds } = this
		this.dragEnterTargetIds = []

		if (!this.monitor.isDragging()) {
			// This is probably a native item type we don't understand.
			return
		}

		if (!isFirefox()) {
			// Don't emit hover in `dragenter` on Firefox due to an edge case.
			// If the target changes position as the result of `dragenter`, Firefox
			// will still happily dispatch `dragover` despite target being no longer
			// there. The easy solution is to only fire `hover` in `dragover` on FF.
			this.actions.hover(dragEnterTargetIds, {
				clientOffset: getEventClientOffset(e),
			})
		}

		const canDrop = dragEnterTargetIds.some(targetId =>
			this.monitor.canDropOnTarget(targetId),
		)

		if (canDrop) {
			// IE requires this to fire dragover events
			e.preventDefault()
			e.dataTransfer.dropEffect = this.getCurrentDropEffect()
		}
  }
  
  private handleTopDragLeaveCapture = (e: any) => {
		if (this.isDraggingNativeItem()) {
			e.preventDefault();
		}

		const isLastLeave = this.enterLeaveCounter.leave(e.target);
		if (!isLastLeave) {
			return;
		}

		if (this.isDraggingNativeItem()) {
			this.endDragNativeItem();
		}
  }
  
  private handleTopDragOverCapture = () => {
		this.dragOverTargetIds = [];
  }
  
  private handleTopDragOver = (e: any) => {
		const { dragOverTargetIds } = this;
		this.dragOverTargetIds = [];

		if (!this.monitor.isDragging()) {
			// This is probably a native item type we don't understand.
			// Prevent default "drop and blow away the whole document" action.
			e.preventDefault();
			e.dataTransfer.dropEffect = 'none';
			return;
		}

		this.actions.hover(dragOverTargetIds || [], {
			clientOffset: getEventClientOffset(e),
		});

		const canDrop = (dragOverTargetIds || []).some(targetId =>
			this.monitor.canDropOnTarget(targetId),
		);

		if (canDrop) {
			// Show user-specified drop effect.
			e.preventDefault();
			e.dataTransfer.dropEffect = this.getCurrentDropEffect();
		} else if (this.isDraggingNativeItem()) {
			// Don't show a nice cursor but still prevent default
			// "drop and blow away the whole document" action.
			e.preventDefault();
			e.dataTransfer.dropEffect = 'none';
		} else {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'none';
		}
	}
}