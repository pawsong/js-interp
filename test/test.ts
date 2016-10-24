import { expect } from 'chai';
import fs = require('fs');
import { Interpreter } from '../lib';

function waitFor(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitUntil(check: () => boolean) {
  return new Promise((resolve) => {
    const handle = setInterval(() => {
      if (check()) return;
      clearInterval(handle);
      resolve();
    }, 1);
  });
}

describe('Global scope', () => {
  describe('null', () => {
    it('should return null', () => {
      const interpreter = new Interpreter('null');
      interpreter.run();
      expect(interpreter.value).to.equal(interpreter.NULL);
    });
  });

  describe('NaN', () => {
    it('should return NaN', () => {
      const interpreter = new Interpreter('NaN');
      interpreter.run();
      expect(interpreter.value).to.equal(interpreter.NAN);
    });
  });

  describe('isNaN', () => {
    it('should return true with NaN', () => {
      const interpreter = new Interpreter('isNaN(NaN)');
      interpreter.run();
      expect(interpreter.value).to.equal(interpreter.TRUE);
    });

    it('should return false with parameters except NaN', () => {
      const interpreter = new Interpreter('isNaN(null)');
      interpreter.run();
      expect(interpreter.value).to.equal(interpreter.FALSE);
    });
  });

  describe('Infinity', () => {
    it('should return Infinity', () => {
      const interpreter = new Interpreter('Infinity');
      interpreter.run();
      expect(interpreter.value.type).to.equal('number');
      expect(interpreter.value.data).to.equal(Infinity);
    });
  });

  describe('Number', () => {
    it('should return primitive number', () => {
      const interpreter = new Interpreter('1');
      interpreter.run();
      expect(interpreter.value).to.equal(interpreter.NUMBER_ONE);
    });
  });

  describe('isFinite', () => {
    it('should return true with Infinity', () => {
      const interpreter = new Interpreter('isFinite(Infinity)');
      interpreter.run();
      expect(interpreter.value).to.equal(interpreter.FALSE);
    });

    it('should return false with finite numbers', () => {
      const interpreter = new Interpreter('isFinite(1)');
      interpreter.run();
      expect(interpreter.value).to.equal(interpreter.TRUE);
    });
  });

  describe('String', () => {
    it('should return primitive string', () => {
      const interpreter = new Interpreter(`''`);
      interpreter.run();
      expect(interpreter.value).to.equal(interpreter.STRING_EMPTY);
    });
  });

  describe('decodeURI', () => {
    it('should decode URI', () => {
      const interpreter = new Interpreter(
        `decodeURI('https://developer.mozilla.org/ru/docs/JavaScript_%D1%88%D0%B5%D0%BB%D0%BB%D1%8B');`);
      interpreter.run();
      expect(interpreter.value.type).to.equal('string');
      expect(interpreter.value.data).to.equal(
        'https://developer.mozilla.org/ru/docs/JavaScript_шеллы');
    });
  });

  describe('encodeURI', () => {
    it('should decode URI', () => {
      const interpreter = new Interpreter(
        `encodeURI('https://developer.mozilla.org/ru/docs/JavaScript_шеллы');`);
      interpreter.run();
      expect(interpreter.value.type).to.equal('string');
      expect(interpreter.value.data).to.equal(
        'https://developer.mozilla.org/ru/docs/JavaScript_%D1%88%D0%B5%D0%BB%D0%BB%D1%8B');
    });
  });

  describe('JSON', () => {
    describe('.parse', () => {
      it('should parse JSON', () => {
        const interpreter = new Interpreter(`JSON.parse('{"a":10}')`);
        interpreter.run();
        expect(interpreter.value.type).to.equal('object');
        expect(interpreter.value.properties.a.type).to.equal('number');
        expect(interpreter.value.properties.a.data).to.equal(10);
      });
    });

    describe('.stringify', () => {
      it('should stringify JSON', () => {
        const interpreter = new Interpreter('JSON.stringify({ a: 10 })');
        interpreter.run();
        expect(interpreter.value.type).to.equal('string');
        expect(interpreter.value.data).to.equal('{"a":10}');
      });
    });
  });

  describe('Array', () => {
    describe('#map', () => {
      it('should create a new mapped array', () => {
        const code = `new Array('1', '2', '3').map(function (item) { return 'm' + item; })`;
        const interpreter = new Interpreter(code);
        interpreter.run();
        expect(interpreter.value.length).to.equal(3);
        expect(interpreter.value.properties[0].type).to.equal('string');
        expect(interpreter.value.properties[0].data).to.equal('m1');
        expect(interpreter.value.properties[1].type).to.equal('string');
        expect(interpreter.value.properties[1].data).to.equal('m2');
        expect(interpreter.value.properties[2].type).to.equal('string');
        expect(interpreter.value.properties[2].data).to.equal('m3');
      });
    });
  });
});

describe('Error', () => {
  describe('throw', () => {
    it('should throw the error', () => {
      const code = `throw new Error('something wrong')`;
      const interpreter = new Interpreter(code);
      expect(() => interpreter.run()).to.throw(Error, 'something wrong');
    });
  });

  describe('try...catch', () => {
    it('should catch the error thrown in try statements', () => {
      const code =
`var error;
try {
  throw new Error('something wrong');
} catch (err) {
  error = err;
}
error;`;
      const interpreter = new Interpreter(code);
      interpreter.run();
      expect(interpreter.value.parent).to.equal(interpreter.ERROR);
      expect(interpreter.value.properties.message.type).to.equal('string');
      expect(interpreter.value.properties.message.data).to.equal('something wrong');
    });
  });
});

describe('Interpreter', () => {
  describe('#createNativeFunction', () => {
    it('should bind a native function', () => {
      const interpreter = new Interpreter('boundFunction()', (interpreter, scope) => {
        interpreter.setProperty(scope, 'boundFunction', interpreter.createNativeFunction(() => {
          return interpreter.createPrimitive(10);
        }));
      });

      interpreter.run();

      expect(interpreter.value.type).to.equal('number');
      expect(interpreter.value.data).to.equal(10);
    });
  });

  describe('#createAsyncFunction', () => {
    it('should bind a async function', async () => {
      const interpreter = new Interpreter('boundFunction()', (interpreter, scope) => {
        interpreter.setProperty(scope, 'boundFunction', interpreter.createAsyncFunction(() => {
          return waitFor(0).then(() => interpreter.createPrimitive(10));
        }));
      });

      await waitUntil(() => interpreter.run());

      expect(interpreter.value.type).to.equal('number');
      expect(interpreter.value.data).to.equal(10);
    });
  });
});

describe('Examples', () => {
  describe('fibonacci', () => {
    it('should return array representing fibonacci series', () => {
      const code = fs.readFileSync(`${__dirname}/fixtures/fibonacci.js`, 'utf8');
      const interpreter = new Interpreter(code);
      interpreter.run();

      const expected = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];
      expect(interpreter.value.length).to.equal(expected.length);

      for (let i = 0; i < 16; ++i) {
        expect(interpreter.value.properties[i].type).to.equal('number');
        expect(interpreter.value.properties[i].data).to.equal(expected[i]);
      }
    });
  });
});

describe('Interpreter', () => {
  describe('#createNativeFunction', () => {
    it('should bind a native function', () => {
      const interpreter = new Interpreter('boundFunction()', (interpreter, scope) => {
        interpreter.setProperty(scope, 'boundFunction', interpreter.createNativeFunction(() => {
          return interpreter.createPrimitive(10);
        }));
      });

      interpreter.run();

      expect(interpreter.value.type).to.equal('number');
      expect(interpreter.value.data).to.equal(10);
    });
  });

  describe('#createAsyncFunction', () => {
    it('should bind a async function', async () => {
      const interpreter = new Interpreter('boundFunction()', (interpreter, scope) => {
        interpreter.setProperty(scope, 'boundFunction', interpreter.createAsyncFunction(() => {
          return waitFor(0).then(() => interpreter.createPrimitive(10));
        }));
      });

      await waitUntil(() => interpreter.run());

      expect(interpreter.value.type).to.equal('number');
      expect(interpreter.value.data).to.equal(10);
    });
  });
});
