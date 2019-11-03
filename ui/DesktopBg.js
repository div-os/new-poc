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
