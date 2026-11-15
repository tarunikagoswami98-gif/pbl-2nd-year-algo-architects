// metroController.js - validates request data, then calls the C++ engine.
const engine = require('../services/engineService');

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

// Wrap async handlers so errors reach the Express error handler.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const STATION_ID = /^[A-Za-z0-9_-]{1,10}$/;

exports.health = wrap(async (req, res) => {
  res.json({ status: 'ok', engineBuilt: require('fs').existsSync(engine.ENGINE) });
});

exports.getNetwork = wrap(async (req, res) => res.json(await engine.getNetwork()));
exports.getStations = wrap(async (req, res) => res.json(await engine.getStations()));

exports.findRoute = wrap(async (req, res) => {
  const { source, destination, passengers = 1, commit = false } = req.body || {};
  if (!STATION_ID.test(String(source || ''))) throw badRequest('source station is required');
  if (!STATION_ID.test(String(destination || ''))) throw badRequest('destination station is required');
  if (source === destination) throw badRequest('Source and destination must be different');
  const n = Number(passengers);
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw badRequest('passengers must be a whole number between 1 and 10000');
  res.json(await engine.findRoute(source, destination, n, commit === true));
});

exports.advanceTime = wrap(async (req, res) => res.json(await engine.advanceTime()));
exports.reset = wrap(async (req, res) => res.json(await engine.reset()));

exports.simulate = wrap(async (req, res) => {
  const { groups = 300, seed = 42 } = req.body || {};
  const g = Number(groups), s = Number(seed);
  if (!Number.isInteger(g) || g < 10 || g > 3000) throw badRequest('groups must be a whole number between 10 and 3000');
  if (!Number.isInteger(s) || s < 0) throw badRequest('seed must be a non-negative whole number');
  res.json(await engine.simulate(g, s));
});
