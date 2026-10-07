// Last stop for any error a route throws. Logs the error on the server and
// sends a safe message, never the error itself, which could contain email text.
const isDatabaseError = (err) => /^Mongo/.test(err.name ?? "") || /^Mongo/.test(err.cause?.name ?? "");

const errorMiddleware = (err, req, res, next) => {
  console.error(err);

  if (isDatabaseError(err)) {
    return res.status(503).json({ message: "Mailmind can't reach its database right now. Please try again in a minute." });
  }

  return res.status(err.status || 500).json({
    message: err.expose ? err.message : "Something went wrong on our side. Please try again.",
  });
};

export default errorMiddleware;
