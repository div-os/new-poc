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
