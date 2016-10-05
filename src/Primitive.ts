class Primitive {

  /**
   * Class for a number, string, boolean, null, or undefined.
   * @param {number|string|boolean|null|undefined} data Primitive value.
   * @param {!Interpreter} interpreter The JS Interpreter to bind to.
   * @constructor
   */
  constructor(data: any, interpreter: any) {
    var type = typeof data;
    this.data = data;
    this.type = type;
    if (type == 'number') {
      this.parent = interpreter.NUMBER;
    } else if (type == 'string') {
      this.parent = interpreter.STRING;
    } else if (type == 'boolean') {
      this.parent = interpreter.BOOLEAN;
    }
  };

  /**
   * @type {number|string|boolean|null|undefined}
   */
  data: any = undefined;

  /**
   * @type {string}
   */
  type = 'undefined';

  /**
   * @type {Function}
   */
  parent: any = null;

  /**
   * @type {boolean}
   */
  isPrimitive = true;

  /**
   * Convert this primitive into a boolean.
   * @return {boolean} Boolean value.
   */
  toBoolean() {
    return Boolean(this.data);
  };

  /**
   * Convert this primitive into a number.
   * @return {number} Number value.
   */
  toNumber() {
    return Number(this.data);
  };

  /**
   * Convert this primitive into a string.
   * @return {string} String value.
   * @override
   */
  toString() {
    return String(this.data);
  };

  /**
   * Return the primitive value.
   * @return {number|string|boolean|null|undefined} Primitive value.
   * @override
   */
  valueOf() {
    return this.data;
  };
}

export default Primitive;
