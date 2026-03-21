import db from "../db.server";
// Trivial change to retrigger Vite

export type LogLevel = "info" | "error" | "warn";

export const logger = {
  async info(message: string, details?: any, shop?: string) {
    return this.log("info", message, details, shop);
  },

  async warn(message: string, details?: any, shop?: string) {
    return this.log("warn", message, details, shop);
  },

  async error(message: string, details?: any, shop?: string) {
    return this.log("error", message, details, shop);
  },

  async log(level: LogLevel, message: string, details?: any, shop?: string) {
    try {
      const detailsString = details 
        ? (typeof details === "string" ? details : JSON.stringify(details, null, 2))
        : null;

      console.log(`[${level.toUpperCase()}] ${message}`, details || "");

      return await db.log.create({
        data: {
          level,
          message,
          details: detailsString,
          shop,
        },
      });
    } catch (e) {
      console.error("Failed to write to Log table:", e);
    }
  },
};
