import acorn = require('acorn');
import {
  Program,
  ExpressionStatement,
  AssignmentExpression,
} from 'estree';
import Primitive from './Primitive';
import JsObject from './JsObject';
import * as utils from './utils';
import {
  AsyncFunction,
} from './types';

/**
 * @const {!Object} Configuration used for all Acorn parsing.
 */
const PARSE_OPTIONS = {
  ecmaVersion: 5
}

/**
 * Property descriptor of readonly properties.
 */
const READONLY_DESCRIPTOR = {
  configurable: true,
  enumerable: true,
  writable: false
};

/**
 * Property descriptor of non-enumerable properties.
 */
const NONENUMERABLE_DESCRIPTOR = {
  configurable: true,
  enumerable: false,
  writable: true
};

/**
 * Property descriptor of readonly, non-enumerable properties.
 */
const READONLY_NONENUMERABLE_DESCRIPTOR = {
  configurable: true,
  enumerable: false,
  writable: false
};

export interface State {
  node: any;
  scope?: any;
  thisExpression?: any;
  done?: boolean;
  func_?: JsObject;
  funcThis_?: any;
  arguments?: any;
  doneArgs_?: boolean;
  doneExec_?: boolean;
  throwValue?: any;
  doneLeft?: boolean;
  doneRight?: boolean;
  value?: any;
  interpreter?: any;
  n?: any;
  array?: any;
  components?: boolean;
  leftSide?: any;
  doneGetter_?: any;
  leftValue?: any;
  doneCallee_?: any;
  n_?: any;
  label?: any;
  isLoop?: boolean;
  isSwitch?: boolean;
  doneSetter_?: any;
  doneObject?: any;
  doneBody?: any;
  member_?: any;
  isConstructor_?: any;
  doneVariable_?: any;
  doneObject_?: any;
  variable?: any;
  iterator?: any;
  object?: any;
  test?: any;
  doneLeft_?: any;
  doneRight_?: any;
  doneProperty_?: any;
  checked?: any;
  switchValue?: any;
  index?: any;
  valueToggle?: any;
  properties?: any;
  key?: any;
  kind?: any;
  argument?: any;
  doneBlock?: boolean;
  doneFinalizer?: any;
  mode?: any;
}

export interface InitFunc {
  (interpreter: Interpreter, scope: JsObject): any;
}

/**
 * @fileoverview Interpreting JavaScript in JavaScript.
 * @author fraser@google.com (Neil Fraser)
 */

export class Interpreter {
  UNDEFINED: Primitive;
  NULL: Primitive;
  NAN: Primitive;
  TRUE: Primitive;
  FALSE: Primitive;
  NUMBER_ZERO: Primitive;
  NUMBER_ONE: Primitive;
  STRING_EMPTY: Primitive;
  NUMBER: Primitive;
  BOOLEAN: Primitive;
  STRING: Primitive;
  OBJECT: any;
  FUNCTION: any;
  ARRAY: any;
  REGEXP: any;
  TYPE_ERROR: any;
  URI_ERROR: any;
  REFERENCE_ERROR: any;
  RANGE_ERROR: any;
  DATE: any;
  ERROR: any;
  EVAL_ERROR: any;
  SYNTAX_ERROR: any;

  ast: Program;
  initFunc_: InitFunc;
  paused_: boolean;
  polyfills_: string[];
  stateStack: State[];
  value: any;
  parentScope: any;

  /**
   * Create a new interpreter.
   * @param {string|!Object} code Raw JavaScript text or AST.
   * @param {Function=} opt_initFunc Optional initialization function.  Used to
   *     define APIs.  When called it is passed the interpreter object and the
   *     global scope object.
   * @constructor
   */
  constructor(code: any, opt_initFunc?: InitFunc) {
    if (typeof code == 'string') {
      code = acorn.parse(code, PARSE_OPTIONS);
    }

    this.ast = code;
    this.initFunc_ = opt_initFunc;
    this.paused_ = false;
    this.polyfills_ = [];

    // Predefine some common primitives for performance.
    this.UNDEFINED = new Primitive(undefined, this);
    this.NULL = new Primitive(null, this);
    this.NAN = new Primitive(NaN, this);
    this.TRUE = new Primitive(true, this);
    this.FALSE = new Primitive(false, this);
    this.NUMBER_ZERO = new Primitive(0, this);
    this.NUMBER_ONE = new Primitive(1, this);
    this.STRING_EMPTY = new Primitive('', this);

    // Create and initialize the global scope.
    const scope = this.createScope(this.ast, null);

    // Fix the parent properties now that the global scope exists.
    //this.UNDEFINED.parent = undefined;
    //this.NULL.parent = undefined;
    this.NAN.parent = this.NUMBER;
    this.TRUE.parent = this.BOOLEAN;
    this.FALSE.parent = this.BOOLEAN;
    this.NUMBER_ZERO.parent = this.NUMBER;
    this.NUMBER_ONE.parent = this.NUMBER;
    this.STRING_EMPTY.parent = this.STRING;

    // Run the polyfills.
    this.ast = acorn.parse(this.polyfills_.join('\n'), PARSE_OPTIONS);
    this.polyfills_ = undefined;  // Allow polyfill strings to garbage collect.
    utils.stripLocations(this.ast);
    this.stateStack = [{
      node: this.ast,
      scope: scope,
      thisExpression: scope,
      done: false
    }];
    this.run();
    this.value = this.UNDEFINED;
    // Point at the main program.
    this.ast = code;
    this.stateStack = [{
      node: this.ast,
      scope,
      thisExpression: scope,
      done: false,
    }];
  }

  /**
   * Add more code to the interpreter.
   * @param {string|!Object} code Raw JavaScript text or AST.
   */
  appendCode(code: any) {
    const state = this.stateStack[this.stateStack.length - 1];
    if (!state || state.node.type != 'Program') {
      throw Error('Expecting original AST to start with a Program node.');
    }
    if (typeof code == 'string') {
      code = acorn.parse(code, PARSE_OPTIONS);
    }
    if (!code || code.type != 'Program') {
      throw Error('Expecting new AST to start with a Program node.');
    }
    this.populateScope_(code, state.scope);
    // Append the new program to the old one.
    for (let i = 0, node: any; node = code.body[i]; i++) {
      state.node.body.push(node);
    }
    state.done = false;
  };

  /**
   * Execute one step of the interpreter.
   * @return {boolean} True if a step was executed, false if no more instructions.
   */
  step(): boolean {
    const state = this.stateStack[0];
    if (!state || state.node.type == 'Program' && state.done) {
      return false;
    } else if (this.paused_) {
      return true;
    }

    switch(state.node.type) {
      case 'ArrayExpression': {
        this.stepArrayExpression();
        break;
      }
      case 'AssignmentExpression': {
        this.stepAssignmentExpression();
        break;
      }
      case 'BinaryExpression': {
        this.stepBinaryExpression();
        break;
      }
      case 'BlockStatement': {
        this.stepBlockStatement();
        break;
      }
      case 'BreakStatement': {
        this.stepBreakStatement();
        break;
      }
      case 'CallExpression': {
        this.stepCallExpression();
        break;
      }
      case 'CatchClause': {
        this.stepCatchClause();
        break;
      }
      case 'ConditionalExpression': {
        this.stepConditionalExpression();
        break;
      }
      case 'ContinueStatement': {
        this.stepContinueStatement();
        break;
      }
      case 'DoWhileStatement': {
        this.stepDoWhileStatement();
        break;
      }
      case 'EmptyStatement': {
        this.stepEmptyStatement();
        break;
      }
      case 'Eval_': {
        this.stepEval_();
        break;
      }
      case 'ExpressionStatement': {
        this.stepExpressionStatement();
        break;
      }
      case 'ForInStatement': {
        this.stepForInStatement();
        break;
      }
      case 'ForStatement': {
        this.stepForStatement();
        break;
      }
      case 'FunctionDeclaration': {
        this.stepFunctionDeclaration();
        break;
      }
      case 'FunctionExpression': {
        this.stepFunctionExpression();
        break;
      }
      case 'Identifier': {
        this.stepIdentifier();
        break;
      }
      case 'IfStatement': {
        this.stepIfStatement();
        break;
      }
      case 'LabeledStatement': {
        this.stepLabeledStatement();
        break;
      }
      case 'Literal': {
        this.stepLiteral();
        break;
      }
      case 'LogicalExpression': {
        this.stepLogicalExpression();
        break;
      }
      case 'MemberExpression': {
        this.stepMemberExpression();
        break;
      }
      case 'NewExpression': {
        this.stepNewExpression();
        break;
      }
      case 'ObjectExpression': {
        this.stepObjectExpression();
        break;
      }
      case 'Program': {
        this.stepProgram();
        break;
      }
      case 'ReturnStatement': {
        this.stepReturnStatement();
        break;
      }
      case 'SequenceExpression': {
        this.stepSequenceExpression();
        break;
      }
      case 'SwitchStatement': {
        this.stepSwitchStatement();
        break;
      }
      case 'ThisExpression': {
        this.stepThisExpression();
        break;
      }
      case 'ThrowStatement': {
        this.stepThrowStatement();
        break;
      }
      case 'TryStatement': {
        this.stepTryStatement();
        break;
      }
      case 'UnaryExpression': {
        this.stepUnaryExpression();
        break;
      }
      case 'UpdateExpression': {
        this.stepUpdateExpression();
        break;
      }
      case 'VariableDeclaration': {
        this.stepVariableDeclaration();
        break;
      }
      case 'VariableDeclarator': {
        this.stepVariableDeclarator();
        break;
      }
      case 'WithStatement': {
        this.stepWithStatement();
        break;
      }
      case 'WhileStatement': {
        this.stepWhileStatement();
        break;
      }
      default: {
        throw Error(`invalid node: ${state.node.type}`);
      }
    }

    if (!state.node.end) {
      // This is polyfill code. Keep executing until we arrive at user code.
      return this.step();
    }

    return true;
  };

  /**
   * Execute the interpreter to program completion. Vulnerable to infinite loops.
   * @return {boolean} True if a execution is asynchonously blocked,
   *     false if no more instructions.
   */
  run() {
    while (!this.paused_ && this.step()) {}
    return this.paused_;
  };

  /**
   * Initialize the global scope with buitin properties and functions.
   * @param {!JsObject} scope Global scope.
   */
  initGlobalScope(scope: JsObject) {
    // Initialize uneditable global properties.
    this.setProperty(scope, 'Infinity', this.createPrimitive(Infinity), READONLY_DESCRIPTOR);
    this.setProperty(scope, 'NaN', this.NAN, READONLY_DESCRIPTOR);
    this.setProperty(scope, 'undefined', this.UNDEFINED, READONLY_DESCRIPTOR);
    this.setProperty(scope, 'window', scope, READONLY_DESCRIPTOR);
    this.setProperty(scope, 'self', scope); // Editable.

    // Initialize global objects.
    this.initFunction(scope);
    this.initObject(scope);

    // Unable to set scope's parent prior (this.OBJECT did not exist).
    scope.parent = this.OBJECT;
    this.initArray(scope);
    this.initNumber(scope);
    this.initString(scope);
    this.initBoolean(scope);
    this.initDate(scope);
    this.initMath(scope);
    this.initRegExp(scope);
    this.initJSON(scope);
    this.initError(scope);

    // Initialize global functions.
    this.setProperty(scope, 'isNaN', this.createNativeFunction((num: any) => {
      num = num || this.UNDEFINED;
      return this.createPrimitive(isNaN(num.toNumber()));
    }));

    this.setProperty(scope, 'isFinite', this.createNativeFunction((num: any) => {
      num = num || this.UNDEFINED;
      return this.createPrimitive(isFinite(num.toNumber()));
    }));

    this.setProperty(scope, 'parseFloat', this.getProperty(this.NUMBER, 'parseFloat'));
    this.setProperty(scope, 'parseInt', this.getProperty(this.NUMBER, 'parseInt'));

    const func = this.createObject(this.FUNCTION);
    func.eval = true;
    this.setProperty(func, 'length', this.NUMBER_ONE, READONLY_DESCRIPTOR);
    this.setProperty(scope, 'eval', func);

    this.setProperty(scope, 'decodeURI', this.createUriFunction(decodeURI));
    this.setProperty(scope, 'decodeURIComponent', this.createUriFunction(decodeURIComponent));
    this.setProperty(scope, 'encodeURI', this.createUriFunction(encodeURI));
    this.setProperty(scope, 'encodeURIComponent', this.createUriFunction(encodeURIComponent));

    // Run any user-provided initialization.
    if (this.initFunc_) {
      this.initFunc_(this, scope);
    }
  };

  private createUriFunction(fn: (str: string) => string) {
    return this.createNativeFunction((str: any) => {
      str = (str || this.UNDEFINED).toString();
      try {
        str = fn(str);
      } catch (e) {
        // decodeURI('%xy') will throw an error.  Catch and rethrow.
        this.throwException(this.URI_ERROR, e.message);
      }
      return this.createPrimitive(str);
    });
  }

  /**
   * Initialize the Function class.
   * @param {!JsObject} scope Global scope.
   */
  initFunction(scope: any) {
    const thisInterpreter = this;
    let wrapper: any;
    // Function constructor.
    wrapper = function(var_args: any) {
      let newFunc: any;
      let code: any;
      if (this.parent == thisInterpreter.FUNCTION) {
        // Called with new.
        newFunc = this;
      } else {
        newFunc = thisInterpreter.createObject(thisInterpreter.FUNCTION);
      }
      if (arguments.length) {
        code = arguments[arguments.length - 1].toString();
      } else {
        code = '';
      }
      let args: any = [];
      for (let i = 0; i < arguments.length - 1; i++) {
        args.push(arguments[i].toString());
      }
      args = args.join(', ');
      if (args.indexOf(')') != -1) {
        throw SyntaxError('Function arg string contains parenthesis');
      }
      // Interestingly, the scope for constructed functions is the global scope,
      // even if they were constructed in some other scope.
      newFunc.parentScope = thisInterpreter.stateStack[thisInterpreter.stateStack.length - 1].scope;
      const ast = acorn.parse('$ = function(' + args + ') {' + code + '};', PARSE_OPTIONS);
      const statement = <ExpressionStatement> ast.body[0];
      const expression = <AssignmentExpression> statement.expression;
      newFunc.node = expression.right;
      thisInterpreter.setProperty(newFunc, 'length',
          thisInterpreter.createPrimitive(newFunc.node.length),
          READONLY_DESCRIPTOR);
      return newFunc;
    };
    this.FUNCTION = this.createObject(null);
    this.setProperty(scope, 'Function', this.FUNCTION);
    // Manually setup type and prototype because createObj doesn't recognize
    // this object as a function (this.FUNCTION did not exist).
    this.FUNCTION.type = 'function';
    this.setProperty(this.FUNCTION, 'prototype', this.createObject(null));
    this.FUNCTION.nativeFunc = wrapper;

    wrapper = function(thisArg: any, args: any) {
      const state = thisInterpreter.stateStack[0];
      // Rewrite the current 'CallExpression' to apply a different function.
      state.func_ = this;
      // Assign the 'this' object.
      state.funcThis_ = thisArg;
      // Bind any provided arguments.
      state.arguments = [];
      if (args) {
        if (utils.isa(args, thisInterpreter.ARRAY)) {
          for (let i = 0; i < args.length; i++) {
            state.arguments[i] = thisInterpreter.getProperty(args, i);
          }
        } else {
          thisInterpreter.throwException(thisInterpreter.TYPE_ERROR,
              'CreateListFromArrayLike called on non-object');
        }
      }
      state.doneArgs_ = true;
      state.doneExec_ = false;
    };
    this.setNativeFunctionPrototype(this.FUNCTION, 'apply', wrapper);

    wrapper = function(thisArg: any, var_args: any) {
      const state = thisInterpreter.stateStack[0];
      // Rewrite the current 'CallExpression' to call a different function.
      state.func_ = this;
      // Assign the 'this' object.
      state.funcThis_ = thisArg;
      // Bind any provided arguments.
      state.arguments = [];
      for (let i = 1; i < arguments.length; i++) {
        state.arguments.push(arguments[i]);
      }
      state.doneArgs_ = true;
      state.doneExec_ = false;
    };
    this.setNativeFunctionPrototype(this.FUNCTION, 'call', wrapper);

    wrapper = function(thisArg: any, var_args: any) {
      // Clone function
      const clone = thisInterpreter.createFunction(this.node, this.parentScope);
      // Assign the 'this' object.
      if (thisArg) {
        clone.boundThis_ = thisArg;
      }
      // Bind any provided arguments.
      clone.boundArgs_ = [];
      for (let i = 1; i < arguments.length; i++) {
        clone.boundArgs_.push(arguments[i]);
      }
      return clone;
    };
    this.setNativeFunctionPrototype(this.FUNCTION, 'bind', wrapper);
    // Function has no parent to inherit from, so it needs its own mandatory
    // toString and valueOf functions.
    wrapper = function() {
      return thisInterpreter.createPrimitive(this.toString());
    };
    this.setNativeFunctionPrototype(this.FUNCTION, 'toString', wrapper);
    this.setProperty(this.FUNCTION, 'toString',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);
    wrapper = function() {
      return thisInterpreter.createPrimitive(this.valueOf());
    };
    this.setNativeFunctionPrototype(this.FUNCTION, 'valueOf', wrapper);
    this.setProperty(this.FUNCTION, 'valueOf',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);
  };

  /**
   * Initialize the Object class.
   * @param {!JsObject} scope Global scope.
   */
  initObject(scope: any) {
    const thisInterpreter = this;
    let wrapper: any;
    // Object constructor.
    wrapper = function(value: any) {
      if (!value || value == thisInterpreter.UNDEFINED ||
          value == thisInterpreter.NULL) {
        // Create a new object.
        if (this.parent == thisInterpreter.OBJECT) {
          // Called with new.
          return this;
        } else {
          return thisInterpreter.createObject(thisInterpreter.OBJECT);
        }
      }
      if (value.isPrimitive) {
        // Wrap the value as an object.
        const obj = thisInterpreter.createObject(value.parent);
        obj.data = value.data;
        return obj;
      }
      // Return the provided object.
      return value;
    };
    this.OBJECT = this.createNativeFunction(wrapper);
    this.setProperty(scope, 'Object', this.OBJECT);

    // Static methods on Object.
    wrapper = function(obj: any) {
      const pseudoList = thisInterpreter.createObject(thisInterpreter.ARRAY);
      let i = 0;
      for (const key in obj.properties) {
        thisInterpreter.setProperty(pseudoList, i,
            thisInterpreter.createPrimitive(key));
        i++;
      }
      return pseudoList;
    };
    this.setProperty(this.OBJECT, 'getOwnPropertyNames',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    wrapper = function(obj: any) {
      const pseudoList = thisInterpreter.createObject(thisInterpreter.ARRAY);
      let i = 0;
      for (const key in obj.properties) {
        if (obj.notEnumerable[key]) {
          continue;
        }
        thisInterpreter.setProperty(pseudoList, i,
            thisInterpreter.createPrimitive(key));
        i++;
      }
      return pseudoList;
    };
    this.setProperty(this.OBJECT, 'keys',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    wrapper = function(obj: any, prop: any, descriptor: any) {
      prop = (prop || thisInterpreter.UNDEFINED).toString();
      if (!(descriptor instanceof JsObject)) {
        thisInterpreter.throwException(thisInterpreter.TYPE_ERROR,
            'Property description must be an object.');
        return;
      }
      if (!obj.properties[prop] && obj.preventExtensions) {
        thisInterpreter.throwException(thisInterpreter.TYPE_ERROR,
            'Can\'t define property ' + prop + ', object is not extensible');
        return;
      }
      let value = thisInterpreter.getProperty(descriptor, 'value');
      if (value == thisInterpreter.UNDEFINED) {
        value = null;
      }
      const get = thisInterpreter.getProperty(descriptor, 'get');
      const set = thisInterpreter.getProperty(descriptor, 'set');
      const nativeDescriptor = {
        configurable: thisInterpreter.pseudoToNative(
            thisInterpreter.getProperty(descriptor, 'configurable')),
        enumerable: thisInterpreter.pseudoToNative(
            thisInterpreter.getProperty(descriptor, 'enumerable')),
        writable: thisInterpreter.pseudoToNative(
            thisInterpreter.getProperty(descriptor, 'writable')),
        get: get == thisInterpreter.UNDEFINED ? undefined : get,
        set: set == thisInterpreter.UNDEFINED ? undefined : set
      };
      thisInterpreter.setProperty(obj, prop, value, nativeDescriptor);
      return obj;
    };
    this.setProperty(this.OBJECT, 'defineProperty',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    this.polyfills_.push(
  "Object.defineProperty(Array.prototype, 'defineProperties', {configurable: true, value:",
    "function(obj, props) {",
      "var keys = Object.keys(props);",
      "for (var i = 0; i < keys.length; i++) {",
        "Object.defineProperty(obj, keys[i], props[keys[i]]);",
      "}",
      "return obj;",
    "}",
  "});",
  "");

    wrapper = function(obj: any, prop: any) {
      prop = (prop || thisInterpreter.UNDEFINED).toString();
      if (!(prop in obj.properties)) {
        return thisInterpreter.UNDEFINED;
      }
      const configurable = !obj.notConfigurable[prop];
      const enumerable = !obj.notEnumerable[prop];
      const writable = !obj.notWritable[prop];
      const getter = obj.getter[prop];
      const setter = obj.setter[prop];

      const descriptor = thisInterpreter.createObject(thisInterpreter.OBJECT);
      thisInterpreter.setProperty(descriptor, 'configurable',
          thisInterpreter.createPrimitive(configurable));
      thisInterpreter.setProperty(descriptor, 'enumerable',
          thisInterpreter.createPrimitive(enumerable));
      if (getter || setter) {
        thisInterpreter.setProperty(descriptor, 'getter', getter);
        thisInterpreter.setProperty(descriptor, 'setter', setter);
      } else {
        thisInterpreter.setProperty(descriptor, 'writable',
            thisInterpreter.createPrimitive(writable));
        thisInterpreter.setProperty(descriptor, 'value',
            thisInterpreter.getProperty(obj, prop));
      }
      return descriptor;
    };
    this.setProperty(this.OBJECT, 'getOwnPropertyDescriptor',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    wrapper = function(obj: any) {
      if (obj.parent && obj.parent.properties &&
          obj.parent.properties.prototype) {
        return obj.parent.properties.prototype;
      }
      return thisInterpreter.NULL;
    };
    this.setProperty(this.OBJECT, 'getPrototypeOf',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    wrapper = function(obj: any) {
      return thisInterpreter.createPrimitive(!obj.preventExtensions);
    };
    this.setProperty(this.OBJECT, 'isExtensible',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    wrapper = function(obj: any) {
      if (!obj.isPrimitive) {
        obj.preventExtensions = true;
      }
      return obj;
    };
    this.setProperty(this.OBJECT, 'preventExtensions',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    // Instance methods on Object.
    wrapper = function() {
      return thisInterpreter.createPrimitive(this.toString());
    };
    this.setNativeFunctionPrototype(this.OBJECT, 'toString', wrapper);

    wrapper = function() {
      return thisInterpreter.createPrimitive(this.toString());
    };
    this.setNativeFunctionPrototype(this.OBJECT, 'toLocaleString', wrapper);

    wrapper = function() {
      return thisInterpreter.createPrimitive(this.valueOf());
    };
    this.setNativeFunctionPrototype(this.OBJECT, 'valueOf', wrapper);

    wrapper = function(prop: any) {
      prop = (prop || thisInterpreter.UNDEFINED).toString();
      return (prop in this.properties) ?
          thisInterpreter.TRUE : thisInterpreter.FALSE;
    };
    this.setNativeFunctionPrototype(this.OBJECT, 'hasOwnProperty', wrapper);

    wrapper = function(prop: any) {
      prop = (prop || thisInterpreter.UNDEFINED).toString();
      const enumerable = prop in this.properties && !this.notEnumerable[prop];
      return thisInterpreter.createPrimitive(enumerable);
    };
    this.setNativeFunctionPrototype(this.OBJECT, 'propertyIsEnumerable', wrapper);

    wrapper = function(obj: any) {
      while (true) {
        if (obj.parent && obj.parent.properties &&
            obj.parent.properties.prototype) {
          obj = obj.parent.properties.prototype;
          if (obj == this) {
            return thisInterpreter.createPrimitive(true);
          }
        } else {
          // No parent, reached the top.
          return thisInterpreter.createPrimitive(false);
        }
      }
    };
    this.setNativeFunctionPrototype(this.OBJECT, 'isPrototypeOf',  wrapper);
  };

  /**
   * Initialize the Array class.
   * @param {!JsObject} scope Global scope.
   */
  initArray(scope: any) {
    const thisInterpreter = this;
    const getInt = function(obj: any, def: any) {
      // Return an integer, or the default.
      let n = obj ? Math.floor(obj.toNumber()) : def;
      if (isNaN(n)) {
        n = def;
      }
      return n;
    };

    let wrapper: any;
    // Array constructor.
    wrapper = function(var_args: any) {
      let newArray: any;
      if (this.parent == thisInterpreter.ARRAY) {
        // Called with new.
        newArray = this;
      } else {
        newArray = thisInterpreter.createObject(thisInterpreter.ARRAY);
      }

      const first = arguments[0];
      if (first && first.type == 'number') {
        if (isNaN(utils.arrayIndex(first))) {
          thisInterpreter.throwException(thisInterpreter.RANGE_ERROR, 'Invalid array length');
        }
        newArray.length = first.data;
      } else {
        let i: number;
        for (i = 0; i < arguments.length; i++) {
          newArray.properties[i] = arguments[i];
        }
        newArray.length = i;
      }

      return newArray;
    };
    this.ARRAY = this.createNativeFunction(wrapper);
    this.setProperty(scope, 'Array', this.ARRAY);

    // Static methods on Array.
    wrapper = function(obj: any) {
      return thisInterpreter.createPrimitive(utils.isa(obj, thisInterpreter.ARRAY));
    };
    this.setProperty(this.ARRAY, 'isArray',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    // Instance methods on Array.
    wrapper = function() {
      let value: any;
      if (this.length) {
        value = this.properties[this.length - 1];
        delete this.properties[this.length - 1];
        this.length--;
      } else {
        value = thisInterpreter.UNDEFINED;
      }
      return value;
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'pop', wrapper);

    wrapper = function(var_args: any) {
      for (let i = 0; i < arguments.length; i++) {
        this.properties[this.length] = arguments[i];
        this.length++;
      }
      return thisInterpreter.createPrimitive(this.length);
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'push', wrapper);

    wrapper = function() {
      let value: any;

      if (this.length) {
        value = this.properties[0];
        for (let i = 1; i < this.length; i++) {
          this.properties[i - 1] = this.properties[i];
        }
        this.length--;
        delete this.properties[this.length];
      } else {
        value = thisInterpreter.UNDEFINED;
      }
      return value;
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'shift', wrapper);

    wrapper = function(var_args: any) {
      for (let i = this.length - 1; i >= 0; i--) {
        this.properties[i + arguments.length] = this.properties[i];
      }
      this.length += arguments.length;
      for (let i = 0; i < arguments.length; i++) {
        this.properties[i] = arguments[i];
      }
      return thisInterpreter.createPrimitive(this.length);
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'unshift', wrapper);

    wrapper = function() {
      for (let i = 0; i < this.length / 2; i++) {
        const tmp = this.properties[this.length - i - 1];
        this.properties[this.length - i - 1] = this.properties[i];
        this.properties[i] = tmp;
      }
      return this;
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'reverse', wrapper);

    wrapper = function(index: any, howmany: any, var_args: any) {
      index = getInt(index, 0);
      if (index < 0) {
        index = Math.max(this.length + index, 0);
      } else {
        index = Math.min(index, this.length);
      }
      howmany = getInt(howmany, Infinity);
      howmany = Math.min(howmany, this.length - index);
      const removed = thisInterpreter.createObject(thisInterpreter.ARRAY);
      // Remove specified elements.
      for (let i = index; i < index + howmany; i++) {
        removed.properties[removed.length++] = this.properties[i];
        this.properties[i] = this.properties[i + howmany];
      }
      // Move other element to fill the gap.
      for (let i = index + howmany; i < this.length - howmany; i++) {
        this.properties[i] = this.properties[i + howmany];
      }
      // Delete superfluous properties.
      for (let i = this.length - howmany; i < this.length; i++) {
        delete this.properties[i];
      }
      this.length -= howmany;
      // Insert specified items.
      for (let i = this.length - 1; i >= index; i--) {
        this.properties[i + arguments.length - 2] = this.properties[i];
      }
      this.length += arguments.length - 2;
      for (let i = 2; i < arguments.length; i++) {
        this.properties[index + i - 2] = arguments[i];
      }
      return removed;
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'splice', wrapper);

    wrapper = function(opt_begin: any, opt_end: any) {
      const list = thisInterpreter.createObject(thisInterpreter.ARRAY);
      let begin = getInt(opt_begin, 0);
      if (begin < 0) {
        begin = this.length + begin;
      }
      begin = Math.max(0, Math.min(begin, this.length));
      let end = getInt(opt_end, this.length);
      if (end < 0) {
        end = this.length + end;
      }
      end = Math.max(0, Math.min(end, this.length));
      let length = 0;
      for (let i = begin; i < end; i++) {
        const element = thisInterpreter.getProperty(this, i);
        thisInterpreter.setProperty(list, length++, element);
      }
      return list;
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'slice', wrapper);

    wrapper = function(opt_separator: any) {
      let sep: any;
      if (!opt_separator || opt_separator.data === undefined) {
        sep = undefined;
      } else {
        sep = opt_separator.toString();
      }
      const text: any[] = [];
      for (let i = 0; i < this.length; i++) {
        text[i] = this.properties[i];
      }
      return thisInterpreter.createPrimitive(text.join(sep));
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'join', wrapper);

    wrapper = function(var_args: any) {
      const list = thisInterpreter.createObject(thisInterpreter.ARRAY);
      let length = 0;
      // Start by copying the current array.
      for (let i = 0; i < this.length; i++) {
        const element = thisInterpreter.getProperty(this, i);
        thisInterpreter.setProperty(list, length++, element);
      }
      // Loop through all arguments and copy them in.
      for (let i = 0; i < arguments.length; i++) {
        const value = arguments[i];
        if (utils.isa(value, thisInterpreter.ARRAY)) {
          for (let j = 0; j < value.length; j++) {
            const element = thisInterpreter.getProperty(value, j);
            thisInterpreter.setProperty(list, length++, element);
          }
        } else {
          thisInterpreter.setProperty(list, length++, value);
        }
      }
      return list;
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'concat', wrapper);

    wrapper = function(searchElement: any, opt_fromIndex: any) {
      searchElement = searchElement || thisInterpreter.UNDEFINED;
      let fromIndex = getInt(opt_fromIndex, 0);
      if (fromIndex < 0) {
        fromIndex = this.length + fromIndex;
      }
      fromIndex = Math.max(0, fromIndex);
      for (let i = fromIndex; i < this.length; i++) {
        const element = thisInterpreter.getProperty(this, i);
        if (utils.strictComp(element, searchElement)) {
          return thisInterpreter.createPrimitive(i);
        }
      }
      return thisInterpreter.createPrimitive(-1);
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'indexOf', wrapper);

    wrapper = function(searchElement: any, opt_fromIndex: any) {
      searchElement = searchElement || thisInterpreter.UNDEFINED;
      let fromIndex = getInt(opt_fromIndex, this.length);
      if (fromIndex < 0) {
        fromIndex = this.length + fromIndex;
      }
      fromIndex = Math.min(fromIndex, this.length - 1);
      for (let i = fromIndex; i >= 0; i--) {
        const element = thisInterpreter.getProperty(this, i);
        if (utils.strictComp(element, searchElement)) {
          return thisInterpreter.createPrimitive(i);
        }
      }
      return thisInterpreter.createPrimitive(-1);
    };
    this.setNativeFunctionPrototype(this.ARRAY, 'lastIndexOf', wrapper);

    this.polyfills_.push(
  // Polyfill copied from:
  // developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/every
  "Object.defineProperty(Array.prototype, 'every', {configurable: true, value:",
    "function(callbackfn, thisArg) {",
      "if (this == null || typeof callbackfn !== 'function') throw new TypeError;",
      "var T, k;",
      "var O = Object(this);",
      "var len = O.length >>> 0;",
      "if (arguments.length > 1) T = thisArg;",
      "k = 0;",
      "while (k < len) {",
        "if (k in O && !callbackfn.call(T, O[k], k, O)) return false;",
        "k++;",
      "}",
      "return true;",
    "}",
  "});",

  // Polyfill copied from:
  // developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
  "Object.defineProperty(Array.prototype, 'filter', {configurable: true, value:",
    "function(fun/*, thisArg*/) {",
      "if (this === void 0 || this === null || typeof fun !== 'function') throw new TypeError;",
      "var t = Object(this);",
      "var len = t.length >>> 0;",
      "var res = [];",
      "var thisArg = arguments.length >= 2 ? arguments[1] : void 0;",
      "for (var i = 0; i < len; i++) {",
        "if (i in t) {",
          "var val = t[i];",
          "if (fun.call(thisArg, val, i, t)) res.push(val);",
        "}",
      "}",
      "return res;",
    "}",
  "});",

  // Polyfill copied from:
  // developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach
  "Object.defineProperty(Array.prototype, 'forEach', {configurable: true, value:",
    "function(callback, thisArg) {",
      "if (this == null || typeof callback !== 'function') throw new TypeError;",
      "var T, k;",
      "var O = Object(this);",
      "var len = O.length >>> 0;",
      "if (arguments.length > 1) T = thisArg;",
      "k = 0;",
      "while (k < len) {",
        "if (k in O) callback.call(T, O[k], k, O);",
        "k++;",
      "}",
    "}",
  "});",

  // Polyfill copied from:
  // developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/map
  "Object.defineProperty(Array.prototype, 'map', {configurable: true, value:",
    "function(callback, thisArg) {",
      "if (this == null || typeof callback !== 'function') new TypeError;",
      "var T, A, k;",
      "var O = Object(this);",
      "var len = O.length >>> 0;",
      "if (arguments.length > 1) T = thisArg;",
      "A = new Array(len);",
      "k = 0;",
      "while (k < len) {",
        "if (k in O) A[k] = callback.call(T, O[k], k, O);",
        "k++;",
      "}",
      "return A;",
    "}",
  "});",

  // Polyfill copied from:
  // developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce
  "Object.defineProperty(Array.prototype, 'reduce', {configurable: true, value:",
    "function(callback /*, initialValue*/) {",
      "if (this == null || typeof callback !== 'function') throw new TypeError;",
      "var t = Object(this), len = t.length >>> 0, k = 0, value;",
      "if (arguments.length == 2) {",
        "value = arguments[1];",
      "} else {",
        "while (k < len && !(k in t)) k++;",
        "if (k >= len) {",
          "throw new TypeError('Reduce of empty array with no initial value');",
        "}",
        "value = t[k++];",
      "}",
      "for (; k < len; k++) {",
        "if (k in t) value = callback(value, t[k], k, t);",
      "}",
      "return value;",
    "}",
  "});",

  // Polyfill copied from:
  // developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/ReduceRight
  "Object.defineProperty(Array.prototype, 'reduceRight', {configurable: true, value:",
    "function(callback /*, initialValue*/) {",
      "if (null === this || 'undefined' === typeof this || 'function' !== typeof callback) throw new TypeError;",
      "var t = Object(this), len = t.length >>> 0, k = len - 1, value;",
      "if (arguments.length >= 2) {",
        "value = arguments[1];",
      "} else {",
        "while (k >= 0 && !(k in t)) k--;",
        "if (k < 0) {",
          "throw new TypeError('Reduce of empty array with no initial value');",
        "}",
        "value = t[k--];",
      "}",
      "for (; k >= 0; k--) {",
        "if (k in t) value = callback(value, t[k], k, t);",
      "}",
      "return value;",
    "}",
  "});",

  // Polyfill copied from:
  // developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array/some
  "Object.defineProperty(Array.prototype, 'some', {configurable: true, value:",
    "function(fun/*, thisArg*/) {",
      "if (this == null || typeof fun !== 'function') throw new TypeError;",
      "var t = Object(this);",
      "var len = t.length >>> 0;",
      "var thisArg = arguments.length >= 2 ? arguments[1] : void 0;",
      "for (var i = 0; i < len; i++) {",
        "if (i in t && fun.call(thisArg, t[i], i, t)) {",
          "return true;",
        "}",
      "}",
      "return false;",
    "}",
  "});",

  "Object.defineProperty(Array.prototype, 'sort', {configurable: true, value:",
    "function(opt_comp) {",
      "for (var i = 0; i < this.length; i++) {",
        "var changes = 0;",
        "for (var j = 0; j < this.length - i - 1; j++) {",
          "if (opt_comp ?" +
              "opt_comp(this[j], this[j + 1]) > 0 : this[j] > this[j + 1]) {",
            "var swap = this[j];",
            "this[j] = this[j + 1];",
            "this[j + 1] = swap;",
            "changes++;",
          "}",
        "}",
        "if (changes <= 1) break;",
      "}",
      "return this;",
    "}",
  "});",

  "Object.defineProperty(Array.prototype, 'toLocaleString', {configurable: true, value:",
    "function() {",
      "var out = [];",
      "for (var i = 0; i < this.length; i++) {",
        "out[i] = (this[i] === null || this[i] === undefined) ? '' : this[i].toLocaleString();",
      "}",
      "return out.join(',');",
    "}",
  "});",
  "");
  };

  /**
   * Initialize the Number class.
   * @param {!JsObject} scope Global scope.
   */
  initNumber(scope: any) {
    const thisInterpreter = this;
    let wrapper: any;
    // Number constructor.
    wrapper = function(value: any) {
      value = value ? value.toNumber() : 0;
      if (this.parent != thisInterpreter.NUMBER) {
        // Called as Number().
        return thisInterpreter.createPrimitive(value);
      }
      // Called as new Number().
      this.data = value;
      return this;
    };
    this.NUMBER = this.createNativeFunction(wrapper);
    this.setProperty(scope, 'Number', this.NUMBER);

    this.setProperty(this.NUMBER, 'MAX_VALUE', this.createPrimitive(Number.MAX_VALUE));
    this.setProperty(this.NUMBER, 'MIN_VALUE', this.createPrimitive(Number.MIN_VALUE));
    this.setProperty(this.NUMBER, 'NaN', this.createPrimitive(Number.NaN));
    this.setProperty(this.NUMBER, 'NEGATIVE_INFINITY', this.createPrimitive(Number.NEGATIVE_INFINITY));
    this.setProperty(this.NUMBER, 'POSITIVE_INFINITY', this.createPrimitive(Number.POSITIVE_INFINITY));

    // Static methods on Number.
    wrapper = function(str: any) {
      str = str || thisInterpreter.UNDEFINED;
      return thisInterpreter.createPrimitive(parseFloat(str.toString()));
    };
    this.setProperty(this.NUMBER, 'parseFloat', this.createNativeFunction(wrapper));

    wrapper = function(str: any, radix: any) {
      str = str || thisInterpreter.UNDEFINED;
      radix = radix || thisInterpreter.UNDEFINED;
      return thisInterpreter.createPrimitive(
          parseInt(str.toString(), radix.toNumber()));
    };
    this.setProperty(this.NUMBER, 'parseInt', this.createNativeFunction(wrapper));

    // Instance methods on Number.
    wrapper = function(fractionDigits: any) {
      fractionDigits = fractionDigits ? fractionDigits.toNumber() : undefined;
      const n = this.toNumber();
      return thisInterpreter.createPrimitive(n.toExponential(fractionDigits));
    };
    this.setNativeFunctionPrototype(this.NUMBER, 'toExponential', wrapper);

    wrapper = function(digits: any) {
      digits = digits ? digits.toNumber() : undefined;
      const n = this.toNumber();
      return thisInterpreter.createPrimitive(n.toFixed(digits));
    };
    this.setNativeFunctionPrototype(this.NUMBER, 'toFixed', wrapper);

    wrapper = function(precision: any) {
      precision = precision ? precision.toNumber() : undefined;
      const n = this.toNumber();
      return thisInterpreter.createPrimitive(n.toPrecision(precision));
    };
    this.setNativeFunctionPrototype(this.NUMBER, 'toPrecision', wrapper);

    wrapper = function(radix: any) {
      radix = radix ? radix.toNumber() : 10;
      const n = this.toNumber();
      return thisInterpreter.createPrimitive(n.toString(radix));
    };
    this.setNativeFunctionPrototype(this.NUMBER, 'toString', wrapper);

    wrapper = function(locales: any, options: any) {
      locales = locales ? thisInterpreter.pseudoToNative(locales) : undefined;
      options = options ? thisInterpreter.pseudoToNative(options) : undefined;
      return thisInterpreter.createPrimitive(
          this.toNumber().toLocaleString(locales, options));
    };
    this.setNativeFunctionPrototype(this.NUMBER, 'toLocaleString', wrapper);
  };

  /**
   * Initialize the String class.
   * @param {!JsObject} scope Global scope.
   */
  initString(scope: any) {
    const thisInterpreter = this;
    let wrapper: any;
    // String constructor.
    wrapper = function(value: any) {
      value = value ? value.toString() : '';
      if (this.parent != thisInterpreter.STRING) {
        // Called as String().
        return thisInterpreter.createPrimitive(value);
      }
      // Called as new String().
      this.data = value;
      return this;
    };
    this.STRING = this.createNativeFunction(wrapper);
    this.setProperty(scope, 'String', this.STRING);

    // Static methods on String.
    wrapper = function(var_args: any) {
      for (let i = 0; i < arguments.length; i++) {
        arguments[i] = arguments[i].toNumber();
      }
      return thisInterpreter.createPrimitive(String.fromCharCode.apply(String, arguments));
    };
    this.setProperty(this.STRING, 'fromCharCode', this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    // Instance methods on String.
    // Methods with no arguments.
    let functions = ['toLowerCase', 'toUpperCase',
                    'toLocaleLowerCase', 'toLocaleUpperCase'];
    for (let i = 0; i < functions.length; i++) {
      wrapper = (function(nativeFunc: any) {
        return function() {
          return thisInterpreter.createPrimitive(nativeFunc.apply(this));
        };
      })(String.prototype[functions[i]]);
      this.setNativeFunctionPrototype(this.STRING, functions[i], wrapper);
    }

    // Trim function may not exist in host browser.  Write them from scratch.
    wrapper = function() {
      const str = this.toString();
      return thisInterpreter.createPrimitive(str.replace(/^\s+|\s+$/g, ''));
    };
    this.setNativeFunctionPrototype(this.STRING, 'trim', wrapper);
    wrapper = function() {
      const str = this.toString();
      return thisInterpreter.createPrimitive(str.replace(/^\s+/g, ''));
    };
    this.setNativeFunctionPrototype(this.STRING, 'trimLeft', wrapper);
    wrapper = function() {
      const str = this.toString();
      return thisInterpreter.createPrimitive(str.replace(/\s+$/g, ''));
    };
    this.setNativeFunctionPrototype(this.STRING, 'trimRight', wrapper);

    // Methods with only numeric arguments.
    functions = ['charAt', 'charCodeAt', 'substring', 'slice', 'substr'];
    for (let i = 0; i < functions.length; i++) {
      wrapper = (function(nativeFunc: any) {
        return function() {
          for (let j = 0; j < arguments.length; j++) {
            arguments[j] = arguments[j].toNumber();
          }
          return thisInterpreter.createPrimitive(
              nativeFunc.apply(this, arguments));
        };
      })(String.prototype[functions[i]]);
      this.setNativeFunctionPrototype(this.STRING, functions[i], wrapper);
    }

    wrapper = function(searchValue: any, fromIndex: any) {
      const str = this.toString();
      searchValue = (searchValue || thisInterpreter.UNDEFINED).toString();
      fromIndex = fromIndex ? fromIndex.toNumber() : undefined;
      return thisInterpreter.createPrimitive(
          str.indexOf(searchValue, fromIndex));
    };
    this.setNativeFunctionPrototype(this.STRING, 'indexOf', wrapper);

    wrapper = function(searchValue: any, fromIndex: any) {
      const str = this.toString();
      searchValue = (searchValue || thisInterpreter.UNDEFINED).toString();
      fromIndex = fromIndex ? fromIndex.toNumber() : undefined;
      return thisInterpreter.createPrimitive(
          str.lastIndexOf(searchValue, fromIndex));
    };
    this.setNativeFunctionPrototype(this.STRING, 'lastIndexOf', wrapper);

    wrapper = function(compareString: any, locales: any, options: any) {
      compareString = (compareString || thisInterpreter.UNDEFINED).toString();
      locales = locales ? thisInterpreter.pseudoToNative(locales) : undefined;
      options = options ? thisInterpreter.pseudoToNative(options) : undefined;
      return thisInterpreter.createPrimitive(
          this.toString().localeCompare(compareString, locales, options));
    };
    this.setNativeFunctionPrototype(this.STRING, 'localeCompare', wrapper);

    wrapper = function(separator: any, limit: any) {
      const str = this.toString();
      if (separator) {
        separator = utils.isa(separator, thisInterpreter.REGEXP) ?
            separator.data : separator.toString();
      } else { // is this really necessary?
        separator = undefined;
      }
      limit = limit ? limit.toNumber() : undefined;
      const jsList = str.split(separator, limit);
      const pseudoList = thisInterpreter.createObject(thisInterpreter.ARRAY);
      for (let i = 0; i < jsList.length; i++) {
        thisInterpreter.setProperty(pseudoList, i,
            thisInterpreter.createPrimitive(jsList[i]));
      }
      return pseudoList;
    };
    this.setNativeFunctionPrototype(this.STRING, 'split', wrapper);

    wrapper = function(var_args: any) {
      let str = this.toString();
      for (let i = 0; i < arguments.length; i++) {
        str += arguments[i].toString();
      }
      return thisInterpreter.createPrimitive(str);
    };
    this.setNativeFunctionPrototype(this.STRING, 'concat', wrapper);

    wrapper = function(regexp: any) {
      const str = this.toString();
      regexp = regexp ? regexp.data : undefined;
      const match = str.match(regexp);
      if (match === null) {
        return thisInterpreter.NULL;
      }
      const pseudoList = thisInterpreter.createObject(thisInterpreter.ARRAY);
      for (let i = 0; i < match.length; i++) {
        thisInterpreter.setProperty(pseudoList, i,
            thisInterpreter.createPrimitive(match[i]));
      }
      return pseudoList;
    };
    this.setNativeFunctionPrototype(this.STRING, 'match', wrapper);

    wrapper = function(regexp: any) {
      const str = this.toString();
      regexp = regexp ? regexp.data : undefined;
      return thisInterpreter.createPrimitive(str.search(regexp));
    };
    this.setNativeFunctionPrototype(this.STRING, 'search', wrapper);

    wrapper = function(substr: any, newSubStr: any) {
      const str = this.toString();
      substr = (substr || thisInterpreter.UNDEFINED).valueOf();
      newSubStr = (newSubStr || thisInterpreter.UNDEFINED).toString();
      return thisInterpreter.createPrimitive(str.replace(substr, newSubStr));
    };
    this.setNativeFunctionPrototype(this.STRING, 'replace', wrapper);
  };

  /**
   * Initialize the Boolean class.
   * @param {!JsObject} scope Global scope.
   */
  initBoolean(scope: any) {
    const thisInterpreter = this;
    let wrapper: any;
    // Boolean constructor.
    wrapper = function(value: any) {
      value = value ? value.toBoolean() : false;
      if (this.parent != thisInterpreter.BOOLEAN) {
        // Called as Boolean().
        return thisInterpreter.createPrimitive(value);
      }
      // Called as new Boolean().
      this.data = value;
      return this;
    };
    this.BOOLEAN = this.createNativeFunction(wrapper);
    this.setProperty(scope, 'Boolean', this.BOOLEAN);
  };

  /**
   * Initialize the Date class.
   * @param {!JsObject} scope Global scope.
   */
  initDate(scope: any) {
    const thisInterpreter = this;
    let wrapper: any;
    // Date constructor.
    wrapper = function(a: any, b: any, c: any, d: any, e: any, f: any, h: any) {
      let newDate: any;
      if (this.parent == thisInterpreter.DATE) {
        // Called with new.
        newDate = this;
      } else {
        // Calling Date() as a function returns a string, no arguments are heeded.
        return thisInterpreter.createPrimitive(Date());
      }
      if (!arguments.length) {
        newDate.data = new Date();
      } else if (arguments.length == 1 && (a.type == 'string' ||
          utils.isa(a, thisInterpreter.STRING))) {
        newDate.data = new Date(a.toString());
      } else {
        const args: any = [null];
        for (let i = 0; i < arguments.length; i++) {
          args[i + 1] = arguments[i] ? arguments[i].toNumber() : undefined;
        }
        newDate.data = new (Function.prototype.bind.apply(Date, args));
      }
      return newDate;
    };
    this.DATE = this.createNativeFunction(wrapper);
    this.setProperty(scope, 'Date', this.DATE);

    // Static methods on Date.
    wrapper = function() {
      return thisInterpreter.createPrimitive(new Date().getTime());
    };
    this.setProperty(this.DATE, 'now',
        this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    wrapper = function(dateString: any) {
      dateString = dateString ? dateString.toString() : undefined;
      return thisInterpreter.createPrimitive(Date.parse(dateString));
    };
    this.setProperty(this.DATE, 'parse', this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    wrapper = function(a: any, b: any, c: any, d: any, e: any, f: any, h: any) {
      const args: any = [];
      for (let i = 0; i < arguments.length; i++) {
        args[i] = arguments[i] ? arguments[i].toNumber() : undefined;
      }
      return thisInterpreter.createPrimitive(Date.UTC.apply(Date, args));
    };
    this.setProperty(this.DATE, 'UTC', this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);

    // Instance methods on Date.
    const functions = ['getDate', 'getDay', 'getFullYear', 'getHours',
        'getMilliseconds', 'getMinutes', 'getMonth', 'getSeconds', 'getTime',
        'getTimezoneOffset', 'getUTCDate', 'getUTCDay', 'getUTCFullYear',
        'getUTCHours', 'getUTCMilliseconds', 'getUTCMinutes', 'getUTCMonth',
        'getUTCSeconds', 'getYear',
        'setDate', 'setFullYear', 'setHours', 'setMilliseconds',
        'setMinutes', 'setMonth', 'setSeconds', 'setTime', 'setUTCDate',
        'setUTCFullYear', 'setUTCHours', 'setUTCMilliseconds', 'setUTCMinutes',
        'setUTCMonth', 'setUTCSeconds', 'setYear',
        'toDateString', 'toISOString', 'toJSON', 'toGMTString',
        'toLocaleDateString', 'toLocaleString', 'toLocaleTimeString',
        'toTimeString', 'toUTCString'];
    for (let i = 0; i < functions.length; i++) {
      wrapper = (function(nativeFunc: any) {
        return function(var_args: any) {
          const args: any = [];
          for (let i = 0; i < arguments.length; i++) {
            args[i] = thisInterpreter.pseudoToNative(arguments[i]);
          }
          return thisInterpreter.createPrimitive(this.data[nativeFunc].apply(this.data, args));
        };
      })(functions[i]);
      this.setNativeFunctionPrototype(this.DATE, functions[i], wrapper);
    }
  };

  /**
   * Initialize Math object.
   * @param {!JsObject} scope Global scope.
   */
  initMath(scope: any) {
    const thisInterpreter = this;
    const myMath = this.createObject(this.OBJECT);
    this.setProperty(scope, 'Math', myMath);

    this.setProperty(myMath, 'E', this.createPrimitive(Math.E), READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(myMath, 'LN2', this.createPrimitive(Math.LN2), READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(myMath, 'LN10', this.createPrimitive(Math.LN10), READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(myMath, 'LOG2E', this.createPrimitive(Math.LOG2E), READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(myMath, 'LOG10E', this.createPrimitive(Math.LOG10E), READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(myMath, 'PI', this.createPrimitive(Math.PI), READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(myMath, 'SQRT1_2', this.createPrimitive(Math.SQRT1_2), READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(myMath, 'SQRT2', this.createPrimitive(Math.SQRT2), READONLY_NONENUMERABLE_DESCRIPTOR);

    const numFunctions = ['abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos',
                        'exp', 'floor', 'log', 'max', 'min', 'pow', 'random',
                        'round', 'sin', 'sqrt', 'tan'];
    for (let i = 0; i < numFunctions.length; i++) {
      const wrapper = (function(nativeFunc: any) {
        return function() {
          for (let j = 0; j < arguments.length; j++) {
            arguments[j] = arguments[j].toNumber();
          }
          return thisInterpreter.createPrimitive(nativeFunc.apply(Math, arguments));
        };
      })(Math[numFunctions[i]]);
      this.setProperty(myMath, numFunctions[i], this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);
    }
  };

  /**
   * Initialize Regular Expression object.
   * @param {!JsObject} scope Global scope.
   */
  initRegExp(scope: any) {
    const thisInterpreter = this;
    let wrapper: any;
    // Regex constructor.
    wrapper = function(pattern: any, flags: any) {
      let rgx: any;
      if (this.parent == thisInterpreter.REGEXP) {
        // Called with new.
        rgx = this;
      } else {
        rgx = thisInterpreter.createObject(thisInterpreter.REGEXP);
      }
      pattern = pattern ? pattern.toString() : '';
      flags = flags ? flags.toString() : '';
      return thisInterpreter.populateRegExp_(rgx, new RegExp(pattern, flags));
    };
    this.REGEXP = this.createNativeFunction(wrapper);
    this.setProperty(scope, 'RegExp', this.REGEXP);

    this.setProperty(this.REGEXP.properties.prototype, 'global',
        this.UNDEFINED, READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(this.REGEXP.properties.prototype, 'ignoreCase',
        this.UNDEFINED, READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(this.REGEXP.properties.prototype, 'multiline',
        this.UNDEFINED, READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(this.REGEXP.properties.prototype, 'source',
        this.createPrimitive('(?:)'),
        READONLY_NONENUMERABLE_DESCRIPTOR);

    wrapper = function(str: any) {
      str = str.toString();
      return thisInterpreter.createPrimitive(this.data.test(str));
    };
    this.setNativeFunctionPrototype(this.REGEXP, 'test', wrapper);

    wrapper = function(str: any) {
      str = str.toString();
      // Get lastIndex from wrapped regex, since this is settable.
      this.data.lastIndex =
          thisInterpreter.getProperty(this, 'lastIndex').toNumber();
      const match = this.data.exec(str);
      thisInterpreter.setProperty(this, 'lastIndex',
          thisInterpreter.createPrimitive(this.data.lastIndex));

      if (match) {
        const result = thisInterpreter.createObject(thisInterpreter.ARRAY);
        for (let i = 0; i < match.length; i++) {
          thisInterpreter.setProperty(result, i,
              thisInterpreter.createPrimitive(match[i]));
        }
        // match has additional properties.
        thisInterpreter.setProperty(result, 'index',
            thisInterpreter.createPrimitive(match.index));
        thisInterpreter.setProperty(result, 'input',
            thisInterpreter.createPrimitive(match.input));
        return result;
      }
      return thisInterpreter.NULL;
    };
    this.setNativeFunctionPrototype(this.REGEXP, 'exec', wrapper);
  };

  /**
   * Initialize JSON object.
   * @param {!JsObject} scope Global scope.
   */
  initJSON(scope: any) {
    const myJSON = this.createObject(this.OBJECT);

    this.setProperty(scope, 'JSON', myJSON);

    this.setProperty(myJSON, 'parse', this.createNativeFunction((text: any) => {
      const nativeObj = JSON.parse(text.toString());
      return this.nativeToPseudo(nativeObj);
    }));

    this.setProperty(myJSON, 'stringify', this.createNativeFunction((value: any) => {
      const nativeObj = this.pseudoToNative(value);
      return this.createPrimitive(JSON.stringify(nativeObj));
    }));
  };

  /**
   * Initialize the Error class.
   * @param {!JsObject} scope Global scope.
   */
  initError(scope: any) {
    const thisInterpreter = this;
    // Error constructor.
    this.ERROR = this.createNativeFunction(function(opt_message: any) {
      let newError: any;
      if (this.parent == thisInterpreter.ERROR) {
        // Called with new.
        newError = this;
      } else {
        newError = thisInterpreter.createObject(thisInterpreter.ERROR);
      }
      if (opt_message) {
        thisInterpreter.setProperty(newError, 'message',
            thisInterpreter.createPrimitive(String(opt_message)),
            NONENUMERABLE_DESCRIPTOR);
      }
      return newError;
    });
    this.setProperty(scope, 'Error', this.ERROR);
    this.setProperty(this.ERROR.properties.prototype, 'message',
        this.STRING_EMPTY, NONENUMERABLE_DESCRIPTOR);
    this.setProperty(this.ERROR.properties.prototype, 'name',
        this.createPrimitive('Error'), NONENUMERABLE_DESCRIPTOR);

    const createErrorSubclass = function(name: any) {
      const constructor = thisInterpreter.createNativeFunction(function(opt_message: any) {
        let newError: any;
        if (utils.isa(this.parent, thisInterpreter.ERROR)) {
          // Called with new.
          newError = this;
        } else {
          newError = thisInterpreter.createObject(constructor);
        }
        if (opt_message) {
          thisInterpreter.setProperty(newError, 'message',
              thisInterpreter.createPrimitive(String(opt_message)),
              NONENUMERABLE_DESCRIPTOR);
        }
        return newError;
      });
      thisInterpreter.setProperty(constructor, 'prototype',
          thisInterpreter.createObject(thisInterpreter.ERROR));
      thisInterpreter.setProperty(constructor.properties.prototype, 'name',
          thisInterpreter.createPrimitive(name),
          NONENUMERABLE_DESCRIPTOR);
      thisInterpreter.setProperty(scope, name, constructor);

      return constructor;
    };

    this.EVAL_ERROR = createErrorSubclass('EvalError');
    this.RANGE_ERROR = createErrorSubclass('RangeError');
    this.REFERENCE_ERROR = createErrorSubclass('ReferenceError');
    this.SYNTAX_ERROR = createErrorSubclass('SyntaxError');
    this.TYPE_ERROR = createErrorSubclass('TypeError');
    this.URI_ERROR = createErrorSubclass('URIError');
  };

  /**
   * Create a new data object for a primitive.
   * @param {number|string|boolean|null|undefined|RegExp} data Data to
   *     encapsulate.
   * @return {!Primitive|!JsObject} New data object.
   */
  createPrimitive(data: any) {
    // Reuse a predefined primitive constant if possible.
    if (data === undefined) {
      return this.UNDEFINED;
    } else if (data === null) {
      return this.NULL;
    } else if (data === true) {
      return this.TRUE;
    } else if (data === false) {
      return this.FALSE;
    } else if (data === 0) {
      return this.NUMBER_ZERO;
    } else if (data === 1) {
      return this.NUMBER_ONE;
    } else if (data === '') {
      return this.STRING_EMPTY;
    } else if (data instanceof RegExp) {
      return this.populateRegExp_(this.createObject(this.REGEXP), data);
    }
    return new Primitive(data, this);
  };

  /**
   * Create a new data object.
   * @param {JsObject} parent Parent constructor function.
   * @return {!JsObject} New data object.
   */
  createObject(parent: any) {
    const obj = new JsObject(parent);

    // Functions have prototype objects.
    if (utils.isa(obj, this.FUNCTION)) {
      obj.type = 'function';
      this.setProperty(obj, 'prototype', this.createObject(this.OBJECT || null));
    }

    // Arrays have length.
    if (utils.isa(obj, this.ARRAY)) {
      obj.length = 0;
      obj.toString = function() {
        const strs: any = [];
        for (let i = 0; i < this.length; i++) {
          const value = this.properties[i];
          strs[i] = (!value || (value.isPrimitive && (value.data === null ||
              value.data === undefined))) ? '' : value.toString();
        }
        return strs.join(',');
      };
    }

    return obj;
  };

  /**
   * Initialize a pseudo regular expression object based on a native regular
   * expression object.
   * @param {!JsObject} pseudoRegexp The existing object to set.
   * @param {!RegExp} nativeRegexp The native regular expression.
   * @return {!JsObject} Newly populated regular expression object.
   * @private
   */
  populateRegExp_(pseudoRegexp: any, nativeRegexp: any) {
    pseudoRegexp.data = nativeRegexp;
    // lastIndex is settable, all others are read-only attributes
    this.setProperty(pseudoRegexp, 'lastIndex',
        this.createPrimitive(nativeRegexp.lastIndex),
        NONENUMERABLE_DESCRIPTOR);
    this.setProperty(pseudoRegexp, 'source',
        this.createPrimitive(nativeRegexp.source),
        READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(pseudoRegexp, 'global',
        this.createPrimitive(nativeRegexp.global),
        READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(pseudoRegexp, 'ignoreCase',
        this.createPrimitive(nativeRegexp.ignoreCase),
        READONLY_NONENUMERABLE_DESCRIPTOR);
    this.setProperty(pseudoRegexp, 'multiline',
        this.createPrimitive(nativeRegexp.multiline),
        READONLY_NONENUMERABLE_DESCRIPTOR);
    // Override a couple of Object's conversion functions.
    pseudoRegexp.toString = function() { return String(this.data); };
    pseudoRegexp.valueOf = function() { return this.data; };
    return pseudoRegexp;
  };

  /**
   * Create a new function.
   * @param {Object} node AST node defining the function.
   * @param {Object=} opt_scope Optional parent scope.
   * @return {!JsObject} New function.
   */
  createFunction(node: any, opt_scope?: any) {
    const func = this.createObject(this.FUNCTION);
    func.parentScope = opt_scope || this.getScope();
    func.node = node;
    this.setProperty(func, 'length', this.createPrimitive(func.node.params.length), READONLY_DESCRIPTOR);
    return func;
  };

  /**
   * Create a new native function.
   * @param {!Function} nativeFunc JavaScript function.
   * @return {!JsObject} New function.
   */
  createNativeFunction(nativeFunc: Function) {
    const func = this.createObject(this.FUNCTION);
    func.nativeFunc = nativeFunc;
    this.setProperty(func, 'length', this.createPrimitive(nativeFunc.length), READONLY_DESCRIPTOR);
    return func;
  };

  /**
   * Create a new native asynchronous function.
   * @param {!Function} asyncFunc JavaScript function.
   * @return {!JsObject} New function.
   */
  createAsyncFunction(asyncFunc: AsyncFunction) {
    const func = this.createObject(this.FUNCTION);
    func.asyncFunc = asyncFunc;
    this.setProperty(func, 'length', this.createPrimitive(asyncFunc.length), READONLY_DESCRIPTOR);
    return func;
  };

  /**
   * Converts from a native JS object or value to a JS interpreter object.
   * Can handle JSON-style values.
   * @param {*} nativeObj The native JS object to be converted.
   * @return {!JsObject|!Primitive} The equivalent
   *     JS interpreter object.
   */
  nativeToPseudo(nativeObj: any) {
    if (typeof nativeObj == 'boolean' ||
        typeof nativeObj == 'number' ||
        typeof nativeObj == 'string' ||
        nativeObj === null || nativeObj === undefined ||
        nativeObj instanceof RegExp) {
      return this.createPrimitive(nativeObj);
    }

    let pseudoObj: any;
    if (nativeObj instanceof Array) {  // Array.
      pseudoObj = this.createObject(this.ARRAY);
      for (let i = 0; i < nativeObj.length; i++) {
        this.setProperty(pseudoObj, i, this.nativeToPseudo(nativeObj[i]));
      }
    } else {  // Object.
      pseudoObj = this.createObject(this.OBJECT);
      for (const key in nativeObj) {
        this.setProperty(pseudoObj, key, this.nativeToPseudo(nativeObj[key]));
      }
    }

    return pseudoObj;
  };

  /**
   * Converts from a JS interpreter object to native JS object.
   * Can handle JSON-style values.
   * @param {!JsObject|!Primitive} pseudoObj The JS
   *     interpreter object to be converted.
   * @return {*} The equivalent native JS object or value.
   */
  pseudoToNative(pseudoObj: any) {
    if (pseudoObj.isPrimitive ||
        utils.isa(pseudoObj, this.NUMBER) ||
        utils.isa(pseudoObj, this.STRING) ||
        utils.isa(pseudoObj, this.BOOLEAN)) {
      return pseudoObj.data;
    }

    let nativeObj: any;
    if (utils.isa(pseudoObj, this.ARRAY)) {  // Array.
      nativeObj = [];
      for (let i = 0; i < pseudoObj.length; i++) {
        nativeObj[i] = this.pseudoToNative(pseudoObj.properties[i]);
      }
    } else {  // Object.
      nativeObj = {};
      for (const key in pseudoObj.properties) {
        nativeObj[key] = this.pseudoToNative(pseudoObj.properties[key]);
      }
    }

    return nativeObj;
  };

  /**
   * Fetch a property value from a data object.
   * @param {!JsObject|!Primitive} obj Data object.
   * @param {*} name Name of property.
   * @return {!JsObject|!Primitive|null} Property value
   *     (may be UNDEFINED), or null if an error was thrown and will be caught.
   */
  getProperty(obj: any, name: any) {
    name = name.toString();
    if (obj == this.UNDEFINED || obj == this.NULL) {
      this.throwException(this.TYPE_ERROR,
                          "Cannot read property '" + name + "' of " + obj);
      return null;
    }

    // Special cases for magic length property.
    if (utils.isa(obj, this.STRING)) {
      if (name == 'length') {
        return this.createPrimitive(obj.data.length);
      }
      const n = utils.arrayIndex(name);
      if (!isNaN(n) && n < obj.data.length) {
        return this.createPrimitive(obj.data[n]);
      }
    } else if (utils.isa(obj, this.ARRAY) && name == 'length') {
      return this.createPrimitive(obj.length);
    }

    while (true) {
      if (obj.properties && name in obj.properties) {
        const getter = obj.getter[name];
        if (getter) {
          // Flag this function as being a getter and thus needing immediate
          // execution (rather than being the value of the property).
          getter.isGetter = true;
          return getter;
        }
        return obj.properties[name];
      }

      if (obj.parent && obj.parent.properties &&
          obj.parent.properties.prototype) {
        obj = obj.parent.properties.prototype;
      } else {
        // No parent, reached the top.
        break;
      }
    }

    return this.UNDEFINED;
  };

  /**
   * Does the named property exist on a data object.
   * @param {!JsObject|!Primitive} obj Data object.
   * @param {*} name Name of property.
   * @return {boolean} True if property exists.
   */
  hasProperty(obj: any, name: any) {
    name = name.toString();

    if (obj.isPrimitive) throw TypeError('Primitive data type has no properties');

    if (name == 'length' && (utils.isa(obj, this.STRING) || utils.isa(obj, this.ARRAY))) {
      return true;
    }

    if (utils.isa(obj, this.STRING)) {
      const n = utils.arrayIndex(name);
      if (!isNaN(n) && n < obj.data.length) return true;
    }

    while (true) {
      if (obj.properties && name in obj.properties) return true;

      if (obj.parent && obj.parent.properties && obj.parent.properties.prototype) {
        obj = obj.parent.properties.prototype;
      } else {
        // No parent, reached the top.
        break;
      }
    }
    return false;
  };

  /**
   * Set a property value on a data object.
   * @param {!JsObject} obj Data object.
   * @param {*} name Name of property.
   * @param {JsObject|Primitive} value
   *     New property value or null if getter/setter is described.
   * @param {Object=} opt_descriptor Optional descriptor object.
   * @return {!JsObject|undefined} Returns a setter function if one
   *     needs to be called, otherwise undefined.
   */
  setProperty(obj: any, name: any, value: any, opt_descriptor?: any) {
    name = name.toString();

    if (opt_descriptor && obj.notConfigurable[name]) {
      this.throwException(this.TYPE_ERROR, `Cannot redefine property: ${name}`);
    }

    if (typeof value != 'object') {
      throw Error(`Failure to wrap a value: ${value}'`);
    }

    if (obj == this.UNDEFINED || obj == this.NULL) {
      this.throwException(this.TYPE_ERROR, `Cannot set property '${name}' of ${obj}`);
    }

    if (opt_descriptor && (opt_descriptor.get || opt_descriptor.set) &&
        (value || opt_descriptor.writable !== undefined)) {
      this.throwException(this.TYPE_ERROR, 'Invalid property descriptor. ' +
          'Cannot both specify accessors and a value or writable attribute');
    }

    if (obj.isPrimitive) { return; }

    if (utils.isa(obj, this.STRING)) {
      const n = utils.arrayIndex(name);
      if (name == 'length' || (!isNaN(n) && n < obj.data.length)) {
        // Can't set length or letters on Strings.
        return;
      }
    }
    if (utils.isa(obj, this.ARRAY)) {
      // Arrays have a magic length variable that is bound to the elements.
      let i: any;
      if (name == 'length') {
        // Delete elements if length is smaller.
        const newLength = utils.arrayIndex(value.toNumber());
        if (isNaN(newLength)) {
          this.throwException(this.RANGE_ERROR, 'Invalid array length');
        }
        if (newLength < obj.length) {
          for (i in obj.properties) {
            i = utils.arrayIndex(i);
            if (!isNaN(i) && newLength <= i) {
              delete obj.properties[i];
            }
          }
        }
        obj.length = newLength;
        return;  // Don't set a real length property.
      } else if (!isNaN(i = utils.arrayIndex(name))) {
        // Increase length if this index is larger.
        obj.length = Math.max(obj.length, i + 1);
      }
    }
    if (!obj.properties[name] && obj.preventExtensions) {
      const scope = this.getScope();
      if (scope.strict) {
        this.throwException(this.TYPE_ERROR, `Can't add property ${name} object is not extensible`);
      }
      return;
    }
    if (opt_descriptor) {
      // Define the property.
      obj.properties[name] = value;
      if (!opt_descriptor.configurable) {
        obj.notConfigurable[name] = true;
      }
      const getter = opt_descriptor.get;
      if (getter) {
        obj.getter[name] = getter;
      } else {
        delete obj.getter[name];
      }
      const setter = opt_descriptor.set;
      if (setter) {
        obj.setter[name] = setter;
      } else {
        delete obj.setter[name];
      }
      const enumerable = opt_descriptor.enumerable || false;
      if (enumerable) {
        delete obj.notEnumerable[name];
      } else {
        obj.notEnumerable[name] = true;
      }
      if (getter || setter) {
        delete obj.notWritable[name];
        obj.properties[name] = this.UNDEFINED;
      } else {
        const writable = opt_descriptor.writable || false;
        if (writable) {
          delete obj.notWritable[name];
        } else {
          obj.notWritable[name] = true;
        }
      }
    } else {
      // Set the property.
      // Determine if there is a setter anywhere in the history chain.
      let parent = obj;
      while (true) {
        if (parent.setter && parent.setter[name]) {
          return parent.setter[name];
        }
        if (parent.parent && parent.parent.properties &&
            parent.parent.properties.prototype) {
          parent = parent.parent.properties.prototype;
        } else {
          // No parent, reached the top.
          break;
        }
      }
      // No setter, simple assignment.
      if (!obj.notWritable[name]) {
        obj.properties[name] = value;
      }
    }
  };

  /**
   * Convenience method for adding a native function as a non-enumerable property
   * onto an object's prototype.
   * @param {!JsObject} obj Data object.
   * @param {*} name Name of property.
   * @param {!Function} wrapper Function object.
   */
  setNativeFunctionPrototype(obj: any, name: any, wrapper: any) {
    this.setProperty(obj.properties.prototype, name, this.createNativeFunction(wrapper), NONENUMERABLE_DESCRIPTOR);
  };

  /**
   * Delete a property value on a data object.
   * @param {!JsObject} obj Data object.
   * @param {*} name Name of property.
   * @return {boolean} True if deleted, false if undeletable.
   */
  deleteProperty(obj: any, name: any) {
    name = name.toString();
    if (obj.isPrimitive || obj.notWritable[name]) {
      return false;
    }
    if (name == 'length' && utils.isa(obj, this.ARRAY)) {
      return false;
    }
    return delete obj.properties[name];
  };

  /**
   * Returns the current scope from the stateStack.
   * @return {!JsObject} Current scope dictionary.
   */
  getScope() {
    for (let i = 0; i < this.stateStack.length; i++) {
      if (this.stateStack[i].scope) {
        return this.stateStack[i].scope;
      }
    }
    throw Error('No scope found.');
  };

  /**
   * Create a new scope dictionary.
   * @param {!Object} node AST node defining the scope container
   *     (e.g. a function).
   * @param {JsObject} parentScope Scope to link to.
   * @return {!JsObject} New scope.
   */
  createScope(node: any, parentScope: any) {
    const scope = this.createObject(null);
    scope.parentScope = parentScope;
    if (!parentScope) {
      this.initGlobalScope(scope);
    }
    this.populateScope_(node, scope);

    // Determine if this scope starts with 'use strict'.
    scope.strict = false;
    if (parentScope && parentScope.strict) {
      scope.strict = true;
    } else {
      const firstNode = node.body && node.body[0];
      if (firstNode && firstNode.expression &&
          firstNode.expression.type == 'Literal' &&
          firstNode.expression.value == 'use strict') {
        scope.strict = true;
      }
    }
    return scope;
  };

  /**
   * Create a new special scope dictionary. Similar to createScope(), but
   * doesn't assume that the scope is for a function body. This is used for
   * the catch clause and with statement.
   * @param {!JsObject} parentScope Scope to link to.
   * @param {JsObject=} opt_scope Optional object to transform into
   *     scope.
   * @return {!JsObject} New scope.
   */
  createSpecialScope(parentScope: any, opt_scope?: any) {
    if (!parentScope) {
      throw Error('parentScope required');
    }
    const scope = opt_scope || this.createObject(null);
    scope.parentScope = parentScope;
    scope.strict = parentScope.strict;
    return scope;
  };


  /**
   * Retrieves a value from the scope chain.
   * @param {!JsObject|!Primitive} name Name of variable.
   * @return {!JsObject|!Primitive|null} The value
   *     or null if an error was thrown and will be caught.
   */
  getValueFromScope(name: any) {
    let scope = this.getScope();
    const nameStr = name.toString();
    while (scope) {
      if (nameStr in scope.properties) {
        return scope.properties[nameStr];
      }
      scope = scope.parentScope;
    }
    this.throwException(this.REFERENCE_ERROR, nameStr + ' is not defined');
    return null;
  };

  /**
   * Sets a value to the current scope.
   * @param {!JsObject|!Primitive} name Name of variable.
   * @param {!JsObject|!Primitive} value Value.
   */
  setValueToScope(name: any, value: any) {
    let scope = this.getScope();
    const strict = scope.strict;
    const nameStr = name.toString();
    while (scope) {
      if ((nameStr in scope.properties) || (!strict && !scope.parentScope)) {
        if (!scope.notWritable[nameStr]) {
          scope.properties[nameStr] = value;
        }
        return;
      }
      scope = scope.parentScope;
    }
    this.throwException(this.REFERENCE_ERROR, nameStr + ' is not defined');
  };

  /**
   * Create a new scope for the given node.
   * @param {!Object} node AST node (program or function).
   * @param {!JsObject} scope Scope dictionary to populate.
   * @private
   */
  populateScope_(node: any, scope: any) {
    if (node.type == 'VariableDeclaration') {
      for (let i = 0; i < node.declarations.length; i++) {
        this.setProperty(scope, node.declarations[i].id.name, this.UNDEFINED);
      }
    } else if (node.type == 'FunctionDeclaration') {
      this.setProperty(scope, node.id.name, this.createFunction(node, scope));
      return;  // Do not recurse into function.
    } else if (node.type == 'FunctionExpression') {
      return;  // Do not recurse into function.
    }
    const parent = node.constructor;
    for (const name in node) {
      const prop = node[name];
      if (prop && typeof prop == 'object') {
        if (prop instanceof Array) {
          for (let i = 0; i < prop.length; i++) {
            if (prop[i] && prop[i].constructor == parent) {
              this.populateScope_(prop[i], scope);
            }
          }
        } else {
          if (prop.constructor == parent) {
            this.populateScope_(prop, scope);
          }
        }
      }
    }
  };

  /**
   * Gets a value from the scope chain or from an object property.
   * @param {!JsObject|!Primitive|!Array} left
   *     Name of variable or object/propname tuple.
   * @return {!JsObject|!Primitive|null} Value
   *     or null if an error was thrown and will be caught.
   */
  getValue(left: any) {
    if (left instanceof Array) {
      const [obj, prop] = left;
      return this.getProperty(obj, prop);
    } else {
      return this.getValueFromScope(left);
    }
  };

  /**
   * Sets a value to the scope chain or to an object property.
   * @param {!JsObject|!Primitive|!Array} left
   *     Name of variable or object/propname tuple.
   * @param {!JsObject|!Primitive} value Value.
   * @return {!JsObject|undefined} Returns a setter function if one
   *     needs to be called, otherwise undefined.
   */
  setValue(left: any, value: any) {
    if (left instanceof Array) {
      const [obj, prop] = left;
      return this.setProperty(obj, prop, value);
    } else {
      this.setValueToScope(left, value);
      return undefined;
    }
  };

  /**
   * Throw an exception in the interpreter that can be handled by a
   * interpreter try/catch statement.  If unhandled, a real exception will
   * be thrown.  Can be called with either an error class and a message, or
   * with an actual object to be thrown.
   * @param {!JsObject} errorClass Type of error (if message is
   *   provided) or the value to throw (if no message).
   * @param {string=} opt_message Message being thrown.
   */
  throwException(errorClass: any, opt_message?: any) {
    let error: any;
    if (this.stateStack[0].interpreter) {
      // This is the wrong interpreter, we are spinning on an eval.
      try {
        this.stateStack[0].interpreter.throwException(errorClass, opt_message);
        return;
      } catch (e) {
        // The eval threw an error and did not catch it.
        // Continue to see if this level can catch it.
      }
    }
    if (opt_message === undefined) {
      error = errorClass;
    } else {
      error = this.createObject(errorClass);
      this.setProperty(error, 'message', this.createPrimitive(opt_message),
          NONENUMERABLE_DESCRIPTOR);
    }
    // Search for a try statement with a catch clause.
    let state: any;
    do {
      state = this.stateStack.shift();
    } while (state && !(state.node.type === 'TryStatement' && state.node.handler));
    if (state) {
      // Error is being trapped.
      this.stateStack.unshift({
        node: state.node.handler,
        throwValue: error
      });
    } else {
      // Throw a real error.
      let realError: any;
      if (utils.isa(error, this.ERROR)) {
        const errorTable: { [index: string]: any } = {
          EvalError,
          RangeError,
          ReferenceError,
          SyntaxError,
          TypeError,
          URIError,
        };
        const name = this.getProperty(error, 'name').toString();
        const message = this.getProperty(error, 'message').valueOf();
        const type = errorTable[name] || Error;
        realError = type(message);
      } else {
        realError = error.toString();
      }
      throw realError;
    }
  };

  // Functions to handle each node type.

  stepArrayExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    const n = state.n || 0;
    if (!state.array) {
      state.array = this.createObject(this.ARRAY);
    } else if (state.value) {
      this.setProperty(state.array, n - 1, state.value);
    }
    if (n < node.elements.length) {
      state.n = n + 1;
      if (node.elements[n]) {
        this.stateStack.unshift({ node: node.elements[n] });
      } else {
        // [0, 1, , 3][2] -> undefined
        // Missing elements are not defined, they aren't undefined.
        state.value = undefined;
      }
    } else {
      state.array.length = state.n || 0;
      this.stateStack.shift();
      this.stateStack[0].value = state.array;
    }
  };

  stepAssignmentExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.doneLeft) {
      state.doneLeft = true;
      this.stateStack.unshift({ node: node.left, components: true });
      return;
    }
    if (!state.doneRight) {
      if (!state.leftSide) {
        state.leftSide = state.value;
      }
      if (state.doneGetter_) {
        state.leftValue = state.value;
      }
      if (!state.doneGetter_ && node.operator != '=') {
        state.leftValue = this.getValue(state.leftSide);
        if (state.leftValue.isGetter) {
          // Clear the getter flag and call the getter function.
          state.leftValue.isGetter = false;
          state.doneGetter_ = true;
          this.stateStack.unshift({
            node: { type: 'CallExpression' },
            doneCallee_: true,
            funcThis_: state.leftSide[0],
            func_: state.leftValue,
            doneArgs_: true,
            arguments: []
          });
          return;
        }
      }
      state.doneRight = true;
      this.stateStack.unshift({node: node.right});
      return;
    }
    if (state.doneSetter_) {
      // Return if setter function.
      // Setter method on property has completed.
      // Ignore its return value, and use the original set value instead.
      this.stateStack.shift();
      this.stateStack[0].value = state.doneSetter_;
      return;
    }
    const rightSide = state.value;
    let value: any;
    if (node.operator == '=') {
      value = rightSide;
    } else {
      const rightValue = rightSide;
      const leftNumber = state.leftValue.toNumber();
      const rightNumber = rightValue.toNumber();
      if (node.operator == '+=') {
        let left: any, right: any;
        if (state.leftValue.type == 'string' || rightValue.type == 'string') {
          left = state.leftValue.toString();
          right = rightValue.toString();
        } else {
          left = leftNumber;
          right = rightNumber;
        }
        value = left + right;
      } else if (node.operator == '-=') {
        value = leftNumber - rightNumber;
      } else if (node.operator == '*=') {
        value = leftNumber * rightNumber;
      } else if (node.operator == '/=') {
        value = leftNumber / rightNumber;
      } else if (node.operator == '%=') {
        value = leftNumber % rightNumber;
      } else if (node.operator == '<<=') {
        value = leftNumber << rightNumber;
      } else if (node.operator == '>>=') {
        value = leftNumber >> rightNumber;
      } else if (node.operator == '>>>=') {
        value = leftNumber >>> rightNumber;
      } else if (node.operator == '&=') {
        value = leftNumber & rightNumber;
      } else if (node.operator == '^=') {
        value = leftNumber ^ rightNumber;
      } else if (node.operator == '|=') {
        value = leftNumber | rightNumber;
      } else {
        throw SyntaxError('Unknown assignment expression: ' + node.operator);
      }
      value = this.createPrimitive(value);
    }
    const setter = this.setValue(state.leftSide, value);
    if (setter) {
      state.doneSetter_ = value;
      this.stateStack.unshift({
        node: {type: 'CallExpression'},
        doneCallee_: true,
        funcThis_: state.leftSide[0],
        func_: setter,
        doneArgs_: true,
        arguments: [value]
      });
      return;
    }
    // Return if no setter function.
    this.stateStack.shift();
    this.stateStack[0].value = value;
  };

  stepBinaryExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.doneLeft) {
      state.doneLeft = true;
      this.stateStack.unshift({node: node.left});
      return;
    }
    if (!state.doneRight) {
      state.doneRight = true;
      state.leftValue = state.value;
      this.stateStack.unshift({node: node.right});
      return;
    }
    this.stateStack.shift();
    const leftSide = state.leftValue;
    const rightSide = state.value;
    let value: any;
    const comp = utils.comp(leftSide, rightSide);
    if (node.operator == '==' || node.operator == '!=') {
      if (leftSide.isPrimitive && rightSide.isPrimitive) {
        value = leftSide.data == rightSide.data;
      } else {
        value = comp === 0;
      }
      if (node.operator == '!=') {
        value = !value;
      }
    } else if (node.operator == '===' || node.operator == '!==') {
      if (leftSide.isPrimitive && rightSide.isPrimitive) {
        value = leftSide.data === rightSide.data;
      } else {
        value = leftSide === rightSide;
      }
      if (node.operator == '!==') {
        value = !value;
      }
    } else if (node.operator == '>') {
      value = comp == 1;
    } else if (node.operator == '>=') {
      value = comp == 1 || comp === 0;
    } else if (node.operator == '<') {
      value = comp == -1;
    } else if (node.operator == '<=') {
      value = comp == -1 || comp === 0;
    } else if (node.operator == '+') {
      let leftValue: any, rightValue: any;
      if (leftSide.type == 'string' || rightSide.type == 'string') {
        leftValue = leftSide.toString();
        rightValue = rightSide.toString();
      } else {
        leftValue = leftSide.toNumber();
        rightValue = rightSide.toNumber();
      }
      value = leftValue + rightValue;
    } else if (node.operator == 'in') {
      value = this.hasProperty(rightSide, leftSide);
    } else if (node.operator == 'instanceof') {
      if (!utils.isa(rightSide, this.FUNCTION)) {
        this.throwException(this.TYPE_ERROR,
            'Expecting a function in instanceof check');
      }
      value = utils.isa(leftSide, rightSide);
    } else {
      const leftValue = leftSide.toNumber();
      const rightValue = rightSide.toNumber();
      if (node.operator == '-') {
        value = leftValue - rightValue;
      } else if (node.operator == '*') {
        value = leftValue * rightValue;
      } else if (node.operator == '/') {
        value = leftValue / rightValue;
      } else if (node.operator == '%') {
        value = leftValue % rightValue;
      } else if (node.operator == '&') {
        value = leftValue & rightValue;
      } else if (node.operator == '|') {
        value = leftValue | rightValue;
      } else if (node.operator == '^') {
        value = leftValue ^ rightValue;
      } else if (node.operator == '<<') {
        value = leftValue << rightValue;
      } else if (node.operator == '>>') {
        value = leftValue >> rightValue;
      } else if (node.operator == '>>>') {
        value = leftValue >>> rightValue;
      } else {
        throw SyntaxError('Unknown binary operator: ' + node.operator);
      }
    }
    this.stateStack[0].value = this.createPrimitive(value);
  };

  stepBlockStatement() {
    const state = this.stateStack[0];
    const node = state.node;
    const n = state.n_ || 0;
    if (node.body[n]) {
      state.done = false;
      state.n_ = n + 1;
      this.stateStack.unshift({ node: node.body[n] });
    } else {
      state.done = true;
      if (state.node.type != 'Program') {
        // Leave the root scope on the tree in case the program is appended to.
        this.stateStack.shift();
      }
    }
  };

  stepBreakStatement() {
    let state = this.stateStack.shift();
    const node = state.node;
    let label: any = null;
    if (node.label) {
      label = node.label.name;
    }
    state = this.stateStack.shift();
    while (state &&
          state.node.type != 'CallExpression' &&
          state.node.type != 'NewExpression') {
      if (label ? label == state.label : (state.isLoop || state.isSwitch)) {
        return;
      }
      state = this.stateStack.shift();
    }
    // Syntax error, do not allow this error to be trapped.
    throw SyntaxError('Illegal break statement');
  };

  stepCallExpression() {
    let state = this.stateStack[0];
    const node = state.node;
    if (!state.doneCallee_) {
      state.doneCallee_ = true;
      this.stateStack.unshift({ node: node.callee, components: true });
      return;
    }
    if (!state.func_) {
      // Determine value of the function.
      if (state.value.type == 'function') {
        state.func_ = state.value;
      } else {
        if (state.value.length) {
          state.member_ = state.value[0];
        }
        state.func_ = this.getValue(state.value);
        if (!state.func_) {
          return;  // Thrown error, but trapped.
        } else if (state.func_.type != 'function') {
          this.throwException(this.TYPE_ERROR,
              (state.value && state.value.type) + ' is not a function');
          return;
        }
      }
      // Determine value of 'this' in function.
      if (state.node.type == 'NewExpression') {
        state.funcThis_ = this.createObject(state.func_);
        state.isConstructor_ = true;
      } else if (state.func_.boundThis_) {
        state.funcThis_ = state.func_.boundThis_;
      } else if (state.value.length) {
        state.funcThis_ = state.value[0];
      } else {
        state.funcThis_ =
            this.stateStack[this.stateStack.length - 1].thisExpression;
      }
      if (state.func_.boundArgs_) {
        state.arguments = state.func_.boundArgs_.concat();
      } else {
        state.arguments = [];
      }
      state.n_ = 0;
    }
    if (!state.doneArgs_) {
      if (state.n_ != 0) {
        state.arguments.push(state.value);
      }
      if (node.arguments[state.n_]) {
        this.stateStack.unshift({ node: node.arguments[state.n_] });
        state.n_++;
        return;
      }
      state.doneArgs_ = true;
    }
    if (!state.doneExec_) {
      state.doneExec_ = true;
      if (state.func_.node) {
        const scope =
            this.createScope(state.func_.node.body, state.func_.parentScope);
        // Add all arguments.
        for (let i = 0; i < state.func_.node.params.length; i++) {
          const paramName = this.createPrimitive(state.func_.node.params[i].name);
          const paramValue = state.arguments.length > i ? state.arguments[i] :
              this.UNDEFINED;
          this.setProperty(scope, paramName, paramValue);
        }
        // Build arguments variable.
        const argsList = this.createObject(this.ARRAY);
        for (let i = 0; i < state.arguments.length; i++) {
          this.setProperty(argsList, this.createPrimitive(i),
                          state.arguments[i]);
        }
        this.setProperty(scope, 'arguments', argsList);
        const funcState = {
          node: state.func_.node.body,
          scope,
          thisExpression: state.funcThis_
        };
        this.stateStack.unshift(funcState);
        state.value = this.UNDEFINED;  // Default value if no explicit return.
      } else if (state.func_.nativeFunc) {
        state.value = state.func_.nativeFunc.apply(state.funcThis_, state.arguments);
      } else if (state.func_.asyncFunc) {
        (<PromiseLike<any>> state.func_.asyncFunc.apply(state.funcThis_, state.arguments))
          .then(value => {
            this.paused_ = false;
            state.value = value || this.UNDEFINED;
          }, error => {
            this.paused_ = false;
            this.throwException(this.ERROR, error.message);
          });
        this.paused_ = true;
        return;
      } else if (state.func_.eval) {
        const code = state.arguments[0];
        if (!code) {
          state.value = this.UNDEFINED;
        } else if (!code.isPrimitive) {
          // JS does not parse String objects:
          // eval(new String('1 + 1')) -> '1 + 1'
          state.value = code;
        } else {
          const evalInterpreter = new Interpreter(code.toString());
          evalInterpreter.stateStack[0].scope = this.getScope();
          state = {
            node: {type: 'Eval_'},
            interpreter: evalInterpreter
          };
          this.stateStack.unshift(state);
        }
      } else {
        throw TypeError('function not a function (huh?)');
      }
    } else {
      // Execution complete.  Put the return value on the stack.
      this.stateStack.shift();
      if (state.isConstructor_ && state.value.type !== 'object') {
        this.stateStack[0].value = state.funcThis_;
      } else {
        this.stateStack[0].value = state.value;
      }
    }
  };

  stepCatchClause() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.doneBody) {
      state.doneBody = true;
      let scope: any;
      if (node.param) {
        scope = this.createSpecialScope(this.getScope());
        // Add the argument.
        const paramName = this.createPrimitive(node.param.name);
        this.setProperty(scope, paramName, state.throwValue);
      }
      this.stateStack.unshift({ node: node.body, scope });
    } else {
      this.stateStack.shift();
    }
  };

  stepConditionalExpression() {
    const state = this.stateStack[0];
    if (!state.done) {
      if (!state.test) {
        state.test = true;
        this.stateStack.unshift({ node: state.node.test });
      } else {
        state.done = true;
        if (state.value.toBoolean() && state.node.consequent) {
          this.stateStack.unshift({ node: state.node.consequent });
        } else if (!state.value.toBoolean() && state.node.alternate) {
          this.stateStack.unshift({ node: state.node.alternate });
        }
      }
    } else {
      this.stateStack.shift();
      if (state.node.type == 'ConditionalExpression') {
        this.stateStack[0].value = state.value;
      }
    }
  };

  stepContinueStatement() {
    const node = this.stateStack[0].node;
    let label: any = null;
    if (node.label) {
      label = node.label.name;
    }
    let state = this.stateStack[0];
    while (state &&
          state.node.type != 'CallExpression' &&
          state.node.type != 'NewExpression') {
      if (state.isLoop) {
        if (!label || (label == state.label)) {
          return;
        }
      }
      this.stateStack.shift();
      state = this.stateStack[0];
    }
    // Syntax error, do not allow this error to be trapped.
    throw SyntaxError('Illegal continue statement');
  };

  stepDoWhileStatement() {
    const state = this.stateStack[0];
    state.isLoop = true;
    if (state.node.type == 'DoWhileStatement' && state.test === undefined) {
      // First iteration of do/while executes without checking test.
      state.value = this.TRUE;
      state.test = true;
    }
    if (!state.test) {
      state.test = true;
      this.stateStack.unshift({ node: state.node.test });
    } else {
      state.test = false;
      if (!state.value.toBoolean()) {
        this.stateStack.shift();
      } else if (state.node.body) {
        this.stateStack.unshift({ node: state.node.body });
      }
    }
  };

  stepEmptyStatement() {
    this.stateStack.shift();
  };

  stepEval_() {
    const state = this.stateStack[0];
    if (!state.interpreter.step()) {
      this.stateStack.shift();
      this.stateStack[0].value = state.interpreter.value || this.UNDEFINED;
    }
  };

  stepExpressionStatement() {
    const state = this.stateStack[0];
    if (!state.done) {
      state.done = true;
      this.stateStack.unshift({ node: state.node.expression });
    } else {
      this.stateStack.shift();
      // Save this value to the interpreter for use as a return value if
      // this code is inside an eval function.
      this.value = state.value;
    }
  };

  stepForInStatement() {
    const state = this.stateStack[0];
    state.isLoop = true;
    const node = state.node;
    if (!state.doneVariable_) {
      state.doneVariable_ = true;
      let left = node.left;
      if (left.type == 'VariableDeclaration') {
        // Inline variable declaration: for (const x in y)
        left = left.declarations[0].id;
      }
      this.stateStack.unshift({ node: left, components: true });
      return;
    }
    if (!state.doneObject_) {
      state.doneObject_ = true;
      state.variable = state.value;
      this.stateStack.unshift({ node: node.right });
      return;
    }
    if (typeof state.iterator == 'undefined') {
      // First iteration.
      state.object = state.value;
      state.iterator = 0;
    }
    let name: any = null;
    done: do {
      let i = state.iterator;
      for (const prop in state.object.properties) {
        if (state.object.notEnumerable[prop]) {
          continue;
        }
        if (i == 0) {
          name = prop;
          break done;
        }
        i--;
      }
      state.object = state.object.parent && state.object.parent.properties.prototype;
      state.iterator = 0;
    } while (state.object);
    state.iterator++;
    if (name === null) {
      this.stateStack.shift();
    } else {
      this.setValueToScope(state.variable, this.createPrimitive(name));
      if (node.body) {
        this.stateStack.unshift({ node: node.body });
      }
    }
  };

  stepForStatement() {
    const state = this.stateStack[0];
    state.isLoop = true;
    const node = state.node;
    const mode = state.mode || 0;
    if (mode == 0) {
      state.mode = 1;
      if (node.init) {
        this.stateStack.unshift({ node: node.init });
      }
    } else if (mode == 1) {
      state.mode = 2;
      if (node.test) {
        this.stateStack.unshift({ node: node.test });
      }
    } else if (mode == 2) {
      state.mode = 3;
      if (node.test && state.value && !state.value.toBoolean()) {
        // Loop complete.  Bail out.
        this.stateStack.shift();
      } else if (node.body) {
        this.stateStack.unshift({ node: node.body });
      }
    } else if (mode == 3) {
      state.mode = 1;
      if (node.update) {
        this.stateStack.unshift({ node: node.update });
      }
    }
  };

  stepFunctionDeclaration() {
    this.stateStack.shift();
  };

  stepFunctionExpression() {
    const state = this.stateStack.shift();
    this.stateStack[0].value = this.createFunction(state.node);
  };

  stepIdentifier() {
    const state = this.stateStack.shift();
    const name = this.createPrimitive(state.node.name);
    this.stateStack[0].value = state.components ? name : this.getValueFromScope(name);
  };

  stepIfStatement() {
    return this.stepConditionalExpression();
  }

  stepLabeledStatement() {
    // No need to hit this node again on the way back up the stack.
    const state = this.stateStack.shift();
    this.stateStack.unshift({
      node: state.node.body,
      label: state.node.label.name,
    });
  };

  stepLiteral() {
    const state = this.stateStack.shift();
    this.stateStack[0].value = this.createPrimitive(state.node.value);
  };

  stepLogicalExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    if (node.operator != '&&' && node.operator != '||') {
      throw SyntaxError('Unknown logical operator: ' + node.operator);
    }
    if (!state.doneLeft_) {
      state.doneLeft_ = true;
      this.stateStack.unshift({node: node.left});
    } else if (!state.doneRight_) {
      if ((node.operator == '&&' && !state.value.toBoolean()) ||
          (node.operator == '||' && state.value.toBoolean())) {
        // Shortcut evaluation.
        this.stateStack.shift();
        this.stateStack[0].value = state.value;
      } else {
        state.doneRight_ = true;
        this.stateStack.unshift({node: node.right});
      }
    } else {
      this.stateStack.shift();
      this.stateStack[0].value = state.value;
    }
  };

  stepMemberExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.doneObject_) {
      state.doneObject_ = true;
      this.stateStack.unshift({node: node.object});
    } else if (!state.doneProperty_) {
      state.doneProperty_ = true;
      state.object = state.value;
      this.stateStack.unshift({
        node: node.property,
        components: !node.computed
      });
    } else {
      this.stateStack.shift();
      if (state.components) {
        this.stateStack[0].value = [state.object, state.value];
      } else {
        const value = this.getProperty(state.object, state.value);
        if (value.isGetter) {
          // Clear the getter flag and call the getter function.
          value.isGetter = false;
          this.stateStack.unshift({
            node: {type: 'CallExpression'},
            doneCallee_: true,
            funcThis_: state.object,
            func_: value,
            doneArgs_: true,
            arguments: []
          });
        } else {
          this.stateStack[0].value = value;
        }
      }
    }
  };

  stepNewExpression() {
    return this.stepCallExpression();
  }

  stepObjectExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    const valueToggle = state.valueToggle;
    const n = state.n || 0;
    if (!state.object) {
      state.object = this.createObject(this.OBJECT);
      state.properties = Object.create(null);
    } else {
      if (valueToggle) {
        state.key = state.value;
      } else {
        if (!state.properties[state.key]) {
          // Create temp object to collect value, getter, and/or setter.
          state.properties[state.key] = {};
        }
        state.properties[state.key][state.kind] = state.value;
      }
    }
    if (node.properties[n]) {
      if (valueToggle) {
        state.n = n + 1;
        this.stateStack.unshift({node: node.properties[n].value});
      } else {
        state.kind = node.properties[n].kind;
        this.stateStack.unshift({node: node.properties[n].key, components: true});
      }
      state.valueToggle = !valueToggle;
    } else {
      for (const key in state.properties) {
        const kinds = state.properties[key];
        if ('get' in kinds || 'set' in kinds) {
          // Set a property with a getter or setter.
          const descriptor = {
            configurable: true,
            enumerable: true,
            get: kinds['get'],
            set: kinds['set']
          };
          this.setProperty(state.object, key, null, descriptor);
        } else {
          // Set a normal property with a value.
          this.setProperty(state.object, key, kinds['init']);
        }
      }
      this.stateStack.shift();
      this.stateStack[0].value = state.object;
    }
  };

  stepProgram() {
    return this.stepBlockStatement();
  }

  stepReturnStatement() {
    let state = this.stateStack[0];
    const node = state.node;
    if (node.argument && !state.done) {
      state.done = true;
      this.stateStack.unshift({node: node.argument});
    } else {
      const value = state.value || this.UNDEFINED;
      do {
        this.stateStack.shift();
        if (this.stateStack.length == 0) {
          // Syntax error, do not allow this error to be trapped.
          throw SyntaxError('Illegal return statement');
        }
        state = this.stateStack[0];
      } while (state.node.type != 'CallExpression' &&
              state.node.type != 'NewExpression');
      state.value = value;
    }
  };

  stepSequenceExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    const n = state.n || 0;
    if (node.expressions[n]) {
      state.n = n + 1;
      this.stateStack.unshift({node: node.expressions[n]});
    } else {
      this.stateStack.shift();
      this.stateStack[0].value = state.value;
    }
  };

  stepSwitchStatement() {
    const state = this.stateStack[0];
    state.checked = state.checked || [];
    state.isSwitch = true;

    if (!state.test) {
      state.test = true;
      this.stateStack.unshift({node: state.node.discriminant});
      return;
    }
    if (!state.switchValue) {
      // Preserve switch value between case tests.
      state.switchValue = state.value;
    }

    const index = state.index || 0;
    const currentCase = state.node.cases[index];
    if (currentCase) {
      if (!state.done && !state.checked[index] && currentCase.test) {
        state.checked[index] = true;
        this.stateStack.unshift({node: currentCase.test});
        return;
      }
      // Test on the default case will be null.
      if (state.done || !currentCase.test || utils.comp(state.value, state.switchValue) == 0) {
        state.done = true;
        const n = state.n || 0;
        if (currentCase.consequent[n]) {
          this.stateStack.unshift({node: currentCase.consequent[n]});
          state.n = n + 1;
          return;
        }
      }
      state.n = 0;
      state.index = index + 1;
    } else {
      this.stateStack.shift();
    }
  };

  stepThisExpression() {
    this.stateStack.shift();
    for (let i = 0; i < this.stateStack.length; i++) {
      if (this.stateStack[i].thisExpression) {
        this.stateStack[0].value = this.stateStack[i].thisExpression;
        return;
      }
    }
    throw Error('No this expression found.');
  };

  stepThrowStatement() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.argument) {
      state.argument = true;
      this.stateStack.unshift({node: node.argument});
    } else {
      this.throwException(state.value);
    }
  };

  stepTryStatement() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.doneBlock) {
      state.doneBlock = true;
      this.stateStack.unshift({node: node.block});
    } else if (!state.doneFinalizer && node.finalizer) {
      state.doneFinalizer = true;
      this.stateStack.unshift({node: node.finalizer});
    } else {
      this.stateStack.shift();
    }
  };

  stepUnaryExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.done) {
      state.done = true;
      const nextState: any = { node: node.argument };
      if (node.operator == 'delete' || node.operator == 'typeof') {
        nextState.components = true;
      }
      this.stateStack.unshift(nextState);
      return;
    }
    this.stateStack.shift();
    let value: any;
    if (node.operator == '-') {
      value = -state.value.toNumber();
    } else if (node.operator == '+') {
      value = state.value.toNumber();
    } else if (node.operator == '!') {
      value = !state.value.toBoolean();
    } else if (node.operator == '~') {
      value = ~state.value.toNumber();
    } else if (node.operator == 'delete' || node.operator == 'typeof') {
      let obj: any;
      let name: any;
      if (state.value.length) {
        obj = state.value[0];
        name = state.value[1];
      } else {
        obj = this.getScope();
        name = state.value;
      }
      if (node.operator == 'delete') {
        value = this.deleteProperty(obj, name);
      } else {
        value = this.getProperty(obj, name).type;
      }
    } else if (node.operator == 'void') {
      value = undefined;
    } else {
      throw SyntaxError('Unknown unary operator: ' + node.operator);
    }
    this.stateStack[0].value = this.createPrimitive(value);
  };

  stepUpdateExpression() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.doneLeft) {
      state.doneLeft = true;
      this.stateStack.unshift({node: node.argument, components: true});
      return;
    }
    if (!state.leftSide) {
      state.leftSide = state.value;
    }
    if (state.doneGetter_) {
      state.leftValue = state.value;
    }
    if (!state.doneGetter_) {
      state.leftValue = this.getValue(state.leftSide);
      if (!state.leftValue) {
        return;  // Thrown error, but trapped.
      }
      if (state.leftValue.isGetter) {
        // Clear the getter flag and call the getter function.
        state.leftValue.isGetter = false;
        state.doneGetter_ = true;
        this.stateStack.unshift({
          node: {type: 'CallExpression'},
          doneCallee_: true,
          funcThis_: state.leftSide[0],
          func_: state.leftValue,
          doneArgs_: true,
          arguments: []
        });
        return;
      }
    }
    if (state.doneSetter_) {
      // Return if setter function.
      // Setter method on property has completed.
      // Ignore its return value, and use the original set value instead.
      this.stateStack.shift();
      this.stateStack[0].value = state.doneSetter_;
      return;
    }
    const leftValue = state.leftValue.toNumber();
    let changeValue: any;
    if (node.operator == '++') {
      changeValue = this.createPrimitive(leftValue + 1);
    } else if (node.operator == '--') {
      changeValue = this.createPrimitive(leftValue - 1);
    } else {
      throw SyntaxError('Unknown update expression: ' + node.operator);
    }
    const returnValue = node.prefix ?
        changeValue : this.createPrimitive(leftValue);
    const setter = this.setValue(state.leftSide, changeValue);
    if (setter) {
      state.doneSetter_ = returnValue;
      this.stateStack.unshift({
        node: {type: 'CallExpression'},
        doneCallee_: true,
        funcThis_: state.leftSide[0],
        func_: setter,
        doneArgs_: true,
        arguments: [changeValue]
      });
      return;
    }
    // Return if no setter function.
    this.stateStack.shift();
    this.stateStack[0].value = returnValue;
  };

  stepVariableDeclaration() {
    const state = this.stateStack[0];
    const node = state.node;
    const n = state.n || 0;
    if (node.declarations[n]) {
      state.n = n + 1;
      this.stateStack.unshift({node: node.declarations[n]});
    } else {
      this.stateStack.shift();
    }
  };

  stepVariableDeclarator() {
    const state = this.stateStack[0];
    const node = state.node;
    if (node.init && !state.done) {
      state.done = true;
      this.stateStack.unshift({node: node.init});
      return;
    }
    if (node.init) {
      // This setValue call never needs to deal with calling a setter function.
      this.setValue(this.createPrimitive(node.id.name), state.value);
    }
    this.stateStack.shift();
  };

  stepWithStatement() {
    const state = this.stateStack[0];
    const node = state.node;
    if (!state.doneObject) {
      state.doneObject = true;
      this.stateStack.unshift({node: node.object});
    } else if (!state.doneBody) {
      state.doneBody = true;
      const scope = this.createSpecialScope(this.getScope(), state.value);
      this.stateStack.unshift({node: node.body, scope: scope});
    } else {
      this.stateStack.shift();
    }
  };

  stepWhileStatement() {
    return this.stepDoWhileStatement();
  }
}

export default Interpreter;
