import JsObject from './JsObject';

/**
 * Compares two objects against each other.
 * @param {!Object} a First object.
 * @param {!Object} b Second object.
 * @return {number} -1 if a is smaller, 0 if a == b, 1 if a is bigger,
 *     NaN if they are not comparable.
 */
export function comp(a: JsObject, b: JsObject) {
  if (a.isPrimitive && a.type == 'number' && isNaN(a.data) ||
      b.isPrimitive && b.type == 'number' && isNaN(b.data)) {
    // NaN is not comparable to anything, including itself.
    return NaN;
  }

  if (a === b) {
    return 0;
  }

  if (a.isPrimitive && b.isPrimitive) {
    a = a.data;
    b = b.data;
  } else {
    // TODO: Handle other types.
    return NaN;
  }

  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }

  return 0;
};

/**
 * Is a value a legal integer for an array?
 * @param {*} n Value to check.
 * @return {number} Zero, or a positive integer if the value can be
 *     converted to such.  NaN otherwise.
 */
export function arrayIndex(n: any) {
  n = Number(n);
  if (!isFinite(n) || n != Math.floor(n) || n < 0) {
    return NaN;
  }
  return n;
};

/**
 * Remove start and end values from AST.
 * Used to remove highlighting from polyfills.
 * @param {!Object} node AST node.
 * @private
 */
export function stripLocations(node: any) {
  delete node.start;
  delete node.end;
  for (var name in node) {
    if (node.hasOwnProperty(name)) {
      var prop = node[name];
      if (prop && typeof prop == 'object') {
        stripLocations(prop);
      }
    }
  }
};

/**
 * Is an object of a certain class?
 * @param {Object} child Object to check.
 * @param {Object} parent Constructor of object.
 * @return {boolean} True if object is the class or inherits from it.
 *     False otherwise.
 */
export function isa(child: any, parent: any) {
  if (!child || !parent) {
    return false;
  }
  while (child.parent != parent) {
    if (!child.parent || !child.parent.properties.prototype) {
      return false;
    }
    child = child.parent.properties.prototype;
  }
  return true;
};

export function strictComp(a: JsObject, b: JsObject) {
  // Strict === comparison.
  if (a.isPrimitive && b.isPrimitive) {
    return a.data === b.data;
  }
  return a === b;
};
