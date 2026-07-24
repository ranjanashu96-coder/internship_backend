import multer from "multer";
export const notFound = (req, res) => res.status(404).json({ success: false, data: {}, message: `Route not found: ${req.method} ${req.originalUrl}` });
export const errorHandler = (err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  res.status(status).json({ success: false, data: err.data || {}, message: err.message || "Internal server error" });
};
