(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
let Desktop = require('./ui/Desktop');

window.dom = require('dominant');

window.divos = {};
divos.ui = {};

addEventListener('DOMContentLoaded', () => {
  document.body.append(divos.ui.desktop = Desktop());
});

},{"./ui/Desktop":8,"dominant":3}],2:[function(require,module,exports){
module.exports = (a, b) => {
  let diffs = {
    moved: [],
    added: [],
    removed: [],
  };

  for (let [i, x] of a.entries()) {
    if (b[i] === x) {
      continue;
    }

    let newIndex = b.findIndex((y, j) => {
      if (y !== x) {
        return false;
      }

      return !diffs.moved.some(
        z => z.value === y && z.to !== j,
      );
    });

    if (newIndex === -1) {
      diffs.removed.push({ from: i });
      continue;
    }

    diffs.moved.push({
      value: x,
      from: i,
      to: newIndex,
    });
  }

  for (let [i, x] of b.entries()) {
    if (a[i] === x) {
      continue;
    }

    if (diffs.moved.some(y => y.value == x && y.to === i)) {
      continue;
    }

    diffs.added.push({
      value: x,
      to: i,
    });
  }
  
  if (Object.values(diffs).every(x => x.length === 0)) {
    return null;
  }

  return b.map((x, i) => {
    if (a[i] === x) {
      return { type: 'existing', from: i };
    }

    let moved = diffs.moved.find(y => y.to === i);

    return moved
      ? { type: 'existing', from: moved.from }
      : { type: 'new', value: x };
  });
};

},{}],3:[function(require,module,exports){
let arrayDiff = require('./arrayDiff');

exports.Binding = class Binding {
  constructor(x) {
    switch (typeof x) {
      case 'function':
        this.get = x;
        break;

      case 'object':
        Object.assign(this, x);
        break;

      default:
        throw new Error(`Unexpected binding argument type "${typeof x}"`);
    }
  }
};

exports.binding = (...args) => new exports.Binding(...args);

exports.boundNodes = new Set();

exports.comment = text => document.createComment(` ${text || 'comment'} `);

exports.el = (el, ...args) => {
  let props;

  if (args[0] && args[0].constructor === Object) {
    props = args.shift();
  }

  switch (typeof el) {
    case 'string':
      el = document.createElement(el);
      break;

    case 'function':
      el = el();
      break;

    default:
      break;
  }

  for (let [k, v] of Object.entries(props || {})) {
    if (v instanceof exports.Binding) {
      let elBindings = el.bindings = el.bindings || {};
      let propBindings = elBindings[k] = elBindings[k] || [];

      propBindings.push(v);
      continue;
    }

    if (k.startsWith('on')) {
      el.addEventListener(k.replace(/^on:?/, '').toLowerCase(), v);
      continue;
    }

    if (
      k.startsWith('aria-') ||
      k.startsWith('data-') ||
      el.tagName.toUpperCase() === 'SVG'
    ) {
      el.setAttribute(k, v);
      continue;
    }

    if (k === 'class') {
      k = 'className';
    }

    el[k] = v;
  }

  if (args.length) {
    el.innerHTML = '';
    el.append(...args.flat(10));
  }

  if (el.bindings && document.body.contains(el)) {
    exports.update(el);
    exports.boundNodes.add(el);
  }

  return el;
};

exports.html = html => {
  let wrapper = exports.el('div');

  wrapper.innerHTML = html.trim();

  switch (wrapper.childNodes.length) {
    case 0:
      return null;

    case 1:
      return wrapper.childNodes[0];

    default:
      return [...wrapper.childNodes];
  }
};

exports.if = (predFn, thenNode, elseNode) => {
  let anchorComment = exports.comment('anchorComment: conditional');

  anchorComment.bindings = {
    conditional: [dom.binding({ get: predFn, thenNode, elseNode })],
  };

  return anchorComment;
};

exports.map = (array, fn) => {
  let anchorComment = exports.comment('anchorComment: map');

  anchorComment.bindings = {
    map: [dom.binding({ get: () => exports.resolve(array), fn })],
  };

  return anchorComment;
};

exports.mutationObserver = new MutationObserver(muts => {
  let { body } = document;
  let { boundNodes } = exports;

  let boundNodesArray = [...boundNodes];

  let addedNodes = muts.map(x => [...x.addedNodes]).flat();

  let removedNodes = muts.map(x => [...x.removedNodes]).flat().filter(
    x => !addedNodes.includes(x),
  );

  let detachedBoundNodes = [];

  for (let n of removedNodes) {
    if (n.bindings) {
      detachedBoundNodes.push(n);
    }

    let detachedBoundChildNodes = boundNodesArray.filter(x => n.contains(x));
    detachedBoundNodes.push(...detachedBoundChildNodes);
  }

  for (let n of detachedBoundNodes) {
    boundNodes.delete(n);

    let { listeners } = n.bindings || {};

    if (listeners) {
      for (let fn of listeners.detach || []) {
        fn(n);
      }
    }
  }

  let attachNode = n => {
    if (boundNodes.has(n)) {
      return;
    }

    boundNodes.add(n);
    exports.update(n);
  };

  for (let n of addedNodes) {
    if (n.bindings) {
      attachNode(n);
    }

    if (n.nodeName === '#comment') {
      return;
    }

    for (
      let childComment of
      [...n.childNodes].filter(x => x.nodeName === '#comment')
    ) {
      if (childComment.bindings) {
        attachNode(childComment);
      }
    }

    if (n.querySelectorAll) {
      for (let el of n.querySelectorAll('*')) {
        if (el.bindings) {
          attachNode(el);
        }

        for (
          let childComment of
          [...el.childNodes].filter(x => x.nodeName === '#comment')
        ) {
          if (childComment.bindings) {
            attachNode(childComment);
          }
        }
      }
    }
  }
});

addEventListener('DOMContentLoaded', () => {
  exports.mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
});

exports.resolve = x => typeof x === 'function' ? x() : x;

exports.text = fn => {
  let anchorComment = exports.comment('anchorComment: text');

  anchorComment.bindings = {
    text: [dom.binding({ get: fn })],
  };

  return anchorComment;
};

exports.update = (n, key, binding) => {
  if (!n) {
    for (let n of exports.boundNodes) {
      exports.update(n);
    }

    return;
  }

  if (!key) {
    for (let key of Object.keys(n.bindings || {})) {
      exports.update(n, key);
    }

    return;
  }

  if (!binding) {
    for (let binding of n.bindings[key] || []) {
      exports.update(n, key, binding);
    }

    return;
  }

  let updateFn = exports.update[key] || exports.update.otherProps;
  updateFn(n, key, binding);
};

exports.update.class = (el, propName, binding) => {
  let newValues = {};
  let { lastValues = {} } = binding;

  for (let [k, v] of Object.entries(binding.get())) {
    newValues[k] = Boolean(v);
  }

  for (let k of new Set([
    ...Object.keys(lastValues),
    ...Object.keys(newValues),
  ])) {
    let v = newValues[k];

    if (v !== lastValues[k]) {
      el.classList.toggle(k, v);
    }
  }

  binding.lastValues = newValues;
};

exports.update.conditional = (el, key, binding) => {
  let newValue = Boolean(binding.get());
  let { lastValue } = binding;

  if (lastValue === undefined || newValue !== lastValue) {
    let parentEl = el.parentElement;

    if (parentEl) {
      let nNew = newValue ? binding.thenNode : binding.elseNode;
      let nOld = newValue ? binding.elseNode : binding.thenNode;

      if (nNew) {
        parentEl.insertBefore(nNew, el.nextSibling);
      }

      if (nOld) {
        nOld.remove();
      }
    }
  }

  binding.lastValue = newValue;
};

exports.update.map = (anchorComment, key, binding) => {
  let newArray = [...binding.get() || []];
  let { lastArray, lastNodes } = binding;

  let diffs = arrayDiff(lastArray || [], newArray);

  if (!diffs) {
    return;
  }

  for (let el of lastNodes || []) {
    el.remove();
  }

  let cursor = anchorComment;
  let parentEl = anchorComment.parentElement;
  let updatedNodes = [];

  for (let diff of diffs) {
    switch (diff.type) {
      case 'new': {
        let nNew = binding.fn(diff.value);

        parentEl.insertBefore(nNew, cursor.nextSibling);
        cursor = nNew;

        updatedNodes.push(nNew);
        break;
      }

      case 'existing': {
        let nExisting = lastNodes[diff.from];

        parentEl.insertBefore(nExisting, cursor.nextSibling);
        cursor = nExisting;

        updatedNodes.push(nExisting);
        break;
      }
    }
  }

  binding.lastArray = newArray;
  binding.lastNodes = updatedNodes;
};

exports.update.otherProps = (el, propName, binding) => {
  let newValue = binding.get();
  let { lastValue } = binding;

  if (newValue !== lastValue) {
    if (
      propName.startsWith('aria-') ||
      propName.startsWith('data-') ||
      el.tagName.toUpperCase() === 'SVG'
    ) {
      if (newValue === undefined || newValue === null) {
        el.removeAttribute(propName);
      }
      else {
        el.setAttribute(propName, newValue);
      }
    }
    else {
      el[propName] = newValue;
    }
  }

  binding.lastValue = newValue;
};

exports.update.style = (el, propName, binding) => {
  let newValues = binding.get();
  let { lastValues = {} } = binding;

  for (let k of new Set([
    ...Object.keys(lastValues),
    ...Object.keys(newValues),
  ])) {
    let v = newValues[k];

    if (v !== lastValues[k]) {
      if (v === undefined || v === null) {
        el.style.removeProperty(k);
      }
      else {
        el.style.setProperty(k, v);
      }
    }
  }

  binding.lastValues = newValues;
};

exports.update.text = (n, key, binding) => {
  let newValue = binding.get();

  let newText = newValue !== undefined && newValue !== null
    ? String(newValue)
    : '';

  let { lastText } = binding;

  if (newText !== lastText) {
    if (binding.textNode) {
      binding.textNode.remove();
    }

    n.parentElement.insertBefore(
      binding.textNode = document.createTextNode(newText),
      n.nextSibling,
    );
  }

  binding.lastText = newText;
};

exports.update.value = (el, propName, binding) => {
  if (!binding.setHandler) {
    el.addEventListener('keyup', binding.setHandler = ev => {
      let x = ev.target.value;
      binding.lastValue = binding.set ? binding.set(x) : x;

      exports.update();
    });
  }

  if (binding.get) {
    let newValue = binding.get();
    let { lastValue } = binding;

    if (newValue !== lastValue) {
      el.value = newValue;
    }

    binding.lastValue = newValue;
  }
};

},{"./arrayDiff":2}],4:[function(require,module,exports){
'use strict'

var inserted = {}
var session = {}
var is_client = typeof window === 'object'

/**
 * insert css inside head tag. and return a function to remove css and cached
 * @param  {string} css     css rules string
 * @param  {object} options
 * @return {function}       remove the style element and cached css
 */
exports = module.exports = function(css, options) {
  return insert(inserted, css, options)
}

/**
 * same as module.exports. This for server side rendering
 * if called inside a session.
 * @param  {string} css     css rules string
 * @param  {object} options
 * @return {function}       remove the style element and cached css
 */
exports.session = function(css, options) {
  return insert(session, css, options)
}

/**
 * return css strings in array
 * @return {array}
 */
exports.getCss = getCss
function getCss() {
  return Object.keys(inserted).concat(Object.keys(session))
}
exports.cleanAllCss = function() {
  cleanStore(inserted)
  cleanStore(session)
}

exports.getCssAndResetSess = function() {
  var css = getCss()
  cleanStore(session)
  return css
}
exports.cleanSessCss = function() {
  cleanStore(session)
}

function cleanStore(store) {
  var arr = Object.keys(store)
  for (var i = 0, len = arr.length; i < len; ++i) {
    var fn = store[arr[i]]
    delete store[arr[i]]
    fn()
  }
}
function insert(store, css, options) {

  if (!css) return nop
  if (store[css]) return store[css]
  store[css] = removeCss

  var elm = null
  var head = null

  if (is_client) {
    elm = document.createElement('style')
    elm.setAttribute('type', 'text/css')

    if ('textContent' in elm) {
      elm.textContent = css
    }
    else {
      elm.styleSheet.cssText = css
    }

    head = document.getElementsByTagName('head')[0]
    if (options && options.prepend) {
      head.insertBefore(elm, head.childNodes[0])
    }
    else {
      head.appendChild(elm)
    }
  }

  var called = false // avoid double call
  return removeCss

  function removeCss() {
    if (called) return
    called = true

    delete store[css]
    if (!is_client) return
    head.removeChild(elm)
  }
}
function nop(){ }

},{}],5:[function(require,module,exports){
let HamburgerMenuIcon = require('../HamburgerMenuIcon');
let dom = require('dominant');
let injectStyles = require('inject-css');

injectStyles(`
  .appsDrawer {
    transition: transform linear 0.06s;
    transform: translateX(-100%);
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    min-width: 20vw;
    padding: 20px 0;
    color: #333;
    background-color: white;
  }

  .appsDrawer.appsDrawer-mOpen {
    transform: translateX(0);
  }

  .appsDrawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 25px;
  }

  .appsDrawer-logo {
    width: 48px;
    height: 48px;
  }

  .appsDrawer-closeBtn {
    display: flex;
    outline: 0;
    border: 0;
    padding: 10px;
    background-color: transparent;
    cursor: pointer;
  }

  .appsDrawer-appList {
    display: flex;
    flex-direction: column;
    margin-top: 10px;
  }

  .appsDrawer-appListItem {
    outline: 0;
    border: 0;
    padding: 10px 30px;
    padding-bottom: 9px;
    font-family: inherit;
    font-size: inherit;
    text-align: left;
    color: inherit;
    background-color: transparent;
  }

  .appsDrawer-appListItem:hover {
    background-color: #f4f4f4;
  }
`);

module.exports = props => {
  let model = {
    get isOpen() {
      return dom.resolve(props).isOpen;
    },

    apps: [
      { label: 'Files' },
      { label: 'Metal Web Browser' },
    ],

    launch(app) {
      console.log(`Launch ${app.label}...`);
      model.close();
    },

    close() {
      let fn = dom.resolve(props).onClose;
      fn && fn();
    },
  };

  return dom.el('div', {
    model,

    class: dom.binding(() => ({
      appsDrawer: true,
      'appsDrawer-mOpen': model.isOpen,
    })),
  }, [
    dom.el('div', { class: 'appsDrawer-header' }, [
      dom.el('img', {
        class: 'appsDrawer-logo',
        src: 'img/appsDrawerLogo.svg',
      }),

      dom.el('button', {
        class: 'appsDrawer-closeBtn',
        onClick: model.close,
      }, [
        HamburgerMenuIcon(),
      ]),
    ]),

    dom.el('div', { class: 'appsDrawer-appList' }, [
      dom.map(model.apps, app => (
        dom.el('button', {
          class: 'appsDrawer-appListItem',
          onClick: () => model.launch(app),
        }, [
          dom.text(() => app.label),
        ]))
      ),
    ]),
  ]);
};

},{"../HamburgerMenuIcon":11,"dominant":3,"inject-css":4}],6:[function(require,module,exports){
let dom = require('dominant');

module.exports = () => dom.html(`
  <svg x="0px" y="0px" viewBox="0 0 56 56" fill="currentColor" xml:space="preserve">
    <g>
      <path d="M8,40c-4.411,0-8,3.589-8,8s3.589,8,8,8s8-3.589,8-8S12.411,40,8,40z" />
      <path d="M28,40c-4.411,0-8,3.589-8,8s3.589,8,8,8s8-3.589,8-8S32.411,40,28,40z" />
      <path d="M48,40c-4.411,0-8,3.589-8,8s3.589,8,8,8s8-3.589,8-8S52.411,40,48,40z" />
      <path d="M8,20c-4.411,0-8,3.589-8,8s3.589,8,8,8s8-3.589,8-8S12.411,20,8,20z" />
      <path d="M28,20c-4.411,0-8,3.589-8,8s3.589,8,8,8s8-3.589,8-8S32.411,20,28,20z" />
      <path d="M48,20c-4.411,0-8,3.589-8,8s3.589,8,8,8s8-3.589,8-8S52.411,20,48,20z" />
      <path d="M8,0C3.589,0,0,3.589,0,8s3.589,8,8,8s8-3.589,8-8S12.411,0,8,0z" />
      <path d="M28,0c-4.411,0-8,3.589-8,8s3.589,8,8,8s8-3.589,8-8S32.411,0,28,0z" />
      <path d="M48,16c4.411,0,8-3.589,8-8s-3.589-8-8-8s-8,3.589-8,8S43.589,16,48,16z" />
    </g>
  </svg>
`);

},{"dominant":3}],7:[function(require,module,exports){
let AppsDrawer = require('../AppsDrawer');
let BtnIcon = require('./BtnIcon');
let dom = require('dominant');
let injectStyles = require('inject-css');

injectStyles(`
  .appsMenu {
    position: relative;
    display: flex;
  }

  .appsMenu-btn {
    transition: color ease 0.3s;
    display: flex;
    outline: 0;
    border: 0;
    padding: 4px;
    color: rgba(238, 238, 238, 0.2);
    background-color: transparent;
  }

  .appsMenu-btn:hover {
    color: rgba(238, 238, 238, 0.8);
  }

  .appsMenu-btnIcon {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }

  .appsMenu-drawerBackdrop {
    transition: background-color linear 0.1s;
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    background-color: transparent;
    pointer-events: none;
  }

  .appsMenu-drawerBackdrop.appsMenu-mOpen {
    background-color: rgba(0, 0, 0, 0.3);
    pointer-events: all;
  }
`);

module.exports = () => {
  let model = {};

  return dom.el('div', { model, class: 'appsMenu' }, [
    dom.el('button', {
      class: 'appsMenu-btn',

      onClick: () => {
        model.isOpen = !model.isOpen;
        dom.update();
      },
    }, [
      dom.el(BtnIcon, { class: 'appsMenu-btnIcon' }),
    ]),

    dom.el('div', {
      class: dom.binding(() => ({
        'appsMenu-drawerBackdrop': true,
        'appsMenu-mOpen': model.isOpen,
      })),

      onClick: () => {
        model.isOpen = false;
        dom.update();
      },
    }),

    AppsDrawer(() => ({
      isOpen: model.isOpen,

      onClose: () => {
        model.isOpen = false;
        dom.update();
      },
    })),
  ]);
};

},{"../AppsDrawer":5,"./BtnIcon":6,"dominant":3,"inject-css":4}],8:[function(require,module,exports){
let DesktopBg = require('./DesktopBg');
let DesktopMenu = require('./DesktopMenu');
let dom = require('dominant');
let injectStyles = require('inject-css');

injectStyles(`
  .desktop {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    font-family: sans-serif;
    font-size: 14px;
    color: #eee;
  }
`);

module.exports = () => {
  let model = {};

  return dom.el('div', { model, class: 'desktop' }, [
    model.desktopBg = DesktopBg(),
    model.desktopMenu = DesktopMenu(),
  ]);
};

},{"./DesktopBg":9,"./DesktopMenu":10,"dominant":3,"inject-css":4}],9:[function(require,module,exports){
let dom = require('dominant');
let injectStyles = require('inject-css');

injectStyles(`
  .desktopBg {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .desktopBg-img {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    object-fit: contain;
  }
`);

module.exports = () => dom.el('div', { class: 'desktopBg' }, [
  dom.el('img', {
    class: 'desktopBg-img',
    src: 'img/wallpaper.jpg',
  }),
]);

},{"dominant":3,"inject-css":4}],10:[function(require,module,exports){
let AppsMenu = require('./AppsMenu');
let dom = require('dominant');
let injectStyles = require('inject-css');

injectStyles(`
  .desktopMenu {
    display: flex;
    justify-content: space-between;
  }
`);

module.exports = () => {
  let model = {};

  return dom.el('div', { model, class: 'desktopMenu' }, [
    dom.el('div', { class: 'desktopMenu-leftBox' }, [
      model.appsMenu = AppsMenu(),
    ]),
  ]);
};

},{"./AppsMenu":7,"dominant":3,"inject-css":4}],11:[function(require,module,exports){
let dom = require('dominant');

module.exports = () => dom.html(`
  <svg width="15px" height="15px" x="0px" y="0px" viewBox="0 0 459 459" xml:space="preserve">
    <g>
      <g>
        <path d="M0,382.5h459v-51H0V382.5z M0,255h459v-51H0V255z M0,76.5v51h459v-51H0z" />
      </g>
    </g>
  </svg>
`);

},{"dominant":3}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkZW1vLmpzIiwibm9kZV9tb2R1bGVzL2RvbWluYW50L2FycmF5RGlmZi5qcyIsIm5vZGVfbW9kdWxlcy9kb21pbmFudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pbmplY3QtY3NzL2luZGV4LmpzIiwidWkvQXBwc0RyYXdlci9pbmRleC5qcyIsInVpL0FwcHNNZW51L0J0bkljb24uanMiLCJ1aS9BcHBzTWVudS9pbmRleC5qcyIsInVpL0Rlc2t0b3AuanMiLCJ1aS9EZXNrdG9wQmcuanMiLCJ1aS9EZXNrdG9wTWVudS5qcyIsInVpL0hhbWJ1cmdlck1lbnVJY29uLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwibGV0IERlc2t0b3AgPSByZXF1aXJlKCcuL3VpL0Rlc2t0b3AnKTtcblxud2luZG93LmRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XG5cbndpbmRvdy5kaXZvcyA9IHt9O1xuZGl2b3MudWkgPSB7fTtcblxuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmQoZGl2b3MudWkuZGVza3RvcCA9IERlc2t0b3AoKSk7XG59KTtcbiIsIm1vZHVsZS5leHBvcnRzID0gKGEsIGIpID0+IHtcbiAgbGV0IGRpZmZzID0ge1xuICAgIG1vdmVkOiBbXSxcbiAgICBhZGRlZDogW10sXG4gICAgcmVtb3ZlZDogW10sXG4gIH07XG5cbiAgZm9yIChsZXQgW2ksIHhdIG9mIGEuZW50cmllcygpKSB7XG4gICAgaWYgKGJbaV0gPT09IHgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGxldCBuZXdJbmRleCA9IGIuZmluZEluZGV4KCh5LCBqKSA9PiB7XG4gICAgICBpZiAoeSAhPT0geCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiAhZGlmZnMubW92ZWQuc29tZShcbiAgICAgICAgeiA9PiB6LnZhbHVlID09PSB5ICYmIHoudG8gIT09IGosXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgaWYgKG5ld0luZGV4ID09PSAtMSkge1xuICAgICAgZGlmZnMucmVtb3ZlZC5wdXNoKHsgZnJvbTogaSB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGRpZmZzLm1vdmVkLnB1c2goe1xuICAgICAgdmFsdWU6IHgsXG4gICAgICBmcm9tOiBpLFxuICAgICAgdG86IG5ld0luZGV4LFxuICAgIH0pO1xuICB9XG5cbiAgZm9yIChsZXQgW2ksIHhdIG9mIGIuZW50cmllcygpKSB7XG4gICAgaWYgKGFbaV0gPT09IHgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChkaWZmcy5tb3ZlZC5zb21lKHkgPT4geS52YWx1ZSA9PSB4ICYmIHkudG8gPT09IGkpKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBkaWZmcy5hZGRlZC5wdXNoKHtcbiAgICAgIHZhbHVlOiB4LFxuICAgICAgdG86IGksXG4gICAgfSk7XG4gIH1cbiAgXG4gIGlmIChPYmplY3QudmFsdWVzKGRpZmZzKS5ldmVyeSh4ID0+IHgubGVuZ3RoID09PSAwKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcmV0dXJuIGIubWFwKCh4LCBpKSA9PiB7XG4gICAgaWYgKGFbaV0gPT09IHgpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6ICdleGlzdGluZycsIGZyb206IGkgfTtcbiAgICB9XG5cbiAgICBsZXQgbW92ZWQgPSBkaWZmcy5tb3ZlZC5maW5kKHkgPT4geS50byA9PT0gaSk7XG5cbiAgICByZXR1cm4gbW92ZWRcbiAgICAgID8geyB0eXBlOiAnZXhpc3RpbmcnLCBmcm9tOiBtb3ZlZC5mcm9tIH1cbiAgICAgIDogeyB0eXBlOiAnbmV3JywgdmFsdWU6IHggfTtcbiAgfSk7XG59O1xuIiwibGV0IGFycmF5RGlmZiA9IHJlcXVpcmUoJy4vYXJyYXlEaWZmJyk7XG5cbmV4cG9ydHMuQmluZGluZyA9IGNsYXNzIEJpbmRpbmcge1xuICBjb25zdHJ1Y3Rvcih4KSB7XG4gICAgc3dpdGNoICh0eXBlb2YgeCkge1xuICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICB0aGlzLmdldCA9IHg7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIHgpO1xuICAgICAgICBicmVhaztcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIGJpbmRpbmcgYXJndW1lbnQgdHlwZSBcIiR7dHlwZW9mIHh9XCJgKTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydHMuYmluZGluZyA9ICguLi5hcmdzKSA9PiBuZXcgZXhwb3J0cy5CaW5kaW5nKC4uLmFyZ3MpO1xuXG5leHBvcnRzLmJvdW5kTm9kZXMgPSBuZXcgU2V0KCk7XG5cbmV4cG9ydHMuY29tbWVudCA9IHRleHQgPT4gZG9jdW1lbnQuY3JlYXRlQ29tbWVudChgICR7dGV4dCB8fCAnY29tbWVudCd9IGApO1xuXG5leHBvcnRzLmVsID0gKGVsLCAuLi5hcmdzKSA9PiB7XG4gIGxldCBwcm9wcztcblxuICBpZiAoYXJnc1swXSAmJiBhcmdzWzBdLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHtcbiAgICBwcm9wcyA9IGFyZ3Muc2hpZnQoKTtcbiAgfVxuXG4gIHN3aXRjaCAodHlwZW9mIGVsKSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChlbCk7XG4gICAgICBicmVhaztcblxuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICAgIGVsID0gZWwoKTtcbiAgICAgIGJyZWFrO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgZm9yIChsZXQgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHByb3BzIHx8IHt9KSkge1xuICAgIGlmICh2IGluc3RhbmNlb2YgZXhwb3J0cy5CaW5kaW5nKSB7XG4gICAgICBsZXQgZWxCaW5kaW5ncyA9IGVsLmJpbmRpbmdzID0gZWwuYmluZGluZ3MgfHwge307XG4gICAgICBsZXQgcHJvcEJpbmRpbmdzID0gZWxCaW5kaW5nc1trXSA9IGVsQmluZGluZ3Nba10gfHwgW107XG5cbiAgICAgIHByb3BCaW5kaW5ncy5wdXNoKHYpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGsuc3RhcnRzV2l0aCgnb24nKSkge1xuICAgICAgZWwuYWRkRXZlbnRMaXN0ZW5lcihrLnJlcGxhY2UoL15vbjo/LywgJycpLnRvTG93ZXJDYXNlKCksIHYpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgay5zdGFydHNXaXRoKCdhcmlhLScpIHx8XG4gICAgICBrLnN0YXJ0c1dpdGgoJ2RhdGEtJykgfHxcbiAgICAgIGVsLnRhZ05hbWUudG9VcHBlckNhc2UoKSA9PT0gJ1NWRydcbiAgICApIHtcbiAgICAgIGVsLnNldEF0dHJpYnV0ZShrLCB2KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChrID09PSAnY2xhc3MnKSB7XG4gICAgICBrID0gJ2NsYXNzTmFtZSc7XG4gICAgfVxuXG4gICAgZWxba10gPSB2O1xuICB9XG5cbiAgaWYgKGFyZ3MubGVuZ3RoKSB7XG4gICAgZWwuaW5uZXJIVE1MID0gJyc7XG4gICAgZWwuYXBwZW5kKC4uLmFyZ3MuZmxhdCgxMCkpO1xuICB9XG5cbiAgaWYgKGVsLmJpbmRpbmdzICYmIGRvY3VtZW50LmJvZHkuY29udGFpbnMoZWwpKSB7XG4gICAgZXhwb3J0cy51cGRhdGUoZWwpO1xuICAgIGV4cG9ydHMuYm91bmROb2Rlcy5hZGQoZWwpO1xuICB9XG5cbiAgcmV0dXJuIGVsO1xufTtcblxuZXhwb3J0cy5odG1sID0gaHRtbCA9PiB7XG4gIGxldCB3cmFwcGVyID0gZXhwb3J0cy5lbCgnZGl2Jyk7XG5cbiAgd3JhcHBlci5pbm5lckhUTUwgPSBodG1sLnRyaW0oKTtcblxuICBzd2l0Y2ggKHdyYXBwZXIuY2hpbGROb2Rlcy5sZW5ndGgpIHtcbiAgICBjYXNlIDA6XG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGNhc2UgMTpcbiAgICAgIHJldHVybiB3cmFwcGVyLmNoaWxkTm9kZXNbMF07XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIFsuLi53cmFwcGVyLmNoaWxkTm9kZXNdO1xuICB9XG59O1xuXG5leHBvcnRzLmlmID0gKHByZWRGbiwgdGhlbk5vZGUsIGVsc2VOb2RlKSA9PiB7XG4gIGxldCBhbmNob3JDb21tZW50ID0gZXhwb3J0cy5jb21tZW50KCdhbmNob3JDb21tZW50OiBjb25kaXRpb25hbCcpO1xuXG4gIGFuY2hvckNvbW1lbnQuYmluZGluZ3MgPSB7XG4gICAgY29uZGl0aW9uYWw6IFtkb20uYmluZGluZyh7IGdldDogcHJlZEZuLCB0aGVuTm9kZSwgZWxzZU5vZGUgfSldLFxuICB9O1xuXG4gIHJldHVybiBhbmNob3JDb21tZW50O1xufTtcblxuZXhwb3J0cy5tYXAgPSAoYXJyYXksIGZuKSA9PiB7XG4gIGxldCBhbmNob3JDb21tZW50ID0gZXhwb3J0cy5jb21tZW50KCdhbmNob3JDb21tZW50OiBtYXAnKTtcblxuICBhbmNob3JDb21tZW50LmJpbmRpbmdzID0ge1xuICAgIG1hcDogW2RvbS5iaW5kaW5nKHsgZ2V0OiAoKSA9PiBleHBvcnRzLnJlc29sdmUoYXJyYXkpLCBmbiB9KV0sXG4gIH07XG5cbiAgcmV0dXJuIGFuY2hvckNvbW1lbnQ7XG59O1xuXG5leHBvcnRzLm11dGF0aW9uT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcihtdXRzID0+IHtcbiAgbGV0IHsgYm9keSB9ID0gZG9jdW1lbnQ7XG4gIGxldCB7IGJvdW5kTm9kZXMgfSA9IGV4cG9ydHM7XG5cbiAgbGV0IGJvdW5kTm9kZXNBcnJheSA9IFsuLi5ib3VuZE5vZGVzXTtcblxuICBsZXQgYWRkZWROb2RlcyA9IG11dHMubWFwKHggPT4gWy4uLnguYWRkZWROb2Rlc10pLmZsYXQoKTtcblxuICBsZXQgcmVtb3ZlZE5vZGVzID0gbXV0cy5tYXAoeCA9PiBbLi4ueC5yZW1vdmVkTm9kZXNdKS5mbGF0KCkuZmlsdGVyKFxuICAgIHggPT4gIWFkZGVkTm9kZXMuaW5jbHVkZXMoeCksXG4gICk7XG5cbiAgbGV0IGRldGFjaGVkQm91bmROb2RlcyA9IFtdO1xuXG4gIGZvciAobGV0IG4gb2YgcmVtb3ZlZE5vZGVzKSB7XG4gICAgaWYgKG4uYmluZGluZ3MpIHtcbiAgICAgIGRldGFjaGVkQm91bmROb2Rlcy5wdXNoKG4pO1xuICAgIH1cblxuICAgIGxldCBkZXRhY2hlZEJvdW5kQ2hpbGROb2RlcyA9IGJvdW5kTm9kZXNBcnJheS5maWx0ZXIoeCA9PiBuLmNvbnRhaW5zKHgpKTtcbiAgICBkZXRhY2hlZEJvdW5kTm9kZXMucHVzaCguLi5kZXRhY2hlZEJvdW5kQ2hpbGROb2Rlcyk7XG4gIH1cblxuICBmb3IgKGxldCBuIG9mIGRldGFjaGVkQm91bmROb2Rlcykge1xuICAgIGJvdW5kTm9kZXMuZGVsZXRlKG4pO1xuXG4gICAgbGV0IHsgbGlzdGVuZXJzIH0gPSBuLmJpbmRpbmdzIHx8IHt9O1xuXG4gICAgaWYgKGxpc3RlbmVycykge1xuICAgICAgZm9yIChsZXQgZm4gb2YgbGlzdGVuZXJzLmRldGFjaCB8fCBbXSkge1xuICAgICAgICBmbihuKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBsZXQgYXR0YWNoTm9kZSA9IG4gPT4ge1xuICAgIGlmIChib3VuZE5vZGVzLmhhcyhuKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGJvdW5kTm9kZXMuYWRkKG4pO1xuICAgIGV4cG9ydHMudXBkYXRlKG4pO1xuICB9O1xuXG4gIGZvciAobGV0IG4gb2YgYWRkZWROb2Rlcykge1xuICAgIGlmIChuLmJpbmRpbmdzKSB7XG4gICAgICBhdHRhY2hOb2RlKG4pO1xuICAgIH1cblxuICAgIGlmIChuLm5vZGVOYW1lID09PSAnI2NvbW1lbnQnKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChcbiAgICAgIGxldCBjaGlsZENvbW1lbnQgb2ZcbiAgICAgIFsuLi5uLmNoaWxkTm9kZXNdLmZpbHRlcih4ID0+IHgubm9kZU5hbWUgPT09ICcjY29tbWVudCcpXG4gICAgKSB7XG4gICAgICBpZiAoY2hpbGRDb21tZW50LmJpbmRpbmdzKSB7XG4gICAgICAgIGF0dGFjaE5vZGUoY2hpbGRDb21tZW50KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobi5xdWVyeVNlbGVjdG9yQWxsKSB7XG4gICAgICBmb3IgKGxldCBlbCBvZiBuLnF1ZXJ5U2VsZWN0b3JBbGwoJyonKSkge1xuICAgICAgICBpZiAoZWwuYmluZGluZ3MpIHtcbiAgICAgICAgICBhdHRhY2hOb2RlKGVsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoXG4gICAgICAgICAgbGV0IGNoaWxkQ29tbWVudCBvZlxuICAgICAgICAgIFsuLi5lbC5jaGlsZE5vZGVzXS5maWx0ZXIoeCA9PiB4Lm5vZGVOYW1lID09PSAnI2NvbW1lbnQnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoY2hpbGRDb21tZW50LmJpbmRpbmdzKSB7XG4gICAgICAgICAgICBhdHRhY2hOb2RlKGNoaWxkQ29tbWVudCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59KTtcblxuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgZXhwb3J0cy5tdXRhdGlvbk9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuYm9keSwge1xuICAgIGNoaWxkTGlzdDogdHJ1ZSxcbiAgICBzdWJ0cmVlOiB0cnVlLFxuICB9KTtcbn0pO1xuXG5leHBvcnRzLnJlc29sdmUgPSB4ID0+IHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nID8geCgpIDogeDtcblxuZXhwb3J0cy50ZXh0ID0gZm4gPT4ge1xuICBsZXQgYW5jaG9yQ29tbWVudCA9IGV4cG9ydHMuY29tbWVudCgnYW5jaG9yQ29tbWVudDogdGV4dCcpO1xuXG4gIGFuY2hvckNvbW1lbnQuYmluZGluZ3MgPSB7XG4gICAgdGV4dDogW2RvbS5iaW5kaW5nKHsgZ2V0OiBmbiB9KV0sXG4gIH07XG5cbiAgcmV0dXJuIGFuY2hvckNvbW1lbnQ7XG59O1xuXG5leHBvcnRzLnVwZGF0ZSA9IChuLCBrZXksIGJpbmRpbmcpID0+IHtcbiAgaWYgKCFuKSB7XG4gICAgZm9yIChsZXQgbiBvZiBleHBvcnRzLmJvdW5kTm9kZXMpIHtcbiAgICAgIGV4cG9ydHMudXBkYXRlKG4pO1xuICAgIH1cblxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICgha2V5KSB7XG4gICAgZm9yIChsZXQga2V5IG9mIE9iamVjdC5rZXlzKG4uYmluZGluZ3MgfHwge30pKSB7XG4gICAgICBleHBvcnRzLnVwZGF0ZShuLCBrZXkpO1xuICAgIH1cblxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghYmluZGluZykge1xuICAgIGZvciAobGV0IGJpbmRpbmcgb2Ygbi5iaW5kaW5nc1trZXldIHx8IFtdKSB7XG4gICAgICBleHBvcnRzLnVwZGF0ZShuLCBrZXksIGJpbmRpbmcpO1xuICAgIH1cblxuICAgIHJldHVybjtcbiAgfVxuXG4gIGxldCB1cGRhdGVGbiA9IGV4cG9ydHMudXBkYXRlW2tleV0gfHwgZXhwb3J0cy51cGRhdGUub3RoZXJQcm9wcztcbiAgdXBkYXRlRm4obiwga2V5LCBiaW5kaW5nKTtcbn07XG5cbmV4cG9ydHMudXBkYXRlLmNsYXNzID0gKGVsLCBwcm9wTmFtZSwgYmluZGluZykgPT4ge1xuICBsZXQgbmV3VmFsdWVzID0ge307XG4gIGxldCB7IGxhc3RWYWx1ZXMgPSB7fSB9ID0gYmluZGluZztcblxuICBmb3IgKGxldCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoYmluZGluZy5nZXQoKSkpIHtcbiAgICBuZXdWYWx1ZXNba10gPSBCb29sZWFuKHYpO1xuICB9XG5cbiAgZm9yIChsZXQgayBvZiBuZXcgU2V0KFtcbiAgICAuLi5PYmplY3Qua2V5cyhsYXN0VmFsdWVzKSxcbiAgICAuLi5PYmplY3Qua2V5cyhuZXdWYWx1ZXMpLFxuICBdKSkge1xuICAgIGxldCB2ID0gbmV3VmFsdWVzW2tdO1xuXG4gICAgaWYgKHYgIT09IGxhc3RWYWx1ZXNba10pIHtcbiAgICAgIGVsLmNsYXNzTGlzdC50b2dnbGUoaywgdik7XG4gICAgfVxuICB9XG5cbiAgYmluZGluZy5sYXN0VmFsdWVzID0gbmV3VmFsdWVzO1xufTtcblxuZXhwb3J0cy51cGRhdGUuY29uZGl0aW9uYWwgPSAoZWwsIGtleSwgYmluZGluZykgPT4ge1xuICBsZXQgbmV3VmFsdWUgPSBCb29sZWFuKGJpbmRpbmcuZ2V0KCkpO1xuICBsZXQgeyBsYXN0VmFsdWUgfSA9IGJpbmRpbmc7XG5cbiAgaWYgKGxhc3RWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IG5ld1ZhbHVlICE9PSBsYXN0VmFsdWUpIHtcbiAgICBsZXQgcGFyZW50RWwgPSBlbC5wYXJlbnRFbGVtZW50O1xuXG4gICAgaWYgKHBhcmVudEVsKSB7XG4gICAgICBsZXQgbk5ldyA9IG5ld1ZhbHVlID8gYmluZGluZy50aGVuTm9kZSA6IGJpbmRpbmcuZWxzZU5vZGU7XG4gICAgICBsZXQgbk9sZCA9IG5ld1ZhbHVlID8gYmluZGluZy5lbHNlTm9kZSA6IGJpbmRpbmcudGhlbk5vZGU7XG5cbiAgICAgIGlmIChuTmV3KSB7XG4gICAgICAgIHBhcmVudEVsLmluc2VydEJlZm9yZShuTmV3LCBlbC5uZXh0U2libGluZyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChuT2xkKSB7XG4gICAgICAgIG5PbGQucmVtb3ZlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYmluZGluZy5sYXN0VmFsdWUgPSBuZXdWYWx1ZTtcbn07XG5cbmV4cG9ydHMudXBkYXRlLm1hcCA9IChhbmNob3JDb21tZW50LCBrZXksIGJpbmRpbmcpID0+IHtcbiAgbGV0IG5ld0FycmF5ID0gWy4uLmJpbmRpbmcuZ2V0KCkgfHwgW11dO1xuICBsZXQgeyBsYXN0QXJyYXksIGxhc3ROb2RlcyB9ID0gYmluZGluZztcblxuICBsZXQgZGlmZnMgPSBhcnJheURpZmYobGFzdEFycmF5IHx8IFtdLCBuZXdBcnJheSk7XG5cbiAgaWYgKCFkaWZmcykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGZvciAobGV0IGVsIG9mIGxhc3ROb2RlcyB8fCBbXSkge1xuICAgIGVsLnJlbW92ZSgpO1xuICB9XG5cbiAgbGV0IGN1cnNvciA9IGFuY2hvckNvbW1lbnQ7XG4gIGxldCBwYXJlbnRFbCA9IGFuY2hvckNvbW1lbnQucGFyZW50RWxlbWVudDtcbiAgbGV0IHVwZGF0ZWROb2RlcyA9IFtdO1xuXG4gIGZvciAobGV0IGRpZmYgb2YgZGlmZnMpIHtcbiAgICBzd2l0Y2ggKGRpZmYudHlwZSkge1xuICAgICAgY2FzZSAnbmV3Jzoge1xuICAgICAgICBsZXQgbk5ldyA9IGJpbmRpbmcuZm4oZGlmZi52YWx1ZSk7XG5cbiAgICAgICAgcGFyZW50RWwuaW5zZXJ0QmVmb3JlKG5OZXcsIGN1cnNvci5uZXh0U2libGluZyk7XG4gICAgICAgIGN1cnNvciA9IG5OZXc7XG5cbiAgICAgICAgdXBkYXRlZE5vZGVzLnB1c2gobk5ldyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBjYXNlICdleGlzdGluZyc6IHtcbiAgICAgICAgbGV0IG5FeGlzdGluZyA9IGxhc3ROb2Rlc1tkaWZmLmZyb21dO1xuXG4gICAgICAgIHBhcmVudEVsLmluc2VydEJlZm9yZShuRXhpc3RpbmcsIGN1cnNvci5uZXh0U2libGluZyk7XG4gICAgICAgIGN1cnNvciA9IG5FeGlzdGluZztcblxuICAgICAgICB1cGRhdGVkTm9kZXMucHVzaChuRXhpc3RpbmcpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBiaW5kaW5nLmxhc3RBcnJheSA9IG5ld0FycmF5O1xuICBiaW5kaW5nLmxhc3ROb2RlcyA9IHVwZGF0ZWROb2Rlcztcbn07XG5cbmV4cG9ydHMudXBkYXRlLm90aGVyUHJvcHMgPSAoZWwsIHByb3BOYW1lLCBiaW5kaW5nKSA9PiB7XG4gIGxldCBuZXdWYWx1ZSA9IGJpbmRpbmcuZ2V0KCk7XG4gIGxldCB7IGxhc3RWYWx1ZSB9ID0gYmluZGluZztcblxuICBpZiAobmV3VmFsdWUgIT09IGxhc3RWYWx1ZSkge1xuICAgIGlmIChcbiAgICAgIHByb3BOYW1lLnN0YXJ0c1dpdGgoJ2FyaWEtJykgfHxcbiAgICAgIHByb3BOYW1lLnN0YXJ0c1dpdGgoJ2RhdGEtJykgfHxcbiAgICAgIGVsLnRhZ05hbWUudG9VcHBlckNhc2UoKSA9PT0gJ1NWRydcbiAgICApIHtcbiAgICAgIGlmIChuZXdWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IG5ld1ZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIGVsLnJlbW92ZUF0dHJpYnV0ZShwcm9wTmFtZSk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgZWwuc2V0QXR0cmlidXRlKHByb3BOYW1lLCBuZXdWYWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgZWxbcHJvcE5hbWVdID0gbmV3VmFsdWU7XG4gICAgfVxuICB9XG5cbiAgYmluZGluZy5sYXN0VmFsdWUgPSBuZXdWYWx1ZTtcbn07XG5cbmV4cG9ydHMudXBkYXRlLnN0eWxlID0gKGVsLCBwcm9wTmFtZSwgYmluZGluZykgPT4ge1xuICBsZXQgbmV3VmFsdWVzID0gYmluZGluZy5nZXQoKTtcbiAgbGV0IHsgbGFzdFZhbHVlcyA9IHt9IH0gPSBiaW5kaW5nO1xuXG4gIGZvciAobGV0IGsgb2YgbmV3IFNldChbXG4gICAgLi4uT2JqZWN0LmtleXMobGFzdFZhbHVlcyksXG4gICAgLi4uT2JqZWN0LmtleXMobmV3VmFsdWVzKSxcbiAgXSkpIHtcbiAgICBsZXQgdiA9IG5ld1ZhbHVlc1trXTtcblxuICAgIGlmICh2ICE9PSBsYXN0VmFsdWVzW2tdKSB7XG4gICAgICBpZiAodiA9PT0gdW5kZWZpbmVkIHx8IHYgPT09IG51bGwpIHtcbiAgICAgICAgZWwuc3R5bGUucmVtb3ZlUHJvcGVydHkoayk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgZWwuc3R5bGUuc2V0UHJvcGVydHkoaywgdik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYmluZGluZy5sYXN0VmFsdWVzID0gbmV3VmFsdWVzO1xufTtcblxuZXhwb3J0cy51cGRhdGUudGV4dCA9IChuLCBrZXksIGJpbmRpbmcpID0+IHtcbiAgbGV0IG5ld1ZhbHVlID0gYmluZGluZy5nZXQoKTtcblxuICBsZXQgbmV3VGV4dCA9IG5ld1ZhbHVlICE9PSB1bmRlZmluZWQgJiYgbmV3VmFsdWUgIT09IG51bGxcbiAgICA/IFN0cmluZyhuZXdWYWx1ZSlcbiAgICA6ICcnO1xuXG4gIGxldCB7IGxhc3RUZXh0IH0gPSBiaW5kaW5nO1xuXG4gIGlmIChuZXdUZXh0ICE9PSBsYXN0VGV4dCkge1xuICAgIGlmIChiaW5kaW5nLnRleHROb2RlKSB7XG4gICAgICBiaW5kaW5nLnRleHROb2RlLnJlbW92ZSgpO1xuICAgIH1cblxuICAgIG4ucGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUoXG4gICAgICBiaW5kaW5nLnRleHROb2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobmV3VGV4dCksXG4gICAgICBuLm5leHRTaWJsaW5nLFxuICAgICk7XG4gIH1cblxuICBiaW5kaW5nLmxhc3RUZXh0ID0gbmV3VGV4dDtcbn07XG5cbmV4cG9ydHMudXBkYXRlLnZhbHVlID0gKGVsLCBwcm9wTmFtZSwgYmluZGluZykgPT4ge1xuICBpZiAoIWJpbmRpbmcuc2V0SGFuZGxlcikge1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgYmluZGluZy5zZXRIYW5kbGVyID0gZXYgPT4ge1xuICAgICAgbGV0IHggPSBldi50YXJnZXQudmFsdWU7XG4gICAgICBiaW5kaW5nLmxhc3RWYWx1ZSA9IGJpbmRpbmcuc2V0ID8gYmluZGluZy5zZXQoeCkgOiB4O1xuXG4gICAgICBleHBvcnRzLnVwZGF0ZSgpO1xuICAgIH0pO1xuICB9XG5cbiAgaWYgKGJpbmRpbmcuZ2V0KSB7XG4gICAgbGV0IG5ld1ZhbHVlID0gYmluZGluZy5nZXQoKTtcbiAgICBsZXQgeyBsYXN0VmFsdWUgfSA9IGJpbmRpbmc7XG5cbiAgICBpZiAobmV3VmFsdWUgIT09IGxhc3RWYWx1ZSkge1xuICAgICAgZWwudmFsdWUgPSBuZXdWYWx1ZTtcbiAgICB9XG5cbiAgICBiaW5kaW5nLmxhc3RWYWx1ZSA9IG5ld1ZhbHVlO1xuICB9XG59O1xuIiwiJ3VzZSBzdHJpY3QnXG5cbnZhciBpbnNlcnRlZCA9IHt9XG52YXIgc2Vzc2lvbiA9IHt9XG52YXIgaXNfY2xpZW50ID0gdHlwZW9mIHdpbmRvdyA9PT0gJ29iamVjdCdcblxuLyoqXG4gKiBpbnNlcnQgY3NzIGluc2lkZSBoZWFkIHRhZy4gYW5kIHJldHVybiBhIGZ1bmN0aW9uIHRvIHJlbW92ZSBjc3MgYW5kIGNhY2hlZFxuICogQHBhcmFtICB7c3RyaW5nfSBjc3MgICAgIGNzcyBydWxlcyBzdHJpbmdcbiAqIEBwYXJhbSAge29iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7ZnVuY3Rpb259ICAgICAgIHJlbW92ZSB0aGUgc3R5bGUgZWxlbWVudCBhbmQgY2FjaGVkIGNzc1xuICovXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjc3MsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIGluc2VydChpbnNlcnRlZCwgY3NzLCBvcHRpb25zKVxufVxuXG4vKipcbiAqIHNhbWUgYXMgbW9kdWxlLmV4cG9ydHMuIFRoaXMgZm9yIHNlcnZlciBzaWRlIHJlbmRlcmluZ1xuICogaWYgY2FsbGVkIGluc2lkZSBhIHNlc3Npb24uXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGNzcyAgICAgY3NzIHJ1bGVzIHN0cmluZ1xuICogQHBhcmFtICB7b2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtmdW5jdGlvbn0gICAgICAgcmVtb3ZlIHRoZSBzdHlsZSBlbGVtZW50IGFuZCBjYWNoZWQgY3NzXG4gKi9cbmV4cG9ydHMuc2Vzc2lvbiA9IGZ1bmN0aW9uKGNzcywgb3B0aW9ucykge1xuICByZXR1cm4gaW5zZXJ0KHNlc3Npb24sIGNzcywgb3B0aW9ucylcbn1cblxuLyoqXG4gKiByZXR1cm4gY3NzIHN0cmluZ3MgaW4gYXJyYXlcbiAqIEByZXR1cm4ge2FycmF5fVxuICovXG5leHBvcnRzLmdldENzcyA9IGdldENzc1xuZnVuY3Rpb24gZ2V0Q3NzKCkge1xuICByZXR1cm4gT2JqZWN0LmtleXMoaW5zZXJ0ZWQpLmNvbmNhdChPYmplY3Qua2V5cyhzZXNzaW9uKSlcbn1cbmV4cG9ydHMuY2xlYW5BbGxDc3MgPSBmdW5jdGlvbigpIHtcbiAgY2xlYW5TdG9yZShpbnNlcnRlZClcbiAgY2xlYW5TdG9yZShzZXNzaW9uKVxufVxuXG5leHBvcnRzLmdldENzc0FuZFJlc2V0U2VzcyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY3NzID0gZ2V0Q3NzKClcbiAgY2xlYW5TdG9yZShzZXNzaW9uKVxuICByZXR1cm4gY3NzXG59XG5leHBvcnRzLmNsZWFuU2Vzc0NzcyA9IGZ1bmN0aW9uKCkge1xuICBjbGVhblN0b3JlKHNlc3Npb24pXG59XG5cbmZ1bmN0aW9uIGNsZWFuU3RvcmUoc3RvcmUpIHtcbiAgdmFyIGFyciA9IE9iamVjdC5rZXlzKHN0b3JlKVxuICBmb3IgKHZhciBpID0gMCwgbGVuID0gYXJyLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIGZuID0gc3RvcmVbYXJyW2ldXVxuICAgIGRlbGV0ZSBzdG9yZVthcnJbaV1dXG4gICAgZm4oKVxuICB9XG59XG5mdW5jdGlvbiBpbnNlcnQoc3RvcmUsIGNzcywgb3B0aW9ucykge1xuXG4gIGlmICghY3NzKSByZXR1cm4gbm9wXG4gIGlmIChzdG9yZVtjc3NdKSByZXR1cm4gc3RvcmVbY3NzXVxuICBzdG9yZVtjc3NdID0gcmVtb3ZlQ3NzXG5cbiAgdmFyIGVsbSA9IG51bGxcbiAgdmFyIGhlYWQgPSBudWxsXG5cbiAgaWYgKGlzX2NsaWVudCkge1xuICAgIGVsbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJylcbiAgICBlbG0uc2V0QXR0cmlidXRlKCd0eXBlJywgJ3RleHQvY3NzJylcblxuICAgIGlmICgndGV4dENvbnRlbnQnIGluIGVsbSkge1xuICAgICAgZWxtLnRleHRDb250ZW50ID0gY3NzXG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgZWxtLnN0eWxlU2hlZXQuY3NzVGV4dCA9IGNzc1xuICAgIH1cblxuICAgIGhlYWQgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaGVhZCcpWzBdXG4gICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5wcmVwZW5kKSB7XG4gICAgICBoZWFkLmluc2VydEJlZm9yZShlbG0sIGhlYWQuY2hpbGROb2Rlc1swXSlcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBoZWFkLmFwcGVuZENoaWxkKGVsbSlcbiAgICB9XG4gIH1cblxuICB2YXIgY2FsbGVkID0gZmFsc2UgLy8gYXZvaWQgZG91YmxlIGNhbGxcbiAgcmV0dXJuIHJlbW92ZUNzc1xuXG4gIGZ1bmN0aW9uIHJlbW92ZUNzcygpIHtcbiAgICBpZiAoY2FsbGVkKSByZXR1cm5cbiAgICBjYWxsZWQgPSB0cnVlXG5cbiAgICBkZWxldGUgc3RvcmVbY3NzXVxuICAgIGlmICghaXNfY2xpZW50KSByZXR1cm5cbiAgICBoZWFkLnJlbW92ZUNoaWxkKGVsbSlcbiAgfVxufVxuZnVuY3Rpb24gbm9wKCl7IH1cbiIsImxldCBIYW1idXJnZXJNZW51SWNvbiA9IHJlcXVpcmUoJy4uL0hhbWJ1cmdlck1lbnVJY29uJyk7XG5sZXQgZG9tID0gcmVxdWlyZSgnZG9taW5hbnQnKTtcbmxldCBpbmplY3RTdHlsZXMgPSByZXF1aXJlKCdpbmplY3QtY3NzJyk7XG5cbmluamVjdFN0eWxlcyhgXG4gIC5hcHBzRHJhd2VyIHtcbiAgICB0cmFuc2l0aW9uOiB0cmFuc2Zvcm0gbGluZWFyIDAuMDZzO1xuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCgtMTAwJSk7XG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGxlZnQ6IDA7XG4gICAgdG9wOiAwO1xuICAgIGJvdHRvbTogMDtcbiAgICBtaW4td2lkdGg6IDIwdnc7XG4gICAgcGFkZGluZzogMjBweCAwO1xuICAgIGNvbG9yOiAjMzMzO1xuICAgIGJhY2tncm91bmQtY29sb3I6IHdoaXRlO1xuICB9XG5cbiAgLmFwcHNEcmF3ZXIuYXBwc0RyYXdlci1tT3BlbiB7XG4gICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKDApO1xuICB9XG5cbiAgLmFwcHNEcmF3ZXItaGVhZGVyIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICBhbGlnbi1pdGVtczogY2VudGVyO1xuICAgIHBhZGRpbmc6IDEwcHggMjVweDtcbiAgfVxuXG4gIC5hcHBzRHJhd2VyLWxvZ28ge1xuICAgIHdpZHRoOiA0OHB4O1xuICAgIGhlaWdodDogNDhweDtcbiAgfVxuXG4gIC5hcHBzRHJhd2VyLWNsb3NlQnRuIHtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIG91dGxpbmU6IDA7XG4gICAgYm9yZGVyOiAwO1xuICAgIHBhZGRpbmc6IDEwcHg7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQ7XG4gICAgY3Vyc29yOiBwb2ludGVyO1xuICB9XG5cbiAgLmFwcHNEcmF3ZXItYXBwTGlzdCB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgIG1hcmdpbi10b3A6IDEwcHg7XG4gIH1cblxuICAuYXBwc0RyYXdlci1hcHBMaXN0SXRlbSB7XG4gICAgb3V0bGluZTogMDtcbiAgICBib3JkZXI6IDA7XG4gICAgcGFkZGluZzogMTBweCAzMHB4O1xuICAgIHBhZGRpbmctYm90dG9tOiA5cHg7XG4gICAgZm9udC1mYW1pbHk6IGluaGVyaXQ7XG4gICAgZm9udC1zaXplOiBpbmhlcml0O1xuICAgIHRleHQtYWxpZ246IGxlZnQ7XG4gICAgY29sb3I6IGluaGVyaXQ7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQ7XG4gIH1cblxuICAuYXBwc0RyYXdlci1hcHBMaXN0SXRlbTpob3ZlciB7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogI2Y0ZjRmNDtcbiAgfVxuYCk7XG5cbm1vZHVsZS5leHBvcnRzID0gcHJvcHMgPT4ge1xuICBsZXQgbW9kZWwgPSB7XG4gICAgZ2V0IGlzT3BlbigpIHtcbiAgICAgIHJldHVybiBkb20ucmVzb2x2ZShwcm9wcykuaXNPcGVuO1xuICAgIH0sXG5cbiAgICBhcHBzOiBbXG4gICAgICB7IGxhYmVsOiAnRmlsZXMnIH0sXG4gICAgICB7IGxhYmVsOiAnTWV0YWwgV2ViIEJyb3dzZXInIH0sXG4gICAgXSxcblxuICAgIGxhdW5jaChhcHApIHtcbiAgICAgIGNvbnNvbGUubG9nKGBMYXVuY2ggJHthcHAubGFiZWx9Li4uYCk7XG4gICAgICBtb2RlbC5jbG9zZSgpO1xuICAgIH0sXG5cbiAgICBjbG9zZSgpIHtcbiAgICAgIGxldCBmbiA9IGRvbS5yZXNvbHZlKHByb3BzKS5vbkNsb3NlO1xuICAgICAgZm4gJiYgZm4oKTtcbiAgICB9LFxuICB9O1xuXG4gIHJldHVybiBkb20uZWwoJ2RpdicsIHtcbiAgICBtb2RlbCxcblxuICAgIGNsYXNzOiBkb20uYmluZGluZygoKSA9PiAoe1xuICAgICAgYXBwc0RyYXdlcjogdHJ1ZSxcbiAgICAgICdhcHBzRHJhd2VyLW1PcGVuJzogbW9kZWwuaXNPcGVuLFxuICAgIH0pKSxcbiAgfSwgW1xuICAgIGRvbS5lbCgnZGl2JywgeyBjbGFzczogJ2FwcHNEcmF3ZXItaGVhZGVyJyB9LCBbXG4gICAgICBkb20uZWwoJ2ltZycsIHtcbiAgICAgICAgY2xhc3M6ICdhcHBzRHJhd2VyLWxvZ28nLFxuICAgICAgICBzcmM6ICdpbWcvYXBwc0RyYXdlckxvZ28uc3ZnJyxcbiAgICAgIH0pLFxuXG4gICAgICBkb20uZWwoJ2J1dHRvbicsIHtcbiAgICAgICAgY2xhc3M6ICdhcHBzRHJhd2VyLWNsb3NlQnRuJyxcbiAgICAgICAgb25DbGljazogbW9kZWwuY2xvc2UsXG4gICAgICB9LCBbXG4gICAgICAgIEhhbWJ1cmdlck1lbnVJY29uKCksXG4gICAgICBdKSxcbiAgICBdKSxcblxuICAgIGRvbS5lbCgnZGl2JywgeyBjbGFzczogJ2FwcHNEcmF3ZXItYXBwTGlzdCcgfSwgW1xuICAgICAgZG9tLm1hcChtb2RlbC5hcHBzLCBhcHAgPT4gKFxuICAgICAgICBkb20uZWwoJ2J1dHRvbicsIHtcbiAgICAgICAgICBjbGFzczogJ2FwcHNEcmF3ZXItYXBwTGlzdEl0ZW0nLFxuICAgICAgICAgIG9uQ2xpY2s6ICgpID0+IG1vZGVsLmxhdW5jaChhcHApLFxuICAgICAgICB9LCBbXG4gICAgICAgICAgZG9tLnRleHQoKCkgPT4gYXBwLmxhYmVsKSxcbiAgICAgICAgXSkpXG4gICAgICApLFxuICAgIF0pLFxuICBdKTtcbn07XG4iLCJsZXQgZG9tID0gcmVxdWlyZSgnZG9taW5hbnQnKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gKCkgPT4gZG9tLmh0bWwoYFxyXG4gIDxzdmcgeD1cIjBweFwiIHk9XCIwcHhcIiB2aWV3Qm94PVwiMCAwIDU2IDU2XCIgZmlsbD1cImN1cnJlbnRDb2xvclwiIHhtbDpzcGFjZT1cInByZXNlcnZlXCI+XHJcbiAgICA8Zz5cclxuICAgICAgPHBhdGggZD1cIk04LDQwYy00LjQxMSwwLTgsMy41ODktOCw4czMuNTg5LDgsOCw4czgtMy41ODksOC04UzEyLjQxMSw0MCw4LDQwelwiIC8+XHJcbiAgICAgIDxwYXRoIGQ9XCJNMjgsNDBjLTQuNDExLDAtOCwzLjU4OS04LDhzMy41ODksOCw4LDhzOC0zLjU4OSw4LThTMzIuNDExLDQwLDI4LDQwelwiIC8+XHJcbiAgICAgIDxwYXRoIGQ9XCJNNDgsNDBjLTQuNDExLDAtOCwzLjU4OS04LDhzMy41ODksOCw4LDhzOC0zLjU4OSw4LThTNTIuNDExLDQwLDQ4LDQwelwiIC8+XHJcbiAgICAgIDxwYXRoIGQ9XCJNOCwyMGMtNC40MTEsMC04LDMuNTg5LTgsOHMzLjU4OSw4LDgsOHM4LTMuNTg5LDgtOFMxMi40MTEsMjAsOCwyMHpcIiAvPlxyXG4gICAgICA8cGF0aCBkPVwiTTI4LDIwYy00LjQxMSwwLTgsMy41ODktOCw4czMuNTg5LDgsOCw4czgtMy41ODksOC04UzMyLjQxMSwyMCwyOCwyMHpcIiAvPlxyXG4gICAgICA8cGF0aCBkPVwiTTQ4LDIwYy00LjQxMSwwLTgsMy41ODktOCw4czMuNTg5LDgsOCw4czgtMy41ODksOC04UzUyLjQxMSwyMCw0OCwyMHpcIiAvPlxyXG4gICAgICA8cGF0aCBkPVwiTTgsMEMzLjU4OSwwLDAsMy41ODksMCw4czMuNTg5LDgsOCw4czgtMy41ODksOC04UzEyLjQxMSwwLDgsMHpcIiAvPlxyXG4gICAgICA8cGF0aCBkPVwiTTI4LDBjLTQuNDExLDAtOCwzLjU4OS04LDhzMy41ODksOCw4LDhzOC0zLjU4OSw4LThTMzIuNDExLDAsMjgsMHpcIiAvPlxyXG4gICAgICA8cGF0aCBkPVwiTTQ4LDE2YzQuNDExLDAsOC0zLjU4OSw4LThzLTMuNTg5LTgtOC04cy04LDMuNTg5LTgsOFM0My41ODksMTYsNDgsMTZ6XCIgLz5cclxuICAgIDwvZz5cclxuICA8L3N2Zz5cclxuYCk7XHJcbiIsImxldCBBcHBzRHJhd2VyID0gcmVxdWlyZSgnLi4vQXBwc0RyYXdlcicpO1xubGV0IEJ0bkljb24gPSByZXF1aXJlKCcuL0J0bkljb24nKTtcbmxldCBkb20gPSByZXF1aXJlKCdkb21pbmFudCcpO1xubGV0IGluamVjdFN0eWxlcyA9IHJlcXVpcmUoJ2luamVjdC1jc3MnKTtcblxuaW5qZWN0U3R5bGVzKGBcbiAgLmFwcHNNZW51IHtcbiAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgZGlzcGxheTogZmxleDtcbiAgfVxuXG4gIC5hcHBzTWVudS1idG4ge1xuICAgIHRyYW5zaXRpb246IGNvbG9yIGVhc2UgMC4zcztcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIG91dGxpbmU6IDA7XG4gICAgYm9yZGVyOiAwO1xuICAgIHBhZGRpbmc6IDRweDtcbiAgICBjb2xvcjogcmdiYSgyMzgsIDIzOCwgMjM4LCAwLjIpO1xuICAgIGJhY2tncm91bmQtY29sb3I6IHRyYW5zcGFyZW50O1xuICB9XG5cbiAgLmFwcHNNZW51LWJ0bjpob3ZlciB7XG4gICAgY29sb3I6IHJnYmEoMjM4LCAyMzgsIDIzOCwgMC44KTtcbiAgfVxuXG4gIC5hcHBzTWVudS1idG5JY29uIHtcbiAgICB3aWR0aDogMTZweDtcbiAgICBoZWlnaHQ6IDE2cHg7XG4gICAgZmlsbDogY3VycmVudENvbG9yO1xuICB9XG5cbiAgLmFwcHNNZW51LWRyYXdlckJhY2tkcm9wIHtcbiAgICB0cmFuc2l0aW9uOiBiYWNrZ3JvdW5kLWNvbG9yIGxpbmVhciAwLjFzO1xuICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICBsZWZ0OiAwO1xuICAgIHRvcDogMDtcbiAgICByaWdodDogMDtcbiAgICBib3R0b206IDA7XG4gICAgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQ7XG4gICAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gIH1cblxuICAuYXBwc01lbnUtZHJhd2VyQmFja2Ryb3AuYXBwc01lbnUtbU9wZW4ge1xuICAgIGJhY2tncm91bmQtY29sb3I6IHJnYmEoMCwgMCwgMCwgMC4zKTtcbiAgICBwb2ludGVyLWV2ZW50czogYWxsO1xuICB9XG5gKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoKSA9PiB7XG4gIGxldCBtb2RlbCA9IHt9O1xuXG4gIHJldHVybiBkb20uZWwoJ2RpdicsIHsgbW9kZWwsIGNsYXNzOiAnYXBwc01lbnUnIH0sIFtcbiAgICBkb20uZWwoJ2J1dHRvbicsIHtcbiAgICAgIGNsYXNzOiAnYXBwc01lbnUtYnRuJyxcblxuICAgICAgb25DbGljazogKCkgPT4ge1xuICAgICAgICBtb2RlbC5pc09wZW4gPSAhbW9kZWwuaXNPcGVuO1xuICAgICAgICBkb20udXBkYXRlKCk7XG4gICAgICB9LFxuICAgIH0sIFtcbiAgICAgIGRvbS5lbChCdG5JY29uLCB7IGNsYXNzOiAnYXBwc01lbnUtYnRuSWNvbicgfSksXG4gICAgXSksXG5cbiAgICBkb20uZWwoJ2RpdicsIHtcbiAgICAgIGNsYXNzOiBkb20uYmluZGluZygoKSA9PiAoe1xuICAgICAgICAnYXBwc01lbnUtZHJhd2VyQmFja2Ryb3AnOiB0cnVlLFxuICAgICAgICAnYXBwc01lbnUtbU9wZW4nOiBtb2RlbC5pc09wZW4sXG4gICAgICB9KSksXG5cbiAgICAgIG9uQ2xpY2s6ICgpID0+IHtcbiAgICAgICAgbW9kZWwuaXNPcGVuID0gZmFsc2U7XG4gICAgICAgIGRvbS51cGRhdGUoKTtcbiAgICAgIH0sXG4gICAgfSksXG5cbiAgICBBcHBzRHJhd2VyKCgpID0+ICh7XG4gICAgICBpc09wZW46IG1vZGVsLmlzT3BlbixcblxuICAgICAgb25DbG9zZTogKCkgPT4ge1xuICAgICAgICBtb2RlbC5pc09wZW4gPSBmYWxzZTtcbiAgICAgICAgZG9tLnVwZGF0ZSgpO1xuICAgICAgfSxcbiAgICB9KSksXG4gIF0pO1xufTtcbiIsImxldCBEZXNrdG9wQmcgPSByZXF1aXJlKCcuL0Rlc2t0b3BCZycpO1xubGV0IERlc2t0b3BNZW51ID0gcmVxdWlyZSgnLi9EZXNrdG9wTWVudScpO1xubGV0IGRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XG5sZXQgaW5qZWN0U3R5bGVzID0gcmVxdWlyZSgnaW5qZWN0LWNzcycpO1xuXG5pbmplY3RTdHlsZXMoYFxuICAuZGVza3RvcCB7XG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGxlZnQ6IDA7XG4gICAgdG9wOiAwO1xuICAgIHJpZ2h0OiAwO1xuICAgIGJvdHRvbTogMDtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgZm9udC1mYW1pbHk6IHNhbnMtc2VyaWY7XG4gICAgZm9udC1zaXplOiAxNHB4O1xuICAgIGNvbG9yOiAjZWVlO1xuICB9XG5gKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoKSA9PiB7XG4gIGxldCBtb2RlbCA9IHt9O1xuXG4gIHJldHVybiBkb20uZWwoJ2RpdicsIHsgbW9kZWwsIGNsYXNzOiAnZGVza3RvcCcgfSwgW1xuICAgIG1vZGVsLmRlc2t0b3BCZyA9IERlc2t0b3BCZygpLFxuICAgIG1vZGVsLmRlc2t0b3BNZW51ID0gRGVza3RvcE1lbnUoKSxcbiAgXSk7XG59O1xuIiwibGV0IGRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XG5sZXQgaW5qZWN0U3R5bGVzID0gcmVxdWlyZSgnaW5qZWN0LWNzcycpO1xuXG5pbmplY3RTdHlsZXMoYFxuICAuZGVza3RvcEJnIHtcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgbGVmdDogMDtcbiAgICB0b3A6IDA7XG4gICAgcmlnaHQ6IDA7XG4gICAgYm90dG9tOiAwO1xuICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICB9XG5cbiAgLmRlc2t0b3BCZy1pbWcge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICBsZWZ0OiAwO1xuICAgIHRvcDogMDtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBvYmplY3QtZml0OiBjb250YWluO1xuICB9XG5gKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoKSA9PiBkb20uZWwoJ2RpdicsIHsgY2xhc3M6ICdkZXNrdG9wQmcnIH0sIFtcbiAgZG9tLmVsKCdpbWcnLCB7XG4gICAgY2xhc3M6ICdkZXNrdG9wQmctaW1nJyxcbiAgICBzcmM6ICdpbWcvd2FsbHBhcGVyLmpwZycsXG4gIH0pLFxuXSk7XG4iLCJsZXQgQXBwc01lbnUgPSByZXF1aXJlKCcuL0FwcHNNZW51Jyk7XG5sZXQgZG9tID0gcmVxdWlyZSgnZG9taW5hbnQnKTtcbmxldCBpbmplY3RTdHlsZXMgPSByZXF1aXJlKCdpbmplY3QtY3NzJyk7XG5cbmluamVjdFN0eWxlcyhgXG4gIC5kZXNrdG9wTWVudSB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gIH1cbmApO1xuXG5tb2R1bGUuZXhwb3J0cyA9ICgpID0+IHtcbiAgbGV0IG1vZGVsID0ge307XG5cbiAgcmV0dXJuIGRvbS5lbCgnZGl2JywgeyBtb2RlbCwgY2xhc3M6ICdkZXNrdG9wTWVudScgfSwgW1xuICAgIGRvbS5lbCgnZGl2JywgeyBjbGFzczogJ2Rlc2t0b3BNZW51LWxlZnRCb3gnIH0sIFtcbiAgICAgIG1vZGVsLmFwcHNNZW51ID0gQXBwc01lbnUoKSxcbiAgICBdKSxcbiAgXSk7XG59O1xuIiwibGV0IGRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9ICgpID0+IGRvbS5odG1sKGBcclxuICA8c3ZnIHdpZHRoPVwiMTVweFwiIGhlaWdodD1cIjE1cHhcIiB4PVwiMHB4XCIgeT1cIjBweFwiIHZpZXdCb3g9XCIwIDAgNDU5IDQ1OVwiIHhtbDpzcGFjZT1cInByZXNlcnZlXCI+XHJcbiAgICA8Zz5cclxuICAgICAgPGc+XHJcbiAgICAgICAgPHBhdGggZD1cIk0wLDM4Mi41aDQ1OXYtNTFIMFYzODIuNXogTTAsMjU1aDQ1OXYtNTFIMFYyNTV6IE0wLDc2LjV2NTFoNDU5di01MUgwelwiIC8+XHJcbiAgICAgIDwvZz5cclxuICAgIDwvZz5cclxuICA8L3N2Zz5cclxuYCk7XHJcbiJdfQ==
