"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PointerBackend_1 = require("./PointerBackend");
const getEmptyImage_1 = require("./getEmptyImage");
exports.getEmptyImage = getEmptyImage_1.default;
const NativeTypes = require("./NativeTypes");
exports.NativeTypes = NativeTypes;
function createPointerBackend(manager) {
    return new PointerBackend_1.default(manager);
}
exports.default = createPointerBackend;
