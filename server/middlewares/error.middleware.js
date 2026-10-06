// Last stop for any error a route throws. Logs the error on the server and
// sends a safe message, never the error itself, which could contain email text.
const errorMiddleware = (err, req, res, next) => {
  console.error(err);

  return res.status(err.status || 500).json({
    message: err.expose ? err.message : "Internal Server Error",
  });
};

export default errorMiddleware;
