// Erro de negócio com status HTTP e código estável para o handler central.
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly codigo?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
