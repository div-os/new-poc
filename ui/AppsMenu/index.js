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
