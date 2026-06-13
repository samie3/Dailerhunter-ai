const { createLogger, format, transports } = require("winston");
module.exports = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console({ format: format.combine(format.colorize(), format.simple()) })],
});
