// Vercel has no writable disk, so the backup feature only exists in the local app.
// The UI hides "Save backup" off-localhost; this endpoint keeps the API honest if called directly.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Use POST with the course JSON body.' });
    return;
  }
  res.status(501).json({
    ok: false,
    error: 'Backups need the local app: run "node server.js" and open http://localhost:4321.'
  });
};
