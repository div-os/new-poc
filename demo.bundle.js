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

exports.el = (tagNameOrEl, ...args) => {
  let props;

  if (args[0] && args[0].constructor === Object) {
    props = args.shift();
  }

  let el = tagNameOrEl instanceof Element
    ? tagNameOrEl
    : document.createElement(tagNameOrEl);

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
      dom.el(BtnIcon(), { class: 'appsMenu-btnIcon' }),
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJkZW1vLmpzIiwibm9kZV9tb2R1bGVzL2RvbWluYW50L2FycmF5RGlmZi5qcyIsIm5vZGVfbW9kdWxlcy9kb21pbmFudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9pbmplY3QtY3NzL2luZGV4LmpzIiwidWkvQXBwc0RyYXdlci9pbmRleC5qcyIsInVpL0FwcHNNZW51L0J0bkljb24uanMiLCJ1aS9BcHBzTWVudS9pbmRleC5qcyIsInVpL0Rlc2t0b3AuanMiLCJ1aS9EZXNrdG9wQmcuanMiLCJ1aS9EZXNrdG9wTWVudS5qcyIsInVpL0hhbWJ1cmdlck1lbnVJY29uLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdhQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwibGV0IERlc2t0b3AgPSByZXF1aXJlKCcuL3VpL0Rlc2t0b3AnKTtcblxud2luZG93LmRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XG5cbndpbmRvdy5kaXZvcyA9IHt9O1xuZGl2b3MudWkgPSB7fTtcblxuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmQoZGl2b3MudWkuZGVza3RvcCA9IERlc2t0b3AoKSk7XG59KTtcbiIsIm1vZHVsZS5leHBvcnRzID0gKGEsIGIpID0+IHtcbiAgbGV0IGRpZmZzID0ge1xuICAgIG1vdmVkOiBbXSxcbiAgICBhZGRlZDogW10sXG4gICAgcmVtb3ZlZDogW10sXG4gIH07XG5cbiAgZm9yIChsZXQgW2ksIHhdIG9mIGEuZW50cmllcygpKSB7XG4gICAgaWYgKGJbaV0gPT09IHgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGxldCBuZXdJbmRleCA9IGIuZmluZEluZGV4KCh5LCBqKSA9PiB7XG4gICAgICBpZiAoeSAhPT0geCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiAhZGlmZnMubW92ZWQuc29tZShcbiAgICAgICAgeiA9PiB6LnZhbHVlID09PSB5ICYmIHoudG8gIT09IGosXG4gICAgICApO1xuICAgIH0pO1xuXG4gICAgaWYgKG5ld0luZGV4ID09PSAtMSkge1xuICAgICAgZGlmZnMucmVtb3ZlZC5wdXNoKHsgZnJvbTogaSB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGRpZmZzLm1vdmVkLnB1c2goe1xuICAgICAgdmFsdWU6IHgsXG4gICAgICBmcm9tOiBpLFxuICAgICAgdG86IG5ld0luZGV4LFxuICAgIH0pO1xuICB9XG5cbiAgZm9yIChsZXQgW2ksIHhdIG9mIGIuZW50cmllcygpKSB7XG4gICAgaWYgKGFbaV0gPT09IHgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChkaWZmcy5tb3ZlZC5zb21lKHkgPT4geS52YWx1ZSA9PSB4ICYmIHkudG8gPT09IGkpKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBkaWZmcy5hZGRlZC5wdXNoKHtcbiAgICAgIHZhbHVlOiB4LFxuICAgICAgdG86IGksXG4gICAgfSk7XG4gIH1cbiAgXG4gIGlmIChPYmplY3QudmFsdWVzKGRpZmZzKS5ldmVyeSh4ID0+IHgubGVuZ3RoID09PSAwKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcmV0dXJuIGIubWFwKCh4LCBpKSA9PiB7XG4gICAgaWYgKGFbaV0gPT09IHgpIHtcbiAgICAgIHJldHVybiB7IHR5cGU6ICdleGlzdGluZycsIGZyb206IGkgfTtcbiAgICB9XG5cbiAgICBsZXQgbW92ZWQgPSBkaWZmcy5tb3ZlZC5maW5kKHkgPT4geS50byA9PT0gaSk7XG5cbiAgICByZXR1cm4gbW92ZWRcbiAgICAgID8geyB0eXBlOiAnZXhpc3RpbmcnLCBmcm9tOiBtb3ZlZC5mcm9tIH1cbiAgICAgIDogeyB0eXBlOiAnbmV3JywgdmFsdWU6IHggfTtcbiAgfSk7XG59O1xuIiwibGV0IGFycmF5RGlmZiA9IHJlcXVpcmUoJy4vYXJyYXlEaWZmJyk7XG5cbmV4cG9ydHMuQmluZGluZyA9IGNsYXNzIEJpbmRpbmcge1xuICBjb25zdHJ1Y3Rvcih4KSB7XG4gICAgc3dpdGNoICh0eXBlb2YgeCkge1xuICAgICAgY2FzZSAnZnVuY3Rpb24nOlxuICAgICAgICB0aGlzLmdldCA9IHg7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIHgpO1xuICAgICAgICBicmVhaztcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIGJpbmRpbmcgYXJndW1lbnQgdHlwZSBcIiR7dHlwZW9mIHh9XCJgKTtcbiAgICB9XG4gIH1cbn07XG5cbmV4cG9ydHMuYmluZGluZyA9ICguLi5hcmdzKSA9PiBuZXcgZXhwb3J0cy5CaW5kaW5nKC4uLmFyZ3MpO1xuXG5leHBvcnRzLmJvdW5kTm9kZXMgPSBuZXcgU2V0KCk7XG5cbmV4cG9ydHMuY29tbWVudCA9IHRleHQgPT4gZG9jdW1lbnQuY3JlYXRlQ29tbWVudChgICR7dGV4dCB8fCAnY29tbWVudCd9IGApO1xuXG5leHBvcnRzLmVsID0gKHRhZ05hbWVPckVsLCAuLi5hcmdzKSA9PiB7XG4gIGxldCBwcm9wcztcblxuICBpZiAoYXJnc1swXSAmJiBhcmdzWzBdLmNvbnN0cnVjdG9yID09PSBPYmplY3QpIHtcbiAgICBwcm9wcyA9IGFyZ3Muc2hpZnQoKTtcbiAgfVxuXG4gIGxldCBlbCA9IHRhZ05hbWVPckVsIGluc3RhbmNlb2YgRWxlbWVudFxuICAgID8gdGFnTmFtZU9yRWxcbiAgICA6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZU9yRWwpO1xuXG4gIGZvciAobGV0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhwcm9wcyB8fCB7fSkpIHtcbiAgICBpZiAodiBpbnN0YW5jZW9mIGV4cG9ydHMuQmluZGluZykge1xuICAgICAgbGV0IGVsQmluZGluZ3MgPSBlbC5iaW5kaW5ncyA9IGVsLmJpbmRpbmdzIHx8IHt9O1xuICAgICAgbGV0IHByb3BCaW5kaW5ncyA9IGVsQmluZGluZ3Nba10gPSBlbEJpbmRpbmdzW2tdIHx8IFtdO1xuXG4gICAgICBwcm9wQmluZGluZ3MucHVzaCh2KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChrLnN0YXJ0c1dpdGgoJ29uJykpIHtcbiAgICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoay5yZXBsYWNlKC9eb246Py8sICcnKS50b0xvd2VyQ2FzZSgpLCB2KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgIGsuc3RhcnRzV2l0aCgnYXJpYS0nKSB8fFxuICAgICAgay5zdGFydHNXaXRoKCdkYXRhLScpIHx8XG4gICAgICBlbC50YWdOYW1lLnRvVXBwZXJDYXNlKCkgPT09ICdTVkcnXG4gICAgKSB7XG4gICAgICBlbC5zZXRBdHRyaWJ1dGUoaywgdik7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoayA9PT0gJ2NsYXNzJykge1xuICAgICAgayA9ICdjbGFzc05hbWUnO1xuICAgIH1cblxuICAgIGVsW2tdID0gdjtcbiAgfVxuXG4gIGlmIChhcmdzLmxlbmd0aCkge1xuICAgIGVsLmlubmVySFRNTCA9ICcnO1xuICAgIGVsLmFwcGVuZCguLi5hcmdzLmZsYXQoMTApKTtcbiAgfVxuXG4gIGlmIChlbC5iaW5kaW5ncyAmJiBkb2N1bWVudC5ib2R5LmNvbnRhaW5zKGVsKSkge1xuICAgIGV4cG9ydHMudXBkYXRlKGVsKTtcbiAgICBleHBvcnRzLmJvdW5kTm9kZXMuYWRkKGVsKTtcbiAgfVxuXG4gIHJldHVybiBlbDtcbn07XG5cbmV4cG9ydHMuaHRtbCA9IGh0bWwgPT4ge1xuICBsZXQgd3JhcHBlciA9IGV4cG9ydHMuZWwoJ2RpdicpO1xuXG4gIHdyYXBwZXIuaW5uZXJIVE1MID0gaHRtbC50cmltKCk7XG5cbiAgc3dpdGNoICh3cmFwcGVyLmNoaWxkTm9kZXMubGVuZ3RoKSB7XG4gICAgY2FzZSAwOlxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBjYXNlIDE6XG4gICAgICByZXR1cm4gd3JhcHBlci5jaGlsZE5vZGVzWzBdO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBbLi4ud3JhcHBlci5jaGlsZE5vZGVzXTtcbiAgfVxufTtcblxuZXhwb3J0cy5pZiA9IChwcmVkRm4sIHRoZW5Ob2RlLCBlbHNlTm9kZSkgPT4ge1xuICBsZXQgYW5jaG9yQ29tbWVudCA9IGV4cG9ydHMuY29tbWVudCgnYW5jaG9yQ29tbWVudDogY29uZGl0aW9uYWwnKTtcblxuICBhbmNob3JDb21tZW50LmJpbmRpbmdzID0ge1xuICAgIGNvbmRpdGlvbmFsOiBbZG9tLmJpbmRpbmcoeyBnZXQ6IHByZWRGbiwgdGhlbk5vZGUsIGVsc2VOb2RlIH0pXSxcbiAgfTtcblxuICByZXR1cm4gYW5jaG9yQ29tbWVudDtcbn07XG5cbmV4cG9ydHMubWFwID0gKGFycmF5LCBmbikgPT4ge1xuICBsZXQgYW5jaG9yQ29tbWVudCA9IGV4cG9ydHMuY29tbWVudCgnYW5jaG9yQ29tbWVudDogbWFwJyk7XG5cbiAgYW5jaG9yQ29tbWVudC5iaW5kaW5ncyA9IHtcbiAgICBtYXA6IFtkb20uYmluZGluZyh7IGdldDogKCkgPT4gZXhwb3J0cy5yZXNvbHZlKGFycmF5KSwgZm4gfSldLFxuICB9O1xuXG4gIHJldHVybiBhbmNob3JDb21tZW50O1xufTtcblxuZXhwb3J0cy5tdXRhdGlvbk9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIobXV0cyA9PiB7XG4gIGxldCB7IGJvZHkgfSA9IGRvY3VtZW50O1xuICBsZXQgeyBib3VuZE5vZGVzIH0gPSBleHBvcnRzO1xuXG4gIGxldCBib3VuZE5vZGVzQXJyYXkgPSBbLi4uYm91bmROb2Rlc107XG5cbiAgbGV0IGFkZGVkTm9kZXMgPSBtdXRzLm1hcCh4ID0+IFsuLi54LmFkZGVkTm9kZXNdKS5mbGF0KCk7XG5cbiAgbGV0IHJlbW92ZWROb2RlcyA9IG11dHMubWFwKHggPT4gWy4uLngucmVtb3ZlZE5vZGVzXSkuZmxhdCgpLmZpbHRlcihcbiAgICB4ID0+ICFhZGRlZE5vZGVzLmluY2x1ZGVzKHgpLFxuICApO1xuXG4gIGxldCBkZXRhY2hlZEJvdW5kTm9kZXMgPSBbXTtcblxuICBmb3IgKGxldCBuIG9mIHJlbW92ZWROb2Rlcykge1xuICAgIGlmIChuLmJpbmRpbmdzKSB7XG4gICAgICBkZXRhY2hlZEJvdW5kTm9kZXMucHVzaChuKTtcbiAgICB9XG5cbiAgICBsZXQgZGV0YWNoZWRCb3VuZENoaWxkTm9kZXMgPSBib3VuZE5vZGVzQXJyYXkuZmlsdGVyKHggPT4gbi5jb250YWlucyh4KSk7XG4gICAgZGV0YWNoZWRCb3VuZE5vZGVzLnB1c2goLi4uZGV0YWNoZWRCb3VuZENoaWxkTm9kZXMpO1xuICB9XG5cbiAgZm9yIChsZXQgbiBvZiBkZXRhY2hlZEJvdW5kTm9kZXMpIHtcbiAgICBib3VuZE5vZGVzLmRlbGV0ZShuKTtcblxuICAgIGxldCB7IGxpc3RlbmVycyB9ID0gbi5iaW5kaW5ncyB8fCB7fTtcblxuICAgIGlmIChsaXN0ZW5lcnMpIHtcbiAgICAgIGZvciAobGV0IGZuIG9mIGxpc3RlbmVycy5kZXRhY2ggfHwgW10pIHtcbiAgICAgICAgZm4obik7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgbGV0IGF0dGFjaE5vZGUgPSBuID0+IHtcbiAgICBpZiAoYm91bmROb2Rlcy5oYXMobikpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBib3VuZE5vZGVzLmFkZChuKTtcbiAgICBleHBvcnRzLnVwZGF0ZShuKTtcbiAgfTtcblxuICBmb3IgKGxldCBuIG9mIGFkZGVkTm9kZXMpIHtcbiAgICBpZiAobi5iaW5kaW5ncykge1xuICAgICAgYXR0YWNoTm9kZShuKTtcbiAgICB9XG5cbiAgICBpZiAobi5ub2RlTmFtZSA9PT0gJyNjb21tZW50Jykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAoXG4gICAgICBsZXQgY2hpbGRDb21tZW50IG9mXG4gICAgICBbLi4ubi5jaGlsZE5vZGVzXS5maWx0ZXIoeCA9PiB4Lm5vZGVOYW1lID09PSAnI2NvbW1lbnQnKVxuICAgICkge1xuICAgICAgaWYgKGNoaWxkQ29tbWVudC5iaW5kaW5ncykge1xuICAgICAgICBhdHRhY2hOb2RlKGNoaWxkQ29tbWVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG4ucXVlcnlTZWxlY3RvckFsbCkge1xuICAgICAgZm9yIChsZXQgZWwgb2Ygbi5xdWVyeVNlbGVjdG9yQWxsKCcqJykpIHtcbiAgICAgICAgaWYgKGVsLmJpbmRpbmdzKSB7XG4gICAgICAgICAgYXR0YWNoTm9kZShlbCk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKFxuICAgICAgICAgIGxldCBjaGlsZENvbW1lbnQgb2ZcbiAgICAgICAgICBbLi4uZWwuY2hpbGROb2Rlc10uZmlsdGVyKHggPT4geC5ub2RlTmFtZSA9PT0gJyNjb21tZW50JylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKGNoaWxkQ29tbWVudC5iaW5kaW5ncykge1xuICAgICAgICAgICAgYXR0YWNoTm9kZShjaGlsZENvbW1lbnQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufSk7XG5cbmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XG4gIGV4cG9ydHMubXV0YXRpb25PYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHtcbiAgICBjaGlsZExpc3Q6IHRydWUsXG4gICAgc3VidHJlZTogdHJ1ZSxcbiAgfSk7XG59KTtcblxuZXhwb3J0cy5yZXNvbHZlID0geCA9PiB0eXBlb2YgeCA9PT0gJ2Z1bmN0aW9uJyA/IHgoKSA6IHg7XG5cbmV4cG9ydHMudGV4dCA9IGZuID0+IHtcbiAgbGV0IGFuY2hvckNvbW1lbnQgPSBleHBvcnRzLmNvbW1lbnQoJ2FuY2hvckNvbW1lbnQ6IHRleHQnKTtcblxuICBhbmNob3JDb21tZW50LmJpbmRpbmdzID0ge1xuICAgIHRleHQ6IFtkb20uYmluZGluZyh7IGdldDogZm4gfSldLFxuICB9O1xuXG4gIHJldHVybiBhbmNob3JDb21tZW50O1xufTtcblxuZXhwb3J0cy51cGRhdGUgPSAobiwga2V5LCBiaW5kaW5nKSA9PiB7XG4gIGlmICghbikge1xuICAgIGZvciAobGV0IG4gb2YgZXhwb3J0cy5ib3VuZE5vZGVzKSB7XG4gICAgICBleHBvcnRzLnVwZGF0ZShuKTtcbiAgICB9XG5cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIWtleSkge1xuICAgIGZvciAobGV0IGtleSBvZiBPYmplY3Qua2V5cyhuLmJpbmRpbmdzIHx8IHt9KSkge1xuICAgICAgZXhwb3J0cy51cGRhdGUobiwga2V5KTtcbiAgICB9XG5cbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIWJpbmRpbmcpIHtcbiAgICBmb3IgKGxldCBiaW5kaW5nIG9mIG4uYmluZGluZ3Nba2V5XSB8fCBbXSkge1xuICAgICAgZXhwb3J0cy51cGRhdGUobiwga2V5LCBiaW5kaW5nKTtcbiAgICB9XG5cbiAgICByZXR1cm47XG4gIH1cblxuICBsZXQgdXBkYXRlRm4gPSBleHBvcnRzLnVwZGF0ZVtrZXldIHx8IGV4cG9ydHMudXBkYXRlLm90aGVyUHJvcHM7XG4gIHVwZGF0ZUZuKG4sIGtleSwgYmluZGluZyk7XG59O1xuXG5leHBvcnRzLnVwZGF0ZS5jbGFzcyA9IChlbCwgcHJvcE5hbWUsIGJpbmRpbmcpID0+IHtcbiAgbGV0IG5ld1ZhbHVlcyA9IHt9O1xuICBsZXQgeyBsYXN0VmFsdWVzID0ge30gfSA9IGJpbmRpbmc7XG5cbiAgZm9yIChsZXQgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKGJpbmRpbmcuZ2V0KCkpKSB7XG4gICAgbmV3VmFsdWVzW2tdID0gQm9vbGVhbih2KTtcbiAgfVxuXG4gIGZvciAobGV0IGsgb2YgbmV3IFNldChbXG4gICAgLi4uT2JqZWN0LmtleXMobGFzdFZhbHVlcyksXG4gICAgLi4uT2JqZWN0LmtleXMobmV3VmFsdWVzKSxcbiAgXSkpIHtcbiAgICBsZXQgdiA9IG5ld1ZhbHVlc1trXTtcblxuICAgIGlmICh2ICE9PSBsYXN0VmFsdWVzW2tdKSB7XG4gICAgICBlbC5jbGFzc0xpc3QudG9nZ2xlKGssIHYpO1xuICAgIH1cbiAgfVxuXG4gIGJpbmRpbmcubGFzdFZhbHVlcyA9IG5ld1ZhbHVlcztcbn07XG5cbmV4cG9ydHMudXBkYXRlLmNvbmRpdGlvbmFsID0gKGVsLCBrZXksIGJpbmRpbmcpID0+IHtcbiAgbGV0IG5ld1ZhbHVlID0gQm9vbGVhbihiaW5kaW5nLmdldCgpKTtcbiAgbGV0IHsgbGFzdFZhbHVlIH0gPSBiaW5kaW5nO1xuXG4gIGlmIChsYXN0VmFsdWUgPT09IHVuZGVmaW5lZCB8fCBuZXdWYWx1ZSAhPT0gbGFzdFZhbHVlKSB7XG4gICAgbGV0IHBhcmVudEVsID0gZWwucGFyZW50RWxlbWVudDtcblxuICAgIGlmIChwYXJlbnRFbCkge1xuICAgICAgbGV0IG5OZXcgPSBuZXdWYWx1ZSA/IGJpbmRpbmcudGhlbk5vZGUgOiBiaW5kaW5nLmVsc2VOb2RlO1xuICAgICAgbGV0IG5PbGQgPSBuZXdWYWx1ZSA/IGJpbmRpbmcuZWxzZU5vZGUgOiBiaW5kaW5nLnRoZW5Ob2RlO1xuXG4gICAgICBpZiAobk5ldykge1xuICAgICAgICBwYXJlbnRFbC5pbnNlcnRCZWZvcmUobk5ldywgZWwubmV4dFNpYmxpbmcpO1xuICAgICAgfVxuXG4gICAgICBpZiAobk9sZCkge1xuICAgICAgICBuT2xkLnJlbW92ZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGJpbmRpbmcubGFzdFZhbHVlID0gbmV3VmFsdWU7XG59O1xuXG5leHBvcnRzLnVwZGF0ZS5tYXAgPSAoYW5jaG9yQ29tbWVudCwga2V5LCBiaW5kaW5nKSA9PiB7XG4gIGxldCBuZXdBcnJheSA9IFsuLi5iaW5kaW5nLmdldCgpIHx8IFtdXTtcbiAgbGV0IHsgbGFzdEFycmF5LCBsYXN0Tm9kZXMgfSA9IGJpbmRpbmc7XG5cbiAgbGV0IGRpZmZzID0gYXJyYXlEaWZmKGxhc3RBcnJheSB8fCBbXSwgbmV3QXJyYXkpO1xuXG4gIGlmICghZGlmZnMpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBmb3IgKGxldCBlbCBvZiBsYXN0Tm9kZXMgfHwgW10pIHtcbiAgICBlbC5yZW1vdmUoKTtcbiAgfVxuXG4gIGxldCBjdXJzb3IgPSBhbmNob3JDb21tZW50O1xuICBsZXQgcGFyZW50RWwgPSBhbmNob3JDb21tZW50LnBhcmVudEVsZW1lbnQ7XG4gIGxldCB1cGRhdGVkTm9kZXMgPSBbXTtcblxuICBmb3IgKGxldCBkaWZmIG9mIGRpZmZzKSB7XG4gICAgc3dpdGNoIChkaWZmLnR5cGUpIHtcbiAgICAgIGNhc2UgJ25ldyc6IHtcbiAgICAgICAgbGV0IG5OZXcgPSBiaW5kaW5nLmZuKGRpZmYudmFsdWUpO1xuXG4gICAgICAgIHBhcmVudEVsLmluc2VydEJlZm9yZShuTmV3LCBjdXJzb3IubmV4dFNpYmxpbmcpO1xuICAgICAgICBjdXJzb3IgPSBuTmV3O1xuXG4gICAgICAgIHVwZGF0ZWROb2Rlcy5wdXNoKG5OZXcpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY2FzZSAnZXhpc3RpbmcnOiB7XG4gICAgICAgIGxldCBuRXhpc3RpbmcgPSBsYXN0Tm9kZXNbZGlmZi5mcm9tXTtcblxuICAgICAgICBwYXJlbnRFbC5pbnNlcnRCZWZvcmUobkV4aXN0aW5nLCBjdXJzb3IubmV4dFNpYmxpbmcpO1xuICAgICAgICBjdXJzb3IgPSBuRXhpc3Rpbmc7XG5cbiAgICAgICAgdXBkYXRlZE5vZGVzLnB1c2gobkV4aXN0aW5nKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYmluZGluZy5sYXN0QXJyYXkgPSBuZXdBcnJheTtcbiAgYmluZGluZy5sYXN0Tm9kZXMgPSB1cGRhdGVkTm9kZXM7XG59O1xuXG5leHBvcnRzLnVwZGF0ZS5vdGhlclByb3BzID0gKGVsLCBwcm9wTmFtZSwgYmluZGluZykgPT4ge1xuICBsZXQgbmV3VmFsdWUgPSBiaW5kaW5nLmdldCgpO1xuICBsZXQgeyBsYXN0VmFsdWUgfSA9IGJpbmRpbmc7XG5cbiAgaWYgKG5ld1ZhbHVlICE9PSBsYXN0VmFsdWUpIHtcbiAgICBpZiAoXG4gICAgICBwcm9wTmFtZS5zdGFydHNXaXRoKCdhcmlhLScpIHx8XG4gICAgICBwcm9wTmFtZS5zdGFydHNXaXRoKCdkYXRhLScpIHx8XG4gICAgICBlbC50YWdOYW1lLnRvVXBwZXJDYXNlKCkgPT09ICdTVkcnXG4gICAgKSB7XG4gICAgICBpZiAobmV3VmFsdWUgPT09IHVuZGVmaW5lZCB8fCBuZXdWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBlbC5yZW1vdmVBdHRyaWJ1dGUocHJvcE5hbWUpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIGVsLnNldEF0dHJpYnV0ZShwcm9wTmFtZSwgbmV3VmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGVsW3Byb3BOYW1lXSA9IG5ld1ZhbHVlO1xuICAgIH1cbiAgfVxuXG4gIGJpbmRpbmcubGFzdFZhbHVlID0gbmV3VmFsdWU7XG59O1xuXG5leHBvcnRzLnVwZGF0ZS5zdHlsZSA9IChlbCwgcHJvcE5hbWUsIGJpbmRpbmcpID0+IHtcbiAgbGV0IG5ld1ZhbHVlcyA9IGJpbmRpbmcuZ2V0KCk7XG4gIGxldCB7IGxhc3RWYWx1ZXMgPSB7fSB9ID0gYmluZGluZztcblxuICBmb3IgKGxldCBrIG9mIG5ldyBTZXQoW1xuICAgIC4uLk9iamVjdC5rZXlzKGxhc3RWYWx1ZXMpLFxuICAgIC4uLk9iamVjdC5rZXlzKG5ld1ZhbHVlcyksXG4gIF0pKSB7XG4gICAgbGV0IHYgPSBuZXdWYWx1ZXNba107XG5cbiAgICBpZiAodiAhPT0gbGFzdFZhbHVlc1trXSkge1xuICAgICAgaWYgKHYgPT09IHVuZGVmaW5lZCB8fCB2ID09PSBudWxsKSB7XG4gICAgICAgIGVsLnN0eWxlLnJlbW92ZVByb3BlcnR5KGspO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIGVsLnN0eWxlLnNldFByb3BlcnR5KGssIHYpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGJpbmRpbmcubGFzdFZhbHVlcyA9IG5ld1ZhbHVlcztcbn07XG5cbmV4cG9ydHMudXBkYXRlLnRleHQgPSAobiwga2V5LCBiaW5kaW5nKSA9PiB7XG4gIGxldCBuZXdWYWx1ZSA9IGJpbmRpbmcuZ2V0KCk7XG5cbiAgbGV0IG5ld1RleHQgPSBuZXdWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIG5ld1ZhbHVlICE9PSBudWxsXG4gICAgPyBTdHJpbmcobmV3VmFsdWUpXG4gICAgOiAnJztcblxuICBsZXQgeyBsYXN0VGV4dCB9ID0gYmluZGluZztcblxuICBpZiAobmV3VGV4dCAhPT0gbGFzdFRleHQpIHtcbiAgICBpZiAoYmluZGluZy50ZXh0Tm9kZSkge1xuICAgICAgYmluZGluZy50ZXh0Tm9kZS5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBuLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKFxuICAgICAgYmluZGluZy50ZXh0Tm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKG5ld1RleHQpLFxuICAgICAgbi5uZXh0U2libGluZyxcbiAgICApO1xuICB9XG5cbiAgYmluZGluZy5sYXN0VGV4dCA9IG5ld1RleHQ7XG59O1xuXG5leHBvcnRzLnVwZGF0ZS52YWx1ZSA9IChlbCwgcHJvcE5hbWUsIGJpbmRpbmcpID0+IHtcbiAgaWYgKCFiaW5kaW5nLnNldEhhbmRsZXIpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGJpbmRpbmcuc2V0SGFuZGxlciA9IGV2ID0+IHtcbiAgICAgIGxldCB4ID0gZXYudGFyZ2V0LnZhbHVlO1xuICAgICAgYmluZGluZy5sYXN0VmFsdWUgPSBiaW5kaW5nLnNldCA/IGJpbmRpbmcuc2V0KHgpIDogeDtcblxuICAgICAgZXhwb3J0cy51cGRhdGUoKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmIChiaW5kaW5nLmdldCkge1xuICAgIGxldCBuZXdWYWx1ZSA9IGJpbmRpbmcuZ2V0KCk7XG4gICAgbGV0IHsgbGFzdFZhbHVlIH0gPSBiaW5kaW5nO1xuXG4gICAgaWYgKG5ld1ZhbHVlICE9PSBsYXN0VmFsdWUpIHtcbiAgICAgIGVsLnZhbHVlID0gbmV3VmFsdWU7XG4gICAgfVxuXG4gICAgYmluZGluZy5sYXN0VmFsdWUgPSBuZXdWYWx1ZTtcbiAgfVxufTtcbiIsIid1c2Ugc3RyaWN0J1xuXG52YXIgaW5zZXJ0ZWQgPSB7fVxudmFyIHNlc3Npb24gPSB7fVxudmFyIGlzX2NsaWVudCA9IHR5cGVvZiB3aW5kb3cgPT09ICdvYmplY3QnXG5cbi8qKlxuICogaW5zZXJ0IGNzcyBpbnNpZGUgaGVhZCB0YWcuIGFuZCByZXR1cm4gYSBmdW5jdGlvbiB0byByZW1vdmUgY3NzIGFuZCBjYWNoZWRcbiAqIEBwYXJhbSAge3N0cmluZ30gY3NzICAgICBjc3MgcnVsZXMgc3RyaW5nXG4gKiBAcGFyYW0gIHtvYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge2Z1bmN0aW9ufSAgICAgICByZW1vdmUgdGhlIHN0eWxlIGVsZW1lbnQgYW5kIGNhY2hlZCBjc3NcbiAqL1xuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY3NzLCBvcHRpb25zKSB7XG4gIHJldHVybiBpbnNlcnQoaW5zZXJ0ZWQsIGNzcywgb3B0aW9ucylcbn1cblxuLyoqXG4gKiBzYW1lIGFzIG1vZHVsZS5leHBvcnRzLiBUaGlzIGZvciBzZXJ2ZXIgc2lkZSByZW5kZXJpbmdcbiAqIGlmIGNhbGxlZCBpbnNpZGUgYSBzZXNzaW9uLlxuICogQHBhcmFtICB7c3RyaW5nfSBjc3MgICAgIGNzcyBydWxlcyBzdHJpbmdcbiAqIEBwYXJhbSAge29iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7ZnVuY3Rpb259ICAgICAgIHJlbW92ZSB0aGUgc3R5bGUgZWxlbWVudCBhbmQgY2FjaGVkIGNzc1xuICovXG5leHBvcnRzLnNlc3Npb24gPSBmdW5jdGlvbihjc3MsIG9wdGlvbnMpIHtcbiAgcmV0dXJuIGluc2VydChzZXNzaW9uLCBjc3MsIG9wdGlvbnMpXG59XG5cbi8qKlxuICogcmV0dXJuIGNzcyBzdHJpbmdzIGluIGFycmF5XG4gKiBAcmV0dXJuIHthcnJheX1cbiAqL1xuZXhwb3J0cy5nZXRDc3MgPSBnZXRDc3NcbmZ1bmN0aW9uIGdldENzcygpIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKGluc2VydGVkKS5jb25jYXQoT2JqZWN0LmtleXMoc2Vzc2lvbikpXG59XG5leHBvcnRzLmNsZWFuQWxsQ3NzID0gZnVuY3Rpb24oKSB7XG4gIGNsZWFuU3RvcmUoaW5zZXJ0ZWQpXG4gIGNsZWFuU3RvcmUoc2Vzc2lvbilcbn1cblxuZXhwb3J0cy5nZXRDc3NBbmRSZXNldFNlc3MgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGNzcyA9IGdldENzcygpXG4gIGNsZWFuU3RvcmUoc2Vzc2lvbilcbiAgcmV0dXJuIGNzc1xufVxuZXhwb3J0cy5jbGVhblNlc3NDc3MgPSBmdW5jdGlvbigpIHtcbiAgY2xlYW5TdG9yZShzZXNzaW9uKVxufVxuXG5mdW5jdGlvbiBjbGVhblN0b3JlKHN0b3JlKSB7XG4gIHZhciBhcnIgPSBPYmplY3Qua2V5cyhzdG9yZSlcbiAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFyci5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIHZhciBmbiA9IHN0b3JlW2FycltpXV1cbiAgICBkZWxldGUgc3RvcmVbYXJyW2ldXVxuICAgIGZuKClcbiAgfVxufVxuZnVuY3Rpb24gaW5zZXJ0KHN0b3JlLCBjc3MsIG9wdGlvbnMpIHtcblxuICBpZiAoIWNzcykgcmV0dXJuIG5vcFxuICBpZiAoc3RvcmVbY3NzXSkgcmV0dXJuIHN0b3JlW2Nzc11cbiAgc3RvcmVbY3NzXSA9IHJlbW92ZUNzc1xuXG4gIHZhciBlbG0gPSBudWxsXG4gIHZhciBoZWFkID0gbnVsbFxuXG4gIGlmIChpc19jbGllbnQpIHtcbiAgICBlbG0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpXG4gICAgZWxtLnNldEF0dHJpYnV0ZSgndHlwZScsICd0ZXh0L2NzcycpXG5cbiAgICBpZiAoJ3RleHRDb250ZW50JyBpbiBlbG0pIHtcbiAgICAgIGVsbS50ZXh0Q29udGVudCA9IGNzc1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGVsbS5zdHlsZVNoZWV0LmNzc1RleHQgPSBjc3NcbiAgICB9XG5cbiAgICBoZWFkID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2hlYWQnKVswXVxuICAgIGlmIChvcHRpb25zICYmIG9wdGlvbnMucHJlcGVuZCkge1xuICAgICAgaGVhZC5pbnNlcnRCZWZvcmUoZWxtLCBoZWFkLmNoaWxkTm9kZXNbMF0pXG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgaGVhZC5hcHBlbmRDaGlsZChlbG0pXG4gICAgfVxuICB9XG5cbiAgdmFyIGNhbGxlZCA9IGZhbHNlIC8vIGF2b2lkIGRvdWJsZSBjYWxsXG4gIHJldHVybiByZW1vdmVDc3NcblxuICBmdW5jdGlvbiByZW1vdmVDc3MoKSB7XG4gICAgaWYgKGNhbGxlZCkgcmV0dXJuXG4gICAgY2FsbGVkID0gdHJ1ZVxuXG4gICAgZGVsZXRlIHN0b3JlW2Nzc11cbiAgICBpZiAoIWlzX2NsaWVudCkgcmV0dXJuXG4gICAgaGVhZC5yZW1vdmVDaGlsZChlbG0pXG4gIH1cbn1cbmZ1bmN0aW9uIG5vcCgpeyB9XG4iLCJsZXQgSGFtYnVyZ2VyTWVudUljb24gPSByZXF1aXJlKCcuLi9IYW1idXJnZXJNZW51SWNvbicpO1xubGV0IGRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XG5sZXQgaW5qZWN0U3R5bGVzID0gcmVxdWlyZSgnaW5qZWN0LWNzcycpO1xuXG5pbmplY3RTdHlsZXMoYFxuICAuYXBwc0RyYXdlciB7XG4gICAgdHJhbnNpdGlvbjogdHJhbnNmb3JtIGxpbmVhciAwLjA2cztcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoLTEwMCUpO1xuICAgIHBvc2l0aW9uOiBmaXhlZDtcbiAgICBsZWZ0OiAwO1xuICAgIHRvcDogMDtcbiAgICBib3R0b206IDA7XG4gICAgbWluLXdpZHRoOiAyMHZ3O1xuICAgIHBhZGRpbmc6IDIwcHggMDtcbiAgICBjb2xvcjogIzMzMztcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiB3aGl0ZTtcbiAgfVxuXG4gIC5hcHBzRHJhd2VyLmFwcHNEcmF3ZXItbU9wZW4ge1xuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWCgwKTtcbiAgfVxuXG4gIC5hcHBzRHJhd2VyLWhlYWRlciB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICBwYWRkaW5nOiAxMHB4IDI1cHg7XG4gIH1cblxuICAuYXBwc0RyYXdlci1sb2dvIHtcbiAgICB3aWR0aDogNDhweDtcbiAgICBoZWlnaHQ6IDQ4cHg7XG4gIH1cblxuICAuYXBwc0RyYXdlci1jbG9zZUJ0biB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBvdXRsaW5lOiAwO1xuICAgIGJvcmRlcjogMDtcbiAgICBwYWRkaW5nOiAxMHB4O1xuICAgIGJhY2tncm91bmQtY29sb3I6IHRyYW5zcGFyZW50O1xuICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgfVxuXG4gIC5hcHBzRHJhd2VyLWFwcExpc3Qge1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICBtYXJnaW4tdG9wOiAxMHB4O1xuICB9XG5cbiAgLmFwcHNEcmF3ZXItYXBwTGlzdEl0ZW0ge1xuICAgIG91dGxpbmU6IDA7XG4gICAgYm9yZGVyOiAwO1xuICAgIHBhZGRpbmc6IDEwcHggMzBweDtcbiAgICBwYWRkaW5nLWJvdHRvbTogOXB4O1xuICAgIGZvbnQtZmFtaWx5OiBpbmhlcml0O1xuICAgIGZvbnQtc2l6ZTogaW5oZXJpdDtcbiAgICB0ZXh0LWFsaWduOiBsZWZ0O1xuICAgIGNvbG9yOiBpbmhlcml0O1xuICAgIGJhY2tncm91bmQtY29sb3I6IHRyYW5zcGFyZW50O1xuICB9XG5cbiAgLmFwcHNEcmF3ZXItYXBwTGlzdEl0ZW06aG92ZXIge1xuICAgIGJhY2tncm91bmQtY29sb3I6ICNmNGY0ZjQ7XG4gIH1cbmApO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHByb3BzID0+IHtcbiAgbGV0IG1vZGVsID0ge1xuICAgIGdldCBpc09wZW4oKSB7XG4gICAgICByZXR1cm4gZG9tLnJlc29sdmUocHJvcHMpLmlzT3BlbjtcbiAgICB9LFxuXG4gICAgYXBwczogW1xuICAgICAgeyBsYWJlbDogJ0ZpbGVzJyB9LFxuICAgICAgeyBsYWJlbDogJ01ldGFsIFdlYiBCcm93c2VyJyB9LFxuICAgIF0sXG5cbiAgICBsYXVuY2goYXBwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgTGF1bmNoICR7YXBwLmxhYmVsfS4uLmApO1xuICAgICAgbW9kZWwuY2xvc2UoKTtcbiAgICB9LFxuXG4gICAgY2xvc2UoKSB7XG4gICAgICBsZXQgZm4gPSBkb20ucmVzb2x2ZShwcm9wcykub25DbG9zZTtcbiAgICAgIGZuICYmIGZuKCk7XG4gICAgfSxcbiAgfTtcblxuICByZXR1cm4gZG9tLmVsKCdkaXYnLCB7XG4gICAgbW9kZWwsXG5cbiAgICBjbGFzczogZG9tLmJpbmRpbmcoKCkgPT4gKHtcbiAgICAgIGFwcHNEcmF3ZXI6IHRydWUsXG4gICAgICAnYXBwc0RyYXdlci1tT3Blbic6IG1vZGVsLmlzT3BlbixcbiAgICB9KSksXG4gIH0sIFtcbiAgICBkb20uZWwoJ2RpdicsIHsgY2xhc3M6ICdhcHBzRHJhd2VyLWhlYWRlcicgfSwgW1xuICAgICAgZG9tLmVsKCdpbWcnLCB7XG4gICAgICAgIGNsYXNzOiAnYXBwc0RyYXdlci1sb2dvJyxcbiAgICAgICAgc3JjOiAnaW1nL2FwcHNEcmF3ZXJMb2dvLnN2ZycsXG4gICAgICB9KSxcblxuICAgICAgZG9tLmVsKCdidXR0b24nLCB7XG4gICAgICAgIGNsYXNzOiAnYXBwc0RyYXdlci1jbG9zZUJ0bicsXG4gICAgICAgIG9uQ2xpY2s6IG1vZGVsLmNsb3NlLFxuICAgICAgfSwgW1xuICAgICAgICBIYW1idXJnZXJNZW51SWNvbigpLFxuICAgICAgXSksXG4gICAgXSksXG5cbiAgICBkb20uZWwoJ2RpdicsIHsgY2xhc3M6ICdhcHBzRHJhd2VyLWFwcExpc3QnIH0sIFtcbiAgICAgIGRvbS5tYXAobW9kZWwuYXBwcywgYXBwID0+IChcbiAgICAgICAgZG9tLmVsKCdidXR0b24nLCB7XG4gICAgICAgICAgY2xhc3M6ICdhcHBzRHJhd2VyLWFwcExpc3RJdGVtJyxcbiAgICAgICAgICBvbkNsaWNrOiAoKSA9PiBtb2RlbC5sYXVuY2goYXBwKSxcbiAgICAgICAgfSwgW1xuICAgICAgICAgIGRvbS50ZXh0KCgpID0+IGFwcC5sYWJlbCksXG4gICAgICAgIF0pKVxuICAgICAgKSxcbiAgICBdKSxcbiAgXSk7XG59O1xuIiwibGV0IGRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9ICgpID0+IGRvbS5odG1sKGBcclxuICA8c3ZnIHg9XCIwcHhcIiB5PVwiMHB4XCIgdmlld0JveD1cIjAgMCA1NiA1NlwiIGZpbGw9XCJjdXJyZW50Q29sb3JcIiB4bWw6c3BhY2U9XCJwcmVzZXJ2ZVwiPlxyXG4gICAgPGc+XHJcbiAgICAgIDxwYXRoIGQ9XCJNOCw0MGMtNC40MTEsMC04LDMuNTg5LTgsOHMzLjU4OSw4LDgsOHM4LTMuNTg5LDgtOFMxMi40MTEsNDAsOCw0MHpcIiAvPlxyXG4gICAgICA8cGF0aCBkPVwiTTI4LDQwYy00LjQxMSwwLTgsMy41ODktOCw4czMuNTg5LDgsOCw4czgtMy41ODksOC04UzMyLjQxMSw0MCwyOCw0MHpcIiAvPlxyXG4gICAgICA8cGF0aCBkPVwiTTQ4LDQwYy00LjQxMSwwLTgsMy41ODktOCw4czMuNTg5LDgsOCw4czgtMy41ODksOC04UzUyLjQxMSw0MCw0OCw0MHpcIiAvPlxyXG4gICAgICA8cGF0aCBkPVwiTTgsMjBjLTQuNDExLDAtOCwzLjU4OS04LDhzMy41ODksOCw4LDhzOC0zLjU4OSw4LThTMTIuNDExLDIwLDgsMjB6XCIgLz5cclxuICAgICAgPHBhdGggZD1cIk0yOCwyMGMtNC40MTEsMC04LDMuNTg5LTgsOHMzLjU4OSw4LDgsOHM4LTMuNTg5LDgtOFMzMi40MTEsMjAsMjgsMjB6XCIgLz5cclxuICAgICAgPHBhdGggZD1cIk00OCwyMGMtNC40MTEsMC04LDMuNTg5LTgsOHMzLjU4OSw4LDgsOHM4LTMuNTg5LDgtOFM1Mi40MTEsMjAsNDgsMjB6XCIgLz5cclxuICAgICAgPHBhdGggZD1cIk04LDBDMy41ODksMCwwLDMuNTg5LDAsOHMzLjU4OSw4LDgsOHM4LTMuNTg5LDgtOFMxMi40MTEsMCw4LDB6XCIgLz5cclxuICAgICAgPHBhdGggZD1cIk0yOCwwYy00LjQxMSwwLTgsMy41ODktOCw4czMuNTg5LDgsOCw4czgtMy41ODksOC04UzMyLjQxMSwwLDI4LDB6XCIgLz5cclxuICAgICAgPHBhdGggZD1cIk00OCwxNmM0LjQxMSwwLDgtMy41ODksOC04cy0zLjU4OS04LTgtOHMtOCwzLjU4OS04LDhTNDMuNTg5LDE2LDQ4LDE2elwiIC8+XHJcbiAgICA8L2c+XHJcbiAgPC9zdmc+XHJcbmApO1xyXG4iLCJsZXQgQXBwc0RyYXdlciA9IHJlcXVpcmUoJy4uL0FwcHNEcmF3ZXInKTtcbmxldCBCdG5JY29uID0gcmVxdWlyZSgnLi9CdG5JY29uJyk7XG5sZXQgZG9tID0gcmVxdWlyZSgnZG9taW5hbnQnKTtcbmxldCBpbmplY3RTdHlsZXMgPSByZXF1aXJlKCdpbmplY3QtY3NzJyk7XG5cbmluamVjdFN0eWxlcyhgXG4gIC5hcHBzTWVudSB7XG4gICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgIGRpc3BsYXk6IGZsZXg7XG4gIH1cblxuICAuYXBwc01lbnUtYnRuIHtcbiAgICB0cmFuc2l0aW9uOiBjb2xvciBlYXNlIDAuM3M7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBvdXRsaW5lOiAwO1xuICAgIGJvcmRlcjogMDtcbiAgICBwYWRkaW5nOiA0cHg7XG4gICAgY29sb3I6IHJnYmEoMjM4LCAyMzgsIDIzOCwgMC4yKTtcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiB0cmFuc3BhcmVudDtcbiAgfVxuXG4gIC5hcHBzTWVudS1idG46aG92ZXIge1xuICAgIGNvbG9yOiByZ2JhKDIzOCwgMjM4LCAyMzgsIDAuOCk7XG4gIH1cblxuICAuYXBwc01lbnUtYnRuSWNvbiB7XG4gICAgd2lkdGg6IDE2cHg7XG4gICAgaGVpZ2h0OiAxNnB4O1xuICAgIGZpbGw6IGN1cnJlbnRDb2xvcjtcbiAgfVxuXG4gIC5hcHBzTWVudS1kcmF3ZXJCYWNrZHJvcCB7XG4gICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciBsaW5lYXIgMC4xcztcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgbGVmdDogMDtcbiAgICB0b3A6IDA7XG4gICAgcmlnaHQ6IDA7XG4gICAgYm90dG9tOiAwO1xuICAgIGJhY2tncm91bmQtY29sb3I6IHRyYW5zcGFyZW50O1xuICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICB9XG5cbiAgLmFwcHNNZW51LWRyYXdlckJhY2tkcm9wLmFwcHNNZW51LW1PcGVuIHtcbiAgICBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDAsIDAsIDAsIDAuMyk7XG4gICAgcG9pbnRlci1ldmVudHM6IGFsbDtcbiAgfVxuYCk7XG5cbm1vZHVsZS5leHBvcnRzID0gKCkgPT4ge1xuICBsZXQgbW9kZWwgPSB7fTtcblxuICByZXR1cm4gZG9tLmVsKCdkaXYnLCB7IG1vZGVsLCBjbGFzczogJ2FwcHNNZW51JyB9LCBbXG4gICAgZG9tLmVsKCdidXR0b24nLCB7XG4gICAgICBjbGFzczogJ2FwcHNNZW51LWJ0bicsXG5cbiAgICAgIG9uQ2xpY2s6ICgpID0+IHtcbiAgICAgICAgbW9kZWwuaXNPcGVuID0gIW1vZGVsLmlzT3BlbjtcbiAgICAgICAgZG9tLnVwZGF0ZSgpO1xuICAgICAgfSxcbiAgICB9LCBbXG4gICAgICBkb20uZWwoQnRuSWNvbigpLCB7IGNsYXNzOiAnYXBwc01lbnUtYnRuSWNvbicgfSksXG4gICAgXSksXG5cbiAgICBkb20uZWwoJ2RpdicsIHtcbiAgICAgIGNsYXNzOiBkb20uYmluZGluZygoKSA9PiAoe1xuICAgICAgICAnYXBwc01lbnUtZHJhd2VyQmFja2Ryb3AnOiB0cnVlLFxuICAgICAgICAnYXBwc01lbnUtbU9wZW4nOiBtb2RlbC5pc09wZW4sXG4gICAgICB9KSksXG5cbiAgICAgIG9uQ2xpY2s6ICgpID0+IHtcbiAgICAgICAgbW9kZWwuaXNPcGVuID0gZmFsc2U7XG4gICAgICAgIGRvbS51cGRhdGUoKTtcbiAgICAgIH0sXG4gICAgfSksXG5cbiAgICBBcHBzRHJhd2VyKCgpID0+ICh7XG4gICAgICBpc09wZW46IG1vZGVsLmlzT3BlbixcblxuICAgICAgb25DbG9zZTogKCkgPT4ge1xuICAgICAgICBtb2RlbC5pc09wZW4gPSBmYWxzZTtcbiAgICAgICAgZG9tLnVwZGF0ZSgpO1xuICAgICAgfSxcbiAgICB9KSksXG4gIF0pO1xufTtcbiIsImxldCBEZXNrdG9wQmcgPSByZXF1aXJlKCcuL0Rlc2t0b3BCZycpO1xubGV0IERlc2t0b3BNZW51ID0gcmVxdWlyZSgnLi9EZXNrdG9wTWVudScpO1xubGV0IGRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XG5sZXQgaW5qZWN0U3R5bGVzID0gcmVxdWlyZSgnaW5qZWN0LWNzcycpO1xuXG5pbmplY3RTdHlsZXMoYFxuICAuZGVza3RvcCB7XG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIGxlZnQ6IDA7XG4gICAgdG9wOiAwO1xuICAgIHJpZ2h0OiAwO1xuICAgIGJvdHRvbTogMDtcbiAgICBkaXNwbGF5OiBmbGV4O1xuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgZm9udC1mYW1pbHk6IHNhbnMtc2VyaWY7XG4gICAgZm9udC1zaXplOiAxNHB4O1xuICAgIGNvbG9yOiAjZWVlO1xuICB9XG5gKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoKSA9PiB7XG4gIGxldCBtb2RlbCA9IHt9O1xuXG4gIHJldHVybiBkb20uZWwoJ2RpdicsIHsgbW9kZWwsIGNsYXNzOiAnZGVza3RvcCcgfSwgW1xuICAgIG1vZGVsLmRlc2t0b3BCZyA9IERlc2t0b3BCZygpLFxuICAgIG1vZGVsLmRlc2t0b3BNZW51ID0gRGVza3RvcE1lbnUoKSxcbiAgXSk7XG59O1xuIiwibGV0IGRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XG5sZXQgaW5qZWN0U3R5bGVzID0gcmVxdWlyZSgnaW5qZWN0LWNzcycpO1xuXG5pbmplY3RTdHlsZXMoYFxuICAuZGVza3RvcEJnIHtcbiAgICBwb3NpdGlvbjogZml4ZWQ7XG4gICAgbGVmdDogMDtcbiAgICB0b3A6IDA7XG4gICAgcmlnaHQ6IDA7XG4gICAgYm90dG9tOiAwO1xuICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICB9XG5cbiAgLmRlc2t0b3BCZy1pbWcge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICBsZWZ0OiAwO1xuICAgIHRvcDogMDtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBvYmplY3QtZml0OiBjb250YWluO1xuICB9XG5gKTtcblxubW9kdWxlLmV4cG9ydHMgPSAoKSA9PiBkb20uZWwoJ2RpdicsIHsgY2xhc3M6ICdkZXNrdG9wQmcnIH0sIFtcbiAgZG9tLmVsKCdpbWcnLCB7XG4gICAgY2xhc3M6ICdkZXNrdG9wQmctaW1nJyxcbiAgICBzcmM6ICdpbWcvd2FsbHBhcGVyLmpwZycsXG4gIH0pLFxuXSk7XG4iLCJsZXQgQXBwc01lbnUgPSByZXF1aXJlKCcuL0FwcHNNZW51Jyk7XG5sZXQgZG9tID0gcmVxdWlyZSgnZG9taW5hbnQnKTtcbmxldCBpbmplY3RTdHlsZXMgPSByZXF1aXJlKCdpbmplY3QtY3NzJyk7XG5cbmluamVjdFN0eWxlcyhgXG4gIC5kZXNrdG9wTWVudSB7XG4gICAgZGlzcGxheTogZmxleDtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gIH1cbmApO1xuXG5tb2R1bGUuZXhwb3J0cyA9ICgpID0+IHtcbiAgbGV0IG1vZGVsID0ge307XG5cbiAgcmV0dXJuIGRvbS5lbCgnZGl2JywgeyBtb2RlbCwgY2xhc3M6ICdkZXNrdG9wTWVudScgfSwgW1xuICAgIGRvbS5lbCgnZGl2JywgeyBjbGFzczogJ2Rlc2t0b3BNZW51LWxlZnRCb3gnIH0sIFtcbiAgICAgIG1vZGVsLmFwcHNNZW51ID0gQXBwc01lbnUoKSxcbiAgICBdKSxcbiAgXSk7XG59O1xuIiwibGV0IGRvbSA9IHJlcXVpcmUoJ2RvbWluYW50Jyk7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9ICgpID0+IGRvbS5odG1sKGBcclxuICA8c3ZnIHdpZHRoPVwiMTVweFwiIGhlaWdodD1cIjE1cHhcIiB4PVwiMHB4XCIgeT1cIjBweFwiIHZpZXdCb3g9XCIwIDAgNDU5IDQ1OVwiIHhtbDpzcGFjZT1cInByZXNlcnZlXCI+XHJcbiAgICA8Zz5cclxuICAgICAgPGc+XHJcbiAgICAgICAgPHBhdGggZD1cIk0wLDM4Mi41aDQ1OXYtNTFIMFYzODIuNXogTTAsMjU1aDQ1OXYtNTFIMFYyNTV6IE0wLDc2LjV2NTFoNDU5di01MUgwelwiIC8+XHJcbiAgICAgIDwvZz5cclxuICAgIDwvZz5cclxuICA8L3N2Zz5cclxuYCk7XHJcbiJdfQ==
