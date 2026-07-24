export const ok = (res, data = {}, message = "Success", status = 200) => res.status(status).json({ success: true, data, message });
export const fail = (res, message = "Request failed", status = 400, data = {}) => res.status(status).json({ success: false, data, message });
export class AppError extends Error { constructor(message, status = 500, data = {}) { super(message); this.status = status; this.data = data; } }
