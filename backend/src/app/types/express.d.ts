declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        tipo: "admin" | "usuario";
      };
    }
  }
}

export {};
