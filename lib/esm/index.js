import PointerBackend from './PointerBackend';
import getEmptyImage from './getEmptyImage';
import * as NativeTypes from './NativeTypes';
export { NativeTypes, getEmptyImage };
export default function createPointerBackend(manager) {
    return new PointerBackend(manager);
}
