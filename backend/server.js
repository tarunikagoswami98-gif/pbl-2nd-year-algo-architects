// server.js - Express app: serves the frontend and the REST API.
const express = require('express');
const path = require('path');
const metroRoutes = require('./routes/metroRoutes');

const app = express();
const FRONTEND = path.join(__dirname, '..', 'frontend');

app.use(express.json());
app.use('/api', metroRoutes);

// Chart.js is served locally (installed by npm) so the dashboard also works offline.
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));
app.use(express.static(FRONTEND));

// Unknown API URL -> JSON 404
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API endpoint' }));

// Central error handler: always answer with JSON { error }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Metro Crowd Optimisation running at http://localhost:${PORT}`));
}

module.exports = app;
