class JsObject {
  notConfigurable: any;
  notEnumerable: any;
  notWritable: any;
  getter: any;
  setter: any;
  properties: any;
  eval: any;
  length: any;
  boundThis_: any;
  boundArgs_: any;
  strict: any;
  parentScope: any;
  node: any;
  nativeFunc: any;
  asyncFunc: any;

  /**
   * Class for an object.
   * @param {Interpreter.Object} parent Parent constructor function.
   * @constructor
   */
  constructor(parent: any) {
    this.notConfigurable = Object.create(null);
    this.notEnumerable = Object.create(null);
    this.notWritable = Object.create(null);
    this.getter = Object.create(null);
    this.setter = Object.create(null);
    this.properties = Object.create(null);
    this.parent = parent;
  };

  /**
   * @type {string}
   */
  type = 'object';

  /**
   * @type {Interpreter.Object}
   */
  parent: any = null;

  /**
   * @type {boolean}
   */
  isPrimitive = false;

  /**
   * @type {number|string|boolean|undefined|!RegExp}
   */
  data: any = undefined;

  /**
   * Convert this object into a boolean.
   * @return {boolean} Boolean value.
   */
  toBoolean() {
    return true;
  };

  /**
   * Convert this object into a number.
   * @return {number} Number value.
   */
  toNumber() {
    return Number(this.data === undefined ? this.toString() : this.data);
  };

  /**
   * Convert this object into a string.
   * @return {string} String value.
   * @override
   */
  toString() {
    return this.data === undefined ? ('[' + this.type + ']') : String(this.data);
  };

  /**
   * Return the object value.
   * @return {*} Value.
   * @override
   */
  valueOf() {
    return this.data === undefined ? this : this.data;
  };
}

export default JsObject;
