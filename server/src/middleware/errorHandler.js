export const errorHandler = (error, _request, response, _next) => {
  console.error(error);

  const statusCode = Number(error?.statusCode ?? error?.status ?? 500);
  const message = error?.message ?? 'Internal Server Error';

  response.status(statusCode).json({
    error: message,
    ...(error?.details ? { details: error.details } : {}),
  });
};