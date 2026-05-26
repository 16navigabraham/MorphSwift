export const getHealth = (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'morphswift-server',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};