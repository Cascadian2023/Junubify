export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'Junubify API',
    timestamp: new Date().toISOString(),
  });
}
