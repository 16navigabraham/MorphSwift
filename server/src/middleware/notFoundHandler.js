export const notFoundHandler = (_request, response, _next) => {
  response.status(404).json({
    error: 'Not Found',
    message: 'The requested API route does not exist.',
  });
};