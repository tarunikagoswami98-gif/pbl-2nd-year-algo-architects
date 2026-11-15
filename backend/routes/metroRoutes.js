// metroRoutes.js - REST API endpoints.
const express = require('express');
const c = require('../controllers/metroController');

const router = express.Router();

router.get('/health', c.health);
router.get('/network', c.getNetwork);       // stations, lines, edges + live crowd state
router.get('/stations', c.getStations);     // live crowd state only
router.post('/route', c.findRoute);         // { source, destination, passengers, commit }
router.post('/tick', c.advanceTime);        // one time step: passengers leave stations
router.post('/reset', c.reset);             // back to the baseline crowd
router.post('/simulate', c.simulate);       // { groups, seed } - fastest vs crowd-aware comparison

module.exports = router;
