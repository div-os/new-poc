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
