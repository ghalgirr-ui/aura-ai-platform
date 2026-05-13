const { validationResult } = require("express-validator");

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const formatted = errors.array().map((err) => ({ field: err.param, message: err.msg }));
  return res.status(422).json({ errors: formatted });
};

module.exports = { validateRequest };
