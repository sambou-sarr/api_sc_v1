import { Response } from "express";

export const responseSuccess = (
  res: Response,
  data: any,
  status: number,
  message?: string
) => {
  return res.status(status).json({ succes: "ok", message, data });
};
