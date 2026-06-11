const { messagePage } = require('./sven/lib/html');

exports.handler = async () => messagePage('Credits purchased', 'Return to Telegram and send /credits. Stripe may take a moment to confirm.');

