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
