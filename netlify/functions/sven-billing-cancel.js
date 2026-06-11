const { messagePage } = require('./sven/lib/html');

exports.handler = async () => messagePage('Checkout cancelled', 'No credits were added.');

