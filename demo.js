let Desktop = require('./ui/Desktop');

window.dom = require('dominant');

window.divos = {};
divos.ui = {};

addEventListener('DOMContentLoaded', () => {
  document.body.append(divos.ui.desktop = Desktop());
});
