/* Clear the session cookie and return to the app (which will re-prompt). */
'use strict';
const { cookie } = require('../_lib/session.js');

module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', [cookie('hc_session', '', { expire: true })]);
  res.statusCode = 302;
  res.setHeader('Location', '/');
  res.end();
};
