export * from './interfaces';
import PointerBackend from './PointerBackend';
import getEmptyImage from './getEmptyImage';
import * as NativeTypes from './NativeTypes';
import { DragDropManager } from 'dnd-core';
export { NativeTypes, getEmptyImage };
export default function createPointerBackend(manager: DragDropManager<any>): PointerBackend;
