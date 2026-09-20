// Acrescenta à requisição Express os dados do usuário autenticado pelo middleware.
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
